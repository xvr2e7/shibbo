// Tell density for the 2022–23 RAID models: average and median tell points per 1,000 words for each model and for the
// human texts it was prompted from, scored by the current checker (no model weighting).
//
//   npx tsx scripts/raid-per1k.ts <sample.jsonl from raid_sample.py>   ->  adds per1k to data/measured/raid.json
//
// The phrase list comes from Graphite's articles, so no RAID text scores itself.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../src/check.js";
import { root } from "../src/registry.js";

const per1k = (t: string) => { const r = check(t, "-", { kind: "text", model: null }); return (r.penalty / Math.max(r.words, 150)) * 1000; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const share = (a: number[]) => a.filter((x) => x > 0).length / a.length;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const by: Record<string, { m: number[]; h: number[] }> = {};
for (const line of readFileSync(process.argv[2], "utf8").trim().split("\n")) {
  const d = JSON.parse(line) as { model: string; text: string; human: string };
  (by[d.model] ??= { m: [], h: [] });
  by[d.model].m.push(per1k(d.text));
  by[d.model].h.push(per1k(d.human));
}
const path = join(root(), "data/measured/raid.json");
const raid = JSON.parse(readFileSync(path, "utf8"));
for (const m of raid.models) {
  const v = by[m.raid];
  if (v) m.per1k = { model: +median(v.m).toFixed(2), human: +median(v.h).toFixed(2), model_mean: +mean(v.m).toFixed(2), human_mean: +mean(v.h).toFixed(2), model_any: +share(v.m).toFixed(3), human_any: +share(v.h).toFixed(3), docs: v.m.length };
}
writeFileSync(path, JSON.stringify(raid));
console.log(raid.models.map((m: { id: string; per1k?: unknown }) => `${m.id} ${JSON.stringify(m.per1k)}`).join("\n"));
