// Lay out the atlas: models placed by how their phrase use differs from people (PCA with people at the
// origin), phrases placed near the models that over-use them, spread by a force layout into terrain.
//   npm run map  ->  data/measured/map.json
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { forceSimulation, forceX, forceY, forceCollide, type SimulationNodeDatum } from "d3-force";
import { root, models, tells } from "../src/registry.js";

const R = root();
const ms = models().models;
const slugTo = new Map(ms.map((m, i) => [m.graphite!, i]));
const text = gunzipSync(readFileSync(join(R, "data/raw/graphite/tells_vs_human.csv.gz"))).toString("utf8").trim().split("\n");
const cols = text[0].split(",");
const ix = (c: string) => cols.indexOf(c);

// term -> per-model log2 ratio (positive: model uses more). Missing means "within Graphite's cutoff", treated as 0.
const CLIP = 10;
const terms = new Map<string, { kind: string; v: number[]; art: number[]; floor: number }>();
for (const line of text.slice(1)) {
  const f = line.split(",");
  const mi = slugTo.get(f[ix("model")]);
  if (mi === undefined) continue;
  const over = f[ix("used_more_by")] === f[ix("model")];
  const mc = +f[ix("model_count")], hc = +f[ix("human_count")];
  let r = f[ix("ratio")] === "inf" ? (over ? mc * 2 : hc * 2) : +f[ix("ratio")];
  let l = Math.log2(Math.max(r, 1));
  if (!over) l = -l;
  l = Math.max(-CLIP, Math.min(CLIP, l));
  const key = `${f[ix("kind")]}|${f[ix("term")]}`;
  if (!terms.has(key)) terms.set(key, { kind: f[ix("kind")], v: Array(ms.length).fill(0), art: Array(ms.length).fill(0), floor: 0 });
  const t = terms.get(key)!;
  t.v[mi] = l;
  if (f[ix("ratio")] === "inf") t.floor |= 1 << mi;
  t.art[mi] = over ? +f[ix("model_articles")] : +f[ix("human_articles")];
}

// Keep strong, common terms: >= 4x one way for some model, in >= 40 articles.
type T = { term: string; kind: string; v: number[]; strength: number; under: boolean; floor: number };
let kept: T[] = [];
for (const [key, t] of terms) {
  let best = 0, bestAbs = 0;
  for (let i = 0; i < ms.length; i++) if (t.art[i] >= 40 && Math.abs(t.v[i]) >= 2 && Math.abs(t.v[i]) > bestAbs) { bestAbs = Math.abs(t.v[i]); best = t.v[i]; }
  if (!bestAbs) continue;
  kept.push({ term: key.split("|")[1], kind: t.kind, v: t.v, strength: bestAbs, under: best < 0, floor: t.floor });
}
// Prefer n-grams; drop frames that duplicate an n-gram's words exactly; cap the count.
kept.sort((a, b) => b.strength - a.strength);
kept = kept.slice(0, 5000);

// ── PCA of models (rows) over terms, uncentered so people stay at the origin ──
const M = ms.map((_, i) => kept.map((t) => t.v[i]));
const C = M.map((a) => M.map((b) => a.reduce((s, x, k) => s + x * b[k], 0)));
function jacobi(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const v = A.map((_, i) => A.map((_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}
const { values, vectors } = jacobi(C);
const order = values.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
const total = values.reduce((a, b) => a + b, 0);
const [k1, k2] = order;
let pos = ms.map((_, i) => [vectors[i][k1] * Math.sqrt(values[k1]), vectors[i][k2] * Math.sqrt(values[k2])]);
// Orient: oldest models to the left-ish is arbitrary; keep sign so the first model has x < 0 for stable layouts.
if (pos[0][0] > 0) pos = pos.map(([x, y]) => [-x, y]);
const span = Math.max(...pos.map(([x, y]) => Math.hypot(x, y)));
pos = pos.map(([x, y]) => [(x / span) * 100, (y / span) * 100]);
console.error(`PCA: first two axes explain ${(((values[k1] + values[k2]) / total) * 100).toFixed(1)}% of model variation`);

// ── Phrase targets: weighted average of the positions of models that over-use it ──
interface N extends SimulationNodeDatum { i: number; tx: number; ty: number; r: number }
const nodes: N[] = kept.map((t, i) => {
  let wx = 0, wy = 0, w = 0;
  for (let m = 0; m < ms.length; m++) {
    const wt = t.under ? Math.max(0, -t.v[m]) : Math.max(0, t.v[m]);
    wx += wt ** 2 * pos[m][0]; wy += wt ** 2 * pos[m][1]; w += wt ** 2;
  }
  let tx = w ? wx / w : 0, ty = w ? wy / w : 0;
  // Pull toward the shore in proportion to how mild the tell is; words people use more sit across the origin.
  const reach = Math.min(1, 0.35 + t.strength / CLIP);
  if (t.under) { tx = -tx * 0.45; ty = -ty * 0.45; } else { tx *= reach; ty *= reach; }
  // Deterministic start jitter.
  const h = [...t.term].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { i, tx, ty, r: 0.55 + t.strength * 0.06, x: tx + ((h % 100) / 100 - 0.5) * 4, y: ty + (((h >> 7) % 100) / 100 - 0.5) * 4 };
});
const sim = forceSimulation(nodes)
  .force("x", forceX<N>((d) => d.tx).strength(0.08))
  .force("y", forceY<N>((d) => d.ty).strength(0.08))
  .force("c", forceCollide<N>((d) => d.r).iterations(2))
  .stop();
for (let k = 0; k < 400; k++) sim.tick();

// Link registry tells to their phrases so the map can label them.
const tellOf = new Map<string, string>();
for (const t of tells()) for (const term of t.measure?.graphite ?? []) tellOf.set(term, t.id);

const out = {
  attribution: 'Graphite, "AI Tells" (2026), CC BY 4.0',
  explained: +(((values[k1] + values[k2]) / total) * 100).toFixed(1),
  models: ms.map((m, i) => ({ id: m.id, name: m.name, family: m.family, released: m.released, verified: m.verified, x: +pos[i][0].toFixed(2), y: +pos[i][1].toFixed(2) })),
  // [term, x, y, under?1:0, tellId|"", floorMask (bit i: one side never used it, ratio is a lower bound), ...per-model log2 ratio x10]
  terms: kept.map((t, i) => [t.term, +nodes[i].x!.toFixed(2), +nodes[i].y!.toFixed(2), t.under ? 1 : 0, tellOf.get(t.term) ?? "", t.floor, ...t.v.map((x) => Math.round(x * 10))]),
};
writeFileSync(join(R, "data/measured/map.json"), JSON.stringify(out));
console.log(`map: ${kept.length} phrases (${kept.filter((t) => t.under).length} that people use more), models:`);
for (const m of out.models) console.log(`  ${m.id.padEnd(16)} ${m.x.toFixed(1).padStart(7)} ${m.y.toFixed(1).padStart(7)}  dist ${Math.hypot(m.x, m.y).toFixed(1)}`);
