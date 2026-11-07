// Compare a run of model outputs with human writing and with the previous model in its family.
//
//   npx tsx measure/analyze.ts --baseline <ai_tells_articles.jsonl.gz>     # once: build .cache/human-ngrams.json
//   npx tsx measure/analyze.ts measure/runs/claude-opus-5-5/2026-11-07.jsonl [--as claude-opus-5-5]
//
// Writes measure/reports/<model>-<date>.md: registry tells (vs. people and vs. the previous model),
// phrases that look like new tells, and old tells this model dropped.
// The human baseline is n-gram counts from Graphite's human articles. Those texts belong to their publishers,
// so the counts stay in .cache and are not committed.
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join, basename } from "node:path";
import { parseArgs } from "node:util";
import { tokens } from "../src/text.js";
import { tells, graphite, resolveModel, models, root } from "../src/registry.js";

const R = root();
const BASE = join(R, ".cache", "human-ngrams.json");
const { values, positionals } = parseArgs({ allowPositionals: true, options: { baseline: { type: "string" }, as: { type: "string" }, min: { type: "string", default: "0.1" } } });

function grams(text: string, into: Map<string, number>, seen?: Set<string>) {
  const toks = tokens(text);
  let seg = 0;
  const segs = toks.map((t, i) => (i > 0 && /[.!?\n]/.test(text.slice(toks[i - 1].end, t.start)) ? ++seg : seg));
  let n = 0;
  for (let i = 0; i < toks.length; i++) {
    let key = "";
    for (let k = 1; k <= 3 && i + k <= toks.length; k++) {
      if (segs[i + k - 1] !== segs[i]) break;
      key = k === 1 ? toks[i].t : `${key} ${toks[i + k - 1].t}`;
      into.set(key, (into.get(key) ?? 0) + 1);
      seen?.add(key);
    }
    n++;
  }
  return n;
}

if (values.baseline) {
  const counts = new Map<string, number>();
  let positions = 0, docs = 0;
  for await (const line of createInterface({ input: createReadStream(values.baseline).pipe(createGunzip()) })) {
    const d = JSON.parse(line);
    if (!d.human) continue;
    positions += grams(d.human, counts);
    docs++;
  }
  const kept: Record<string, number> = {};
  for (const [k, v] of counts) if (v >= 3) kept[k] = v;
  mkdirSync(join(R, ".cache"), { recursive: true });
  writeFileSync(BASE, JSON.stringify({ docs, positions, counts: kept }));
  console.log(`baseline: ${docs} human articles, ${positions.toLocaleString("en")} tokens, ${Object.keys(kept).length.toLocaleString("en")} n-grams -> ${BASE}`);
  process.exit(0);
}

if (!positionals.length) { console.error("usage: analyze.ts <run.jsonl ...> [--as model-id] | --baseline <articles.jsonl.gz>"); process.exit(2); }
if (!existsSync(BASE)) { console.error(`no human baseline at ${BASE}; build it with --baseline <ai_tells_articles.jsonl.gz>`); process.exit(2); }
const base = JSON.parse(readFileSync(BASE, "utf8")) as { docs: number; positions: number; counts: Record<string, number> };

// ── load the run ──
const docs: string[] = [];
let modelId = values.as ?? "";
for (const f of positionals) for (const l of readFileSync(f, "utf8").trim().split("\n")) {
  if (!l.trim()) continue;
  const d = JSON.parse(l);
  if (d.stop_reason && d.stop_reason !== "end_turn" && d.stop_reason !== "max_tokens") continue;
  docs.push(d.text);
  modelId ||= d.model;
}
const counts = new Map<string, number>();
const df = new Map<string, number>();
let positions = 0;
for (const t of docs) {
  const seen = new Set<string>();
  positions += grams(t, counts, seen);
  for (const k of seen) df.set(k, (df.get(k) ?? 0) + 1);
}
const measured = resolveModel(modelId);
const fam = measured?.family;
const g = graphite();
// The previous model: the newest measured model in the family, unless the run IS that model.
const prev = fam ? models().models.filter((m) => m.family === fam && m.id !== modelId && !(values.as && m.id === values.as)).sort((a, b) => a.released.localeCompare(b.released)).at(-1) : undefined;

const rate = (c: number, n: number) => (c / n) * 1000;
const humanRate = (term: string) => rate(base.counts[term] ?? 0.5, base.positions);
const ratio = (term: string) => rate(counts.get(term) ?? 0, positions) / humanRate(term);
const fmt = (r: number) => (r >= 100 ? `${Math.round(r)}×` : r >= 10 ? `${r.toFixed(0)}×` : `${r.toFixed(1)}×`);

// ── registry tells with measured terms ──
const rows: string[] = [];
for (const t of tells()) {
  const terms = (t.measure?.graphite ?? []).filter((x) => !x.includes("_"));
  if (!terms.length) continue;
  const best = terms.map((term) => ({ term, r: ratio(term), c: counts.get(term) ?? 0 })).sort((a, b) => b.r - a.r)[0];
  const before = prev ? g?.tells[t.id]?.[prev.id]?.ratio ?? null : null;
  const trend = before === null ? (best.r >= 4 ? "new" : "") : best.r >= before * 1.5 ? "up" : best.r <= before / 1.5 ? "down" : "same";
  if (best.c === 0 && before === null) continue;
  const few = best.c < 3;
  rows.push(`| ${t.id} | "${best.term}" | ${best.c} | ${few ? `(${fmt(best.r)}, too few uses)` : fmt(best.r)} | ${before === null ? "–" : fmt(before)} | ${few ? "" : trend} |`);
}

// ── candidate new tells: multi-word phrases in >= min share of outputs, >= 8x the human rate ──
const minDocs = Math.max(3, Math.ceil(+values.min! * docs.length));
const known = new Set(prev && g ? g.models[prev.id].lexicon.map((e) => e.term) : []);
const registryTerms = new Set(tells().flatMap((t) => t.measure?.graphite ?? []));
const candidates = [...df.entries()]
  .filter(([k, d]) => d >= minDocs && k.includes(" ") && ratio(k) >= 8)
  .map(([k, d]) => ({ k, d, r: ratio(k), novel: !known.has(k) && !registryTerms.has(k) }))
  .sort((a, b) => Math.log(b.r) * Math.log(b.d) - Math.log(a.r) * Math.log(a.d))
  .slice(0, 40);

// ── old tells this model dropped: previous model's strongest phrases, now under 2x ──
const dropped = prev && g ? g.models[prev.id].top.filter((e) => e.kind === "ngram" && e.ratio >= 20 && ratio(e.term) < 2).slice(0, 20) : [];

const day = new Date().toISOString().slice(0, 10);
const report = `# ${modelId}: tells measured ${day}

${docs.length} outputs, ${positions.toLocaleString("en")} tokens. Human baseline: ${base.docs.toLocaleString("en")} articles (Graphite). ${prev ? `Compared with ${prev.name}, the newest measured model in the ${fam} family.` : "No earlier model in this family to compare with."}

Ratios divide this run's rate by the human rate. The prompts are matched in genre (web articles) but not in topic, so treat ratios under about 4× as noise.

## Registry tells

| Tell | Strongest phrase | Uses | vs. people | ${prev?.name ?? "previous"} | Change |
|---|---|---|---|---|---|
${rows.join("\n")}

## Candidate new tells

Phrases in at least ${minDocs} of ${docs.length} outputs at 8× the human rate or more. **New** marks phrases absent from both the registry and ${prev?.name ?? "the previous model"}'s measured list.

| Phrase | Outputs | vs. people | |
|---|---|---|---|
${candidates.map((c) => `| "${c.k}" | ${c.d} | ${fmt(c.r)} | ${c.novel ? "**new**" : ""} |`).join("\n")}

## Dropped

${dropped.length ? `Phrases ${prev!.name} used at 20× or more that this run uses under 2×:\n\n${dropped.map((e) => `- "${e.term}" (${prev!.name}: ${fmt(e.ratio)}, now ${fmt(ratio(e.term))})`).join("\n")}` : "Nothing to compare."}
`;
const outDir = join(R, "measure", "reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${basename(modelId)}-${day}.md`);
writeFileSync(outPath, report);
console.log(`report: ${outPath}\n  ${rows.length} registry tells, ${candidates.filter((c) => c.novel).length} new candidates, ${dropped.length} dropped`);
