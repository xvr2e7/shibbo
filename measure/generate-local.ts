// Curate our own measurements with local open-weight models (Ollama), on topics matched to human articles.
//
//   npx tsx measure/generate-local.ts --model llama3.1:8b [--topics 60] [--articles .cache/ai_tells_articles.jsonl.gz]
//
// Each output answers the same title, at the same length, as one human article from the held-out half of
// Graphite's topics. The human article stays local (publishers own it); we publish only derived rates.
// Runs are resumable: topics already in the output file are skipped.
import { createReadStream, existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { root } from "../src/registry.js";

const { values } = parseArgs({ options: { model: { type: "string" }, topics: { type: "string", default: "60" }, articles: { type: "string" }, host: { type: "string", default: "http://localhost:11434" } } });
if (!values.model) { console.error("usage: generate-local.ts --model <ollama model> [--topics N]"); process.exit(2); }
const R = root();
const file = values.articles ?? join(R, ".cache/ai_tells_articles.jsonl.gz");
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Same held-out half as the evaluation and the arena, then a fixed spread of topics within it.
const picked: Array<{ url: string; title: string; words: number }> = [];
const want = +values.topics!;
let i = 0;
for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()) })) {
  const d = JSON.parse(line);
  if (fnv(d.url) % 2 !== 1) continue;
  // Spread evenly across the ~5,000 held-out topics; the same topics for every model, in the same order.
  if (i++ % Math.max(1, Math.floor(5000 / want)) !== 0) continue;
  const human: string = d.human ?? "";
  // Graphite gave every model the same summary of this topic; GPT-4.1's article opens with a clean title for it.
  const title = String(d.gpt41 ?? "").split("\n").map((l) => l.replace(/^#+\s*|\*\*/g, "").trim()).find((l) => l.length > 8 && l.length < 140);
  const words = human.split(/\s+/).filter(Boolean).length;
  if (!title || words < 300 || words > 2000) continue;
  picked.push({ url: d.url, title, words: Math.round(words / 50) * 50 });
  if (picked.length >= want) break;
}

const safe = values.model!.replace(/[^\w.-]+/g, "_");
const outDir = join(R, "measure", "runs", `local-${safe}`);
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "matched.jsonl");
const done = new Set(existsSync(out) ? readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).topic) : []);

for (const t of picked) {
  if (done.has(t.url)) continue;
  const prompt = `Write a web article of about ${t.words} words with this title: ${t.title}\n\nWrite only the article.`;
  const t0 = Date.now();
  const res = await fetch(`${values.host}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: values.model, prompt, stream: false, options: { num_predict: Math.round(t.words * 2.2), seed: 7 } }),
  });
  if (!res.ok) { console.error(`ollama error ${res.status}: ${await res.text()}`); process.exit(1); }
  const j = (await res.json()) as { response: string; done_reason?: string; eval_count?: number };
  appendFileSync(out, JSON.stringify({ model: values.model, topic: t.url, title: t.title, target_words: t.words, text: j.response, stop_reason: j.done_reason === "length" ? "max_tokens" : "end_turn", tokens: j.eval_count }) + "\n");
  console.log(`${String(((Date.now() - t0) / 1000).toFixed(0)).padStart(4)}s  ${t.title.slice(0, 70)}`);
}
console.log(`saved ${out}`);
