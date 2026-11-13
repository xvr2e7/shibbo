// Held-out evaluation on Graphite's matched articles (same topic, human vs. every measured model).
//
//   npm run eval -- <path/to/ai_tells_articles.jsonl.gz> [--limit N]
//
// Topics are split 50/50 by a hash of the URL. Everything tunable uses the train half only:
//   - a lexicon rebuilt from train n-gram counts (the shipped lexicon saw all articles, so it is NOT used here)
//   - the score scale (HALF_LIFE)
//   - per-rule firing rates used to decide which rules need work
// Reported numbers come from the test half. The article texts are not redistributed; only aggregates are written.
import { writeFileSync, createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { check, setHalfLife, setOwnModelBoost, band } from "../src/check.js";
import { tokens } from "../src/text.js";
import { models, root, type LexEntry } from "../src/registry.js";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--limit") ?? join(root(), ".cache/ai_tells_articles.jsonl.gz");
const limit = args.includes("--limit") ? +args[args.indexOf("--limit") + 1] : Infinity;

const ms = models().models.filter((m) => m.graphite); // Graphite-measured models only; shibbo's API runs come from data/measured/api.json
const corpora = ["human", ...ms.map((m) => m.graphite!)];
const idOf = (slug: string) => (slug === "human" ? "human" : ms.find((m) => m.graphite === slug)!.id);

type Doc = Record<string, string> & { url: string };
const t0 = Date.now();
const docs: Doc[] = [];
for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  docs.push(JSON.parse(line));
  if (docs.length >= limit) break;
}
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const train = docs.filter((d) => fnv(d.url) % 2 === 0);
const test = docs.filter((d) => fnv(d.url) % 2 === 1);
console.error(`loaded ${docs.length} topics (${train.length} train / ${test.length} test) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ───────── 1. lexicon from train n-grams (n = 1..3, no frames) ─────────

function ngrams(text: string): Map<string, number> {
  const toks = tokens(text);
  const out = new Map<string, number>();
  let seg = 0;
  const segs: number[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (i > 0 && /[.!?]|\n/.test(text.slice(toks[i - 1].end, toks[i].start))) seg++;
    segs.push(seg);
  }
  for (let i = 0; i < toks.length; i++) {
    let key = "";
    for (let n = 1; n <= 3 && i + n <= toks.length; n++) {
      if (segs[i + n - 1] !== segs[i]) break;
      key = n === 1 ? toks[i].t : key + " " + toks[i + n - 1].t;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

function countCorpus(slug: string, keep?: Set<string>) {
  const count = new Map<string, number>();
  const df = new Map<string, number>();
  const positions = [0, 0, 0, 0];
  for (const d of train) {
    const text = d[slug];
    if (!text) continue;
    const g = ngrams(text);
    const n = tokens(text).length;
    for (let k = 1; k <= 3; k++) positions[k] += Math.max(0, n - k + 1);
    for (const [k, c] of g) {
      if (keep && !keep.has(k)) continue;
      count.set(k, (count.get(k) ?? 0) + c);
      df.set(k, (df.get(k) ?? 0) + 1);
    }
  }
  return { count, df, positions };
}

const MIN_DF = 20; // half of the importer's 40, since train is half the data
const lexicon: Record<string, LexEntry[]> = {};
const candidates = new Map<string, Array<{ term: string; count: number; df: number; pos: number }>>();
for (const slug of corpora.slice(1)) {
  const c = countCorpus(slug);
  const list: Array<{ term: string; count: number; df: number; pos: number }> = [];
  for (const [term, df] of c.df) if (df >= MIN_DF) list.push({ term, count: c.count.get(term)!, df, pos: c.positions[term.split(" ").length] });
  candidates.set(slug, list);
  console.error(`  counted ${slug}: ${list.length} candidate n-grams`);
}
const keep = new Set([...candidates.values()].flat().map((x) => x.term));
const human = countCorpus("human", keep);
for (const slug of corpora.slice(1)) {
  const entries: Array<LexEntry & { score: number }> = [];
  for (const x of candidates.get(slug)!) {
    const n = x.term.split(" ").length;
    const hc = human.count.get(x.term) ?? 0;
    const mRate = x.count / x.pos;
    const hRate = (hc || 0.5) / human.positions[n];
    const ratio = mRate / hRate;
    if (ratio < 8) continue;
    if (n === 1 && !(ratio >= 15 && x.df >= 2 * MIN_DF)) continue;
    entries.push({ term: x.term, kind: "ngram", ratio: Math.round(ratio * 10) / 10, articles: x.df, score: Math.log(Math.min(ratio, 500)) * Math.log(x.df) });
  }
  entries.sort((a, b) => b.score - a.score);
  lexicon[idOf(slug)] = entries.slice(0, 400).map(({ score, ...e }) => e);
}
console.error(`train lexicon built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ───────── 2. score every article ─────────

interface Row { corpus: string; words: number; penalty: number; per1k: number; fired: Set<string> }
/**
 * modelAware = false: every article is checked with no model (the default CLI behavior).
 * modelAware = true: for each model M, M's articles AND the human articles are checked with model=M,
 * so the human side gets the same boost. Human rows are tagged "human@M".
 */
function run(set: Doc[], modelAware = false): Row[] {
  const rows: Row[] = [];
  const score1 = (text: string, corpus: string, model: string | null) => {
    const r = check(text, "-", { kind: "text", lexiconData: lexicon, model });
    const counted = r.findings.filter((f) => f.counted);
    rows.push({ corpus, words: r.words, penalty: r.penalty, per1k: (r.penalty / Math.max(r.words, 150)) * 1000, fired: new Set(counted.map((f) => (f.origin === "lexicon" ? "lexicon" : f.id))) });
  };
  for (const d of set) {
    for (const slug of corpora) {
      const text = d[slug];
      if (!text) continue;
      const id = idOf(slug);
      if (!modelAware) score1(text, id, null);
      else if (id === "human") for (const m of ms) score1(text, `human@${m.id}`, m.id);
      else score1(text, id, id);
    }
  }
  return rows;
}

const trainRows = run(train);
const humanTrain = trainRows.filter((r) => r.corpus === "human").map((r) => r.per1k).sort((a, b) => a - b);
const quant = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
// Calibrate: 90% of human train articles should score "clean" (>= 80).
const halfLife = Math.max(1, quant(humanTrain, 0.9) / Math.log2(100 / 80));
setHalfLife(halfLife);
console.error(`calibrated HALF_LIFE = ${halfLife.toFixed(2)} (human train p90 = ${quant(humanTrain, 0.9).toFixed(2)} pts/1k)`);

const score = (per1k: number) => Math.round(100 * Math.pow(0.5, per1k / halfLife));

// Per-rule firing on TRAIN: share of human vs. model articles where a rule counted.
const ruleStats: Record<string, { human: number; model: number; lift: number }> = {};
{
  const h = trainRows.filter((r) => r.corpus === "human");
  const m = trainRows.filter((r) => r.corpus !== "human");
  const ids = new Set(trainRows.flatMap((r) => [...r.fired]));
  for (const id of ids) {
    const hr = h.filter((r) => r.fired.has(id)).length / h.length;
    const mr = m.filter((r) => r.fired.has(id)).length / m.length;
    ruleStats[id] = { human: +hr.toFixed(4), model: +mr.toFixed(4), lift: +(mr / Math.max(hr, 1e-4)).toFixed(2) };
  }
}

function auc(pos: number[], neg: number[]): number {
  // P(model article has a higher penalty than the human article); ties count half.
  const all = [...pos.map((v) => ({ v, p: 1 })), ...neg.map((v) => ({ v, p: 0 }))].sort((a, b) => a.v - b.v);
  let rank = 0, sumPos = 0, i = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length && all[j].v === all[i].v) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (all[k].p) sumPos += avg;
    rank = j;
    i = j;
  }
  return (sumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

function summarize(rows: Row[]) {
  const humanFor = (id: string) => {
    const tagged = rows.filter((r) => r.corpus === `human@${id}`);
    return tagged.length ? tagged : rows.filter((r) => r.corpus === "human");
  };
  const out: Record<string, { auc: number; flagged: number; median: number; human_flagged?: number }> = {};
  const h0 = rows.filter((r) => r.corpus === "human" || r.corpus.startsWith("human@"));
  const hs0 = rows.some((r) => r.corpus === "human") ? rows.filter((r) => r.corpus === "human").map((r) => r.per1k) : h0.map((r) => r.per1k);
  out.human = { auc: 0.5, flagged: +(hs0.filter((v) => score(v) < 80).length / hs0.length).toFixed(3), median: score(quant([...hs0].sort((a, b) => a - b), 0.5)) };
  for (const m of ms) {
    const mr = rows.filter((r) => r.corpus === m.id);
    const hs = humanFor(m.id).map((r) => r.per1k);
    const ps = mr.map((r) => r.per1k);
    out[m.id] = {
      auc: +auc(ps, hs).toFixed(3),
      flagged: +(mr.filter((r) => score(r.per1k) < 80).length / mr.length).toFixed(3),
      median: score(quant([...ps].sort((a, b) => a - b), 0.5)),
      human_flagged: +(hs.filter((v) => score(v) < 80).length / hs.length).toFixed(3),
    };
  }
  return out;
}

// Choose the own-model boost on a train subset (mean AUC across models).
const meanAuc = (rows: Row[]) => { const s = summarize(rows); return ms.reduce((a, m) => a + s[m.id].auc, 0) / ms.length; };
const tuneSet = train.slice(0, 800);
let bestBoost = 1, bestAuc = -1;
const boostTrials: Record<string, number> = {};
for (const b of [1, 2, 4, 8, 16]) {
  setOwnModelBoost(b);
  const a = meanAuc(run(tuneSet, true));
  boostTrials[String(b)] = +a.toFixed(4);
  if (a > bestAuc) { bestAuc = a; bestBoost = b; }
}
setOwnModelBoost(bestBoost);
console.error(`own-model boost: ${JSON.stringify(boostTrials)} -> ${bestBoost}`);

const testRows = run(test);
const testAware = run(test, true);
// Ablation: registry rules only (no lexicon).
const registryOnly = (rows: Row[]) => rows; // placeholder for symmetry in output
const testNoLex: Row[] = [];
for (const d of test) for (const slug of corpora) {
  const text = d[slug];
  if (!text) continue;
  const r = check(text, "-", { kind: "text", lexicon: false });
  testNoLex.push({ corpus: idOf(slug), words: r.words, penalty: r.penalty, per1k: (r.penalty / Math.max(r.words, 150)) * 1000, fired: new Set() });
}
void registryOnly;

const result = {
  generated: new Date().toISOString().slice(0, 10),
  data: `Graphite AI Tells articles (${docs.length.toLocaleString("en")} topics; human vs. ${ms.length} models). Split 50/50 by URL hash.`,
  topics: { train: train.length, test: test.length },
  half_life: +halfLife.toFixed(2),
  own_model_boost: bestBoost,
  own_model_boost_trials_train: boostTrials,
  note: "AUC = chance a model article gets a higher penalty than a human article on the same test set. flagged = share scoring below 80. Registry rules were written after viewing Graphite's full-data tell lists, so registry-only numbers are optimistic; the lexicon is rebuilt from the train half only.",
  test: { default: summarize(testRows), model_aware: summarize(testAware), registry_only: summarize(testNoLex) },
  rules_train: ruleStats,
};
writeFileSync(join(root(), "data/measured/eval.json"), JSON.stringify(result, null, 1));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`\nHALF_LIFE ${halfLife.toFixed(2)}   test topics ${test.length}\n`);
console.log("model".padEnd(18), "AUC dflt", "AUC aware", "AUC reg", "flag dflt", "flag aware", "median");
for (const id of ["human", ...ms.map((m) => m.id)]) {
  const a = result.test.default[id], b = result.test.model_aware[id], c = result.test.registry_only[id];
  console.log(id.padEnd(18), a.auc.toFixed(3).padStart(8), b.auc.toFixed(3).padStart(9), c.auc.toFixed(3).padStart(7), pct(a.flagged).padStart(9), pct(b.flagged).padStart(10), String(a.median).padStart(6));
}
console.log("\nrules by human false-fire rate (train):");
for (const [id, s] of Object.entries(ruleStats).sort((a, b) => b[1].human - a[1].human).slice(0, 25)) {
  console.log(`  ${id.padEnd(26)} human ${pct(s.human).padStart(6)}  model ${pct(s.model).padStart(6)}  lift ${s.lift}`);
}
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
void band;
