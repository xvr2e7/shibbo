// Lay out the atlas from shibbo's full counts of Graphite's paired articles (scripts/dense_map.py -> data/measured/dense.json).
// People, models and phrases come placed by a correspondence analysis; this step only spreads phrases so they don't overlap.
//   npm run map  ->  data/measured/map.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { forceSimulation, forceX, forceY, forceCollide, type SimulationNodeDatum } from "d3-force";
import { root, models, tells } from "../src/registry.js";

const R = root();
const ms = models().models;
const densePath = join(R, "data/measured/dense.json");
if (!existsSync(densePath)) throw new Error("run scripts/dense_count.py and scripts/dense_map.py first (see docs/guide/measure.md)");
type DenseTerm = { t: string; x: number; y: number; under: 0 | 1; v: number[]; sig: number; ok: number; n: number[]; d: number[]; raid: Array<number | null>; rn: Array<[number, number]> };
const dense = JSON.parse(readFileSync(densePath, "utf8")) as {
  attribution: string; explained: number; method: Record<string, unknown>; words: Record<string, number>; inertia: Record<string, number>;
  models: Array<{ id: string; graphite: string; x: number; y: number }>;
  raid: Array<{ id: string; name: string; family: string; released: string; verified: boolean; source: "raid" | "local"; docs: number; x: number; y: number }>;
  terms: DenseTerm[];
};

// An earlier or local model owns a phrase when it is 4x or more one way and the side that uses it more wrote it 20+ times.
const raidOk = (t: DenseTerm, k: number) => {
  const v = t.raid[k];
  if (v === null || Math.abs(v) < 20) return false;
  const [m, h] = t.rn[k];
  return (v > 0 ? m : h) >= 20;
};

interface N extends SimulationNodeDatum { i: number; tx: number; ty: number; r: number }
const strength = (t: DenseTerm) => Math.max(...t.v.map((x, i) => ((t.ok >> i) & 1 ? Math.abs(x) / 10 : 0)), ...t.raid.map((x, k) => (raidOk(t, k) ? Math.abs(x!) / 10 : 0)));
const nodes: N[] = dense.terms.map((t, i) => {
  const h = [...t.t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { i, tx: t.x, ty: t.y, r: 0.55 + Math.min(strength(t), 10) * 0.06, x: t.x + ((h % 100) / 100 - 0.5) * 2, y: t.y + (((h >> 7) % 100) / 100 - 0.5) * 2 };
});
const sim = forceSimulation(nodes)
  .force("x", forceX<N>((d) => d.tx).strength(0.1))
  .force("y", forceY<N>((d) => d.ty).strength(0.1))
  .force("c", forceCollide<N>((d) => d.r).iterations(2))
  .stop();
for (let k = 0; k < 400; k++) sim.tick();

const tellOf = new Map<string, string>();
for (const t of tells()) for (const term of t.measure?.graphite ?? []) tellOf.set(term, t.id);

const byId = new Map(ms.map((m) => [m.id, m]));
const out = {
  attribution: dense.attribution,
  explained: dense.explained,
  method: dense.method,
  words: dense.words,
  models: [
    ...dense.models.map((p) => {
      const m = byId.get(p.id)!;
      return { id: m.id, name: m.name, family: m.family, released: m.released, verified: m.verified, source: "graphite", x: p.x, y: p.y };
    }),
    // Earlier models (RAID) and local open-weight runs, each placed relative to its own matched human texts.
    ...dense.raid.map((p) => ({ id: p.id, name: p.name, family: p.family, released: p.released, verified: p.verified, source: p.source, x: p.x, y: p.y, docs: p.docs })),
  ],
  // [term, x, y, under?1:0, tellId|"", ownMask (bit i: model i owns it — 4x+, significant, 40+ articles, spread over topics),
  //  ...per-model log2 ratio x10 (null: too few uses to say)]
  terms: dense.terms.map((t, i) => {
    let own = t.ok;
    dense.raid.forEach((_, k) => { if (raidOk(t, k)) own |= 1 << (9 + k); });
    return [t.t, +nodes[i].x!.toFixed(2), +nodes[i].y!.toFixed(2), t.under, tellOf.get(t.t) ?? "", own, ...t.v, ...t.raid];
  }),
  // Per phrase: [people uses, people articles, then uses and articles for each Graphite model, then RAID model uses and its human texts' uses].
  counts: dense.terms.map((t) => [t.n[0], t.d[0], ...t.v.flatMap((_, i) => [t.n[i + 1], t.d[i + 1]]), ...t.rn.flat()]),
};
writeFileSync(join(R, "data/measured/map.json"), JSON.stringify(out));
console.log(`map: ${out.terms.length} phrases (${dense.terms.filter((t) => t.under).length} that people use more); axes explain ${dense.explained}%`);
for (const m of out.models) console.log(`  ${m.id.padEnd(22)} ${m.x.toFixed(1).padStart(7)} ${m.y.toFixed(1).padStart(7)}  dist ${Math.hypot(m.x, m.y).toFixed(1)}`);
