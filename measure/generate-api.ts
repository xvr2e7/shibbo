// Measure a hosted model on the same matched topics as the local runs: same titles, same target lengths, same prompt.
//
//   npx tsx measure/generate-api.ts --model gpt-6.1-sol [--topics 300] [--budget 20] [--dry-run]
//   npx tsx measure/generate-api.ts --plan [--topics 300]        cost of every model in measure/api-models.yaml
//
// Models and prices live in measure/api-models.yaml. Keys come from the environment or from .env at the repo root
// (ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY); .env is git-ignored and never printed.
// Anthropic and OpenAI runs go through their batch APIs at half price and finish within 24 hours: the first call
// submits, later calls with the same arguments collect. OpenRouter runs go request by request, four at a time.
// Output: measure/runs/api-<id>/matched.jsonl, the same shape as generate-local.ts, so import_local.py and
// dense_map.py can read it. Article text stays local; only derived rates get published.
// --budget stops before sending more requests once the estimated spend would pass the cap. Start with --topics 10
// to check tokens per word, then run the full set.
import { createReadStream, existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { root } from "../src/registry.js";

const { values } = parseArgs({ options: {
  model: { type: "string" }, topics: { type: "string", default: "300" }, budget: { type: "string" },
  articles: { type: "string" }, "dry-run": { type: "boolean", default: false }, plan: { type: "boolean", default: false },
  direct: { type: "boolean", default: false },
} });
const R = root();
interface Spec { id: string; provider: "anthropic" | "openai" | "openrouter"; api: string; name: string; price: [number, number]; batch: boolean; tokens_per_word: number; note?: string }
const specs = YAML.parse(readFileSync(join(R, "measure/api-models.yaml"), "utf8")) as Spec[];
const want = +values.topics!;
const AVG_WORDS = 850; // typical target length of the matched topics

const cost = (s: Spec, words: number, batch = s.batch && !values.direct) => {
  const out = words * s.tokens_per_word, inp = 60;
  return ((inp * s.price[0] + out * s.price[1]) / 1e6) * (batch ? 0.5 : 1);
};

if (values.plan) {
  let total = 0;
  console.log(`Estimated cost of ${want} matched articles per model (about ${AVG_WORDS} words each):\n`);
  for (const s of specs) {
    const c = cost(s, want * AVG_WORDS);
    total += c;
    console.log(`${s.id.padEnd(18)} ${s.provider.padEnd(11)} ${s.batch ? "batch " : "direct"}  $${c.toFixed(2).padStart(6)}${s.note ? `   ${s.note}` : ""}`);
  }
  console.log(`\n${"total".padEnd(38)}$${total.toFixed(2).padStart(6)}`);
  process.exit(0);
}

const spec = specs.find((s) => s.id === values.model || s.api === values.model);
if (!spec) { console.error(`unknown model "${values.model}". Known: ${specs.map((s) => s.id).join(", ")}`); process.exit(2); }

// Keys: environment first, then .env (KEY=VALUE lines).
const env = (k: string) => {
  if (process.env[k]) return process.env[k];
  const p = join(R, ".env");
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, "utf8").match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, "m"));
  return m?.[1].trim();
};

// Same held-out half and spread of topics as generate-local.ts, so every model answers the same titles.
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// measure/topics.jsonl pins the topic list every run so far has used (titles and lengths, no article text), so
// new runs match without Graphite's 200 MB file. Pass --articles to draw a fresh list from that file instead.
const topicsFile = join(R, "measure", "topics.jsonl");
const file = values.articles ?? join(R, ".cache/ai_tells_articles.jsonl.gz");
const picked: Array<{ url: string; title: string; words: number }> = [];
if (!values.articles && existsSync(topicsFile)) picked.push(...readFileSync(topicsFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).slice(0, want));
let i = 0;
if (!picked.length) for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()) })) {
  const d = JSON.parse(line);
  if (fnv(d.url) % 2 !== 1) continue;
  if (i++ % Math.max(1, Math.floor(5000 / want)) !== 0) continue;
  const human: string = d.human ?? "";
  const title = String(d.gpt41 ?? "").split("\n").map((l) => l.replace(/^#+\s*|\*\*/g, "").trim()).find((l) => l.length > 8 && l.length < 140);
  const words = human.split(/\s+/).filter(Boolean).length;
  if (!title || words < 300 || words > 2000) continue;
  picked.push({ url: d.url, title, words: Math.round(words / 50) * 50 });
  if (picked.length >= want) break;
}
const prompt = (t: { title: string; words: number }) => `Write a web article of about ${t.words} words with this title: ${t.title}\n\nWrite only the article.`;
const maxTokens = (t: { words: number }) => Math.max(4000, Math.round(t.words * spec.tokens_per_word * 3));

const dir = join(R, "measure", "runs", `api-${spec.id}`);
const out = join(dir, "matched.jsonl");
const pending = join(dir, "batch.json");
const done = new Set(existsSync(out) ? readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).topic) : []);
const todo = picked.filter((t) => !done.has(t.url));
const estimate = cost(spec, todo.reduce((s, t) => s + t.words, 0));
console.log(`${spec.name}: ${picked.length} topics, ${done.size} done, ${todo.length} to send, about $${estimate.toFixed(2)}${spec.batch && !values.direct ? " (batch)" : ""}`);
if (values["dry-run"]) { console.log(`first prompt:\n${prompt(todo[0] ?? picked[0])}`); process.exit(0); }
mkdirSync(dir, { recursive: true });
if (values.budget && estimate > +values.budget) { console.error(`estimate $${estimate.toFixed(2)} is over --budget ${values.budget}; lower --topics or raise the cap`); process.exit(1); }

let outTokens = 0, outWords = 0;
function save(t: { url: string; title: string; words: number }, text: string, stop: string, usage: unknown, tokens: number | undefined) {
  // An empty row would count as done; skip it so the next run asks again.
  if (!text.trim()) { console.error(`${t.title.slice(0, 50)}: empty reply, will retry on the next run`); return; }
  appendFileSync(out, JSON.stringify({ model: spec!.api, topic: t.url, title: t.title, target_words: t.words, text, stop_reason: stop, usage }) + "\n");
  outTokens += tokens ?? 0; outWords += text.split(/\s+/).filter(Boolean).length;
}
const byId = new Map(todo.map((t) => [`t${fnv(t.url).toString(36)}`, t]));

async function anthropic() {
  const key = env("ANTHROPIC_API_KEY"); if (!key) throw new Error("ANTHROPIC_API_KEY is not set (environment or .env)");
  const h = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  if (!existsSync(pending)) {
    const requests = [...byId].map(([custom_id, t]) => ({ custom_id, params: { model: spec!.api, max_tokens: maxTokens(t), messages: [{ role: "user", content: prompt(t) }] } }));
    const r = await fetch("https://api.anthropic.com/v1/messages/batches", { method: "POST", headers: h, body: JSON.stringify({ requests }) });
    if (!r.ok) throw new Error(`batch create ${r.status}: ${await r.text()}`);
    const b = await r.json();
    writeFileSync(pending, JSON.stringify({ provider: "anthropic", id: b.id, created: new Date().toISOString() }));
    console.log(`submitted batch ${b.id} (${requests.length} requests). Run the same command later to collect.`);
    return;
  }
  const { id } = JSON.parse(readFileSync(pending, "utf8"));
  const b = await (await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers: h })).json();
  if (b.processing_status !== "ended") { console.log(`batch ${id}: ${b.processing_status}`, b.request_counts); return; }
  const lines = (await (await fetch(b.results_url, { headers: h })).text()).trim().split("\n");
  for (const l of lines) {
    const r = JSON.parse(l); const t = byId.get(r.custom_id); if (!t) continue;
    if (r.result.type !== "succeeded") { console.error(`${r.custom_id}: ${r.result.type}`); continue; }
    const m = r.result.message;
    save(t, m.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"), m.stop_reason, m.usage, m.usage?.output_tokens);
  }
  writeFileSync(pending.replace(".json", `-${id}.done.json`), JSON.stringify(b)); writeFileSync(pending, "");
  await import("node:fs").then((fs) => fs.rmSync(pending));
}

async function openai() {
  const key = env("OPENAI_API_KEY"); if (!key) throw new Error("OPENAI_API_KEY is not set (environment or .env)");
  const auth = { authorization: `Bearer ${key}` };
  if (!existsSync(pending)) {
    const jsonl = [...byId].map(([custom_id, t]) => JSON.stringify({ custom_id, method: "POST", url: "/v1/chat/completions",
      body: { model: spec!.api, max_completion_tokens: maxTokens(t), messages: [{ role: "user", content: prompt(t) }] } })).join("\n");
    const form = new FormData();
    form.append("purpose", "batch");
    form.append("file", new Blob([jsonl], { type: "application/jsonl" }), "requests.jsonl");
    const f = await fetch("https://api.openai.com/v1/files", { method: "POST", headers: auth, body: form });
    if (!f.ok) throw new Error(`file upload ${f.status}: ${await f.text()}`);
    const fileId = (await f.json()).id;
    const r = await fetch("https://api.openai.com/v1/batches", { method: "POST", headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ input_file_id: fileId, endpoint: "/v1/chat/completions", completion_window: "24h" }) });
    if (!r.ok) throw new Error(`batch create ${r.status}: ${await r.text()}`);
    const b = await r.json();
    writeFileSync(pending, JSON.stringify({ provider: "openai", id: b.id, created: new Date().toISOString() }));
    console.log(`submitted batch ${b.id} (${byId.size} requests). Run the same command later to collect.`);
    return;
  }
  const { id } = JSON.parse(readFileSync(pending, "utf8"));
  const b = await (await fetch(`https://api.openai.com/v1/batches/${id}`, { headers: auth })).json();
  if (b.status !== "completed") { console.log(`batch ${id}: ${b.status}`, b.request_counts); if (!["failed", "expired", "cancelled"].includes(b.status)) return; }
  if (b.output_file_id) {
    const lines = (await (await fetch(`https://api.openai.com/v1/files/${b.output_file_id}/content`, { headers: auth })).text()).trim().split("\n");
    for (const l of lines) {
      const r = JSON.parse(l); const t = byId.get(r.custom_id); if (!t || r.error || r.response?.status_code !== 200) { if (t) console.error(`${r.custom_id}: ${JSON.stringify(r.error ?? r.response?.status_code)}`); continue; }
      const c = r.response.body.choices[0];
      save(t, c.message.content ?? "", c.finish_reason === "length" ? "max_tokens" : "end_turn", r.response.body.usage, r.response.body.usage?.completion_tokens);
    }
  }
  writeFileSync(pending.replace(".json", `-${id}.done.json`), JSON.stringify(b));
  await import("node:fs").then((fs) => fs.rmSync(pending));
}

/** POST JSON. Retries 429, 5xx and dropped connections with backoff, then throws. The error carries the status and the start of the body, never headers. */
async function post(url: string, headers: Record<string, string>, body: unknown) {
  for (let n = 0; ; n++) {
    let r: Response | null = null, err = "";
    try { r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    if (r?.ok) return r.json();
    if (r) err = `HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`;
    if ((r && r.status !== 429 && r.status < 500) || n >= 3) throw new Error(err);
    const wait = Number(r?.headers.get("retry-after")) || 2 ** n * 2;
    await new Promise((d) => setTimeout(d, Math.min(wait, 60) * 1000));
  }
}

async function openrouter() {
  const key = env("OPENROUTER_API_KEY"); if (!key) throw new Error("OPENROUTER_API_KEY is not set (environment or .env)");
  const queue = [...todo];
  let spent = 0;
  const cap = values.budget ? +values.budget : Infinity;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const t = queue.shift()!;
      if (spent > cap) return;
      let j;
      try {
        j = await post("https://openrouter.ai/api/v1/chat/completions", { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "shibbo measure" },
          { model: spec!.api, max_tokens: maxTokens(t), messages: [{ role: "user", content: prompt(t) }], usage: { include: true } });
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        console.error(`${t.title.slice(0, 50)}: ${why}`);
        if (/^HTTP 40[13]\b/.test(why)) { console.error("stopping: the key was refused"); queue.length = 0; }
        continue;
      }
      const c = j.choices?.[0];
      if (!c?.message?.content) { console.error(`${t.title.slice(0, 50)}: empty reply`); continue; }
      spent += j.usage?.cost ?? 0;
      save(t, c.message.content, c.finish_reason === "length" ? "max_tokens" : "end_turn", j.usage, j.usage?.completion_tokens);
      console.log(`$${spent.toFixed(2).padStart(6)}  ${t.title.slice(0, 70)}`);
    }
  }));
}

await ({ anthropic, openai, openrouter }[spec.provider])();
if (outWords) console.log(`saved ${out}\noutput tokens per word this run: ${(outTokens / outWords).toFixed(2)} (planned ${spec.tokens_per_word})`);
