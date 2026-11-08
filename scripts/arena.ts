// The tell arena: people and nine models on the same held-out topics.
//
//   npx tsx scripts/arena.ts <path/to/ai_tells_articles.jsonl.gz>   ->  data/measured/arena.json
//
// Each test topic stages a battle between every pair of writers (people count as a writer). The article
// with fewer tell points per 1,000 words wins; equal scores tie. Ratings come from a Bradley-Terry fit
// (the model behind arena-style Elo), shown on an Elo-like scale, with 95% intervals from resampling topics.
// The checker uses a phrase list rebuilt from the train half only, as in scripts/eval-graphite.ts.
import { writeFileSync, readFileSync, existsSync, createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { check } from "../src/check.js";
import { tokens } from "../src/text.js";
import { models, root, type LexEntry } from "../src/registry.js";

const file = process.argv[2] ?? join(root(), ".cache/ai_tells_articles.jsonl.gz");
const ms = models().models;
const corpora = ["human", ...ms.map((m) => m.graphite!)];
const idOf = (slug: string) => (slug === "human" ? "people" : ms.find((m) => m.graphite === slug)!.id);
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

type Doc = Record<string, string> & { url: string };
const docs: Doc[] = [];
for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })) if (line.trim()) docs.push(JSON.parse(line));
const train = docs.filter((d) => fnv(d.url) % 2 === 0);
const test = docs.filter((d) => fnv(d.url) % 2 === 1);
console.error(`${docs.length} topics: ${train.length} train, ${test.length} test`);

// ── train-half lexicon (same procedure and thresholds as the evaluation) ──
function ngrams(text: string): Map<string, number> {
  const toks = tokens(text);
  const out = new Map<string, number>();
  let seg = 0;
  const segs = toks.map((t, i) => (i > 0 && /[.!?]|\n/.test(text.slice(toks[i - 1].end, t.start)) ? ++seg : seg));
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
function count(slug: string, keep?: Set<string>) {
  const c = new Map<string, number>(), df = new Map<string, number>();
  const pos = [0, 0, 0, 0];
  for (const d of train) {
    const text = d[slug];
    if (!text) continue;
    const n = tokens(text).length;
    for (let k = 1; k <= 3; k++) pos[k] += Math.max(0, n - k + 1);
    for (const [k, v] of ngrams(text)) {
      if (keep && !keep.has(k)) continue;
      c.set(k, (c.get(k) ?? 0) + v);
      df.set(k, (df.get(k) ?? 0) + 1);
    }
  }
  return { c, df, pos };
}
const MIN_DF = 20;
const cand = new Map<string, Array<{ term: string; count: number; df: number; pos: number }>>();
for (const slug of corpora.slice(1)) {
  const r = count(slug);
  cand.set(slug, [...r.df].filter(([, d]) => d >= MIN_DF).map(([term, df]) => ({ term, count: r.c.get(term)!, df, pos: r.pos[term.split(" ").length] })));
}
const human = count("human", new Set([...cand.values()].flat().map((x) => x.term)));
const lexicon: Record<string, LexEntry[]> = {};
for (const slug of corpora.slice(1)) {
  const e: Array<LexEntry & { s: number }> = [];
  for (const x of cand.get(slug)!) {
    const n = x.term.split(" ").length;
    const ratio = (x.count / x.pos) / ((human.c.get(x.term) || 0.5) / human.pos[n]);
    if (ratio < 8 || (n === 1 && !(ratio >= 15 && x.df >= 2 * MIN_DF))) continue;
    e.push({ term: x.term, kind: "ngram", ratio: Math.round(ratio * 10) / 10, articles: x.df, s: Math.log(Math.min(ratio, 500)) * Math.log(x.df) });
  }
  lexicon[idOf(slug)] = e.sort((a, b) => b.s - a.s).slice(0, 400).map(({ s, ...rest }) => rest);
}
console.error("train lexicon ready");

// ── score every test article (cached in .cache/arena-per1k.json; delete it to rescore) ──
const players = corpora.map(idOf);
const cachePath = join(root(), ".cache", "arena-per1k.json");
const per1k: number[][] = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")).map((r: Array<number | null>) => r.map((x) => (x === null ? NaN : x))) : []; // [topic][player]
if (!per1k.length) for (const d of test) {
  per1k.push(corpora.map((slug) => {
    const text = d[slug];
    if (!text) return NaN;
    const r = check(text, "-", { kind: "text", lexiconData: lexicon, model: null });
    return (r.penalty / Math.max(r.words, 150)) * 1000;
  }));
}
if (!existsSync(cachePath)) writeFileSync(cachePath, JSON.stringify(per1k.map((r) => r.map((x) => (Number.isNaN(x) ? null : x)))));
console.error("scored test articles");

// ── battles and Bradley-Terry ──
const P = players.length;
function tally(rows: number[][]) {
  const w = Array.from({ length: P }, () => new Float64Array(P)); // w[i][j]: wins of i over j (ties count half)
  for (const r of rows) for (let i = 0; i < P; i++) for (let j = i + 1; j < P; j++) {
    if (Number.isNaN(r[i]) || Number.isNaN(r[j])) continue;
    if (r[i] < r[j]) w[i][j] += 1; else if (r[j] < r[i]) w[j][i] += 1; else { w[i][j] += 0.5; w[j][i] += 0.5; }
  }
  return w;
}
function bradleyTerry(w: Float64Array[]): number[] {
  let p = new Array(P).fill(1);
  for (let it = 0; it < 20000; it++) {
    const next = p.map((_, i) => {
      let wins = 0, den = 0;
      for (let j = 0; j < P; j++) if (j !== i) { const n = w[i][j] + w[j][i]; wins += w[i][j]; if (n) den += n / (p[i] + p[j]); }
      return den ? wins / den : p[i];
    });
    const g = Math.exp(next.reduce((a, x) => a + Math.log(x), 0) / P);
    const norm = next.map((x) => x / g);
    const delta = Math.max(...norm.map((x, i) => Math.abs(x - p[i])));
    p = norm;
    if (delta < 1e-12) break;
  }
  return p.map((x) => 1000 + 400 * Math.log10(x)); // Elo-like scale, geometric mean at 1000
}
const w = tally(per1k);
const rating = bradleyTerry(w);
// Bootstrap over topics for 95% intervals.
let seed = 7;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const boots: number[][] = [];
for (let b = 0; b < 200; b++) {
  const rows = per1k.map(() => per1k[Math.floor(rnd() * per1k.length)]);
  boots.push(bradleyTerry(tally(rows)));
}
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const winrate = players.map((_, i) => players.map((_, j) => (i === j ? null : +(w[i][j] / Math.max(1, w[i][j] + w[j][i])).toFixed(3))));
const median = (xs: number[]) => q(xs.filter((x) => !Number.isNaN(x)), 0.5);

const out = {
  generated: new Date().toISOString().slice(0, 10),
  method: "Battles on Graphite's held-out topics (people vs. nine models, same topic). Fewer tell points per 1,000 words wins; ties split. Bradley-Terry ratings on an Elo-like scale (geometric mean 1000); 95% intervals from 200 topic resamples. Checker uses a phrase list built from the train half only.",
  topics: test.length,
  players: players.map((id, i) => ({
    id,
    rating: Math.round(rating[i]),
    low: Math.round(q(boots.map((b) => b[i]), 0.025)),
    high: Math.round(q(boots.map((b) => b[i]), 0.975)),
    battles: players.reduce((a, _, j) => a + (i === j ? 0 : w[i][j] + w[j][i]), 0),
    wins: +players.reduce((a, _, j) => a + (i === j ? 0 : w[i][j]), 0).toFixed(1),
    median_per1k: +median(per1k.map((r) => r[i])).toFixed(2),
    mean_per1k: +(per1k.map((r) => r[i]).filter((x) => !Number.isNaN(x)).reduce((a, x) => a + x, 0) / per1k.filter((r) => !Number.isNaN(r[i])).length).toFixed(2),
    clean_share: +(per1k.filter((r) => !Number.isNaN(r[i]) && r[i] === 0).length / per1k.length).toFixed(3),
  })).sort((a, b) => b.rating - a.rating),
  winrate: { order: players, matrix: winrate },
};
writeFileSync(join(root(), "data/measured/arena.json"), JSON.stringify(out, null, 1));
for (const p of out.players) console.log(`${p.id.padEnd(18)} ${String(p.rating).padStart(5)}  [${p.low}, ${p.high}]  median ${p.median_per1k} pts/1k`);
