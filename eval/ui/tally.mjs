#!/usr/bin/env node
// Decode a judge's exported ratings and total them by arm.
//   node eval/ui/tally.mjs [--tag NAME]     reads picks-<tag>.json and letters-<tag>.json
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const TAG = arg("tag", "main");
const picks = JSON.parse(readFileSync(join(HERE, `picks-${TAG}.json`), "utf8"));
const letters = JSON.parse(readFileSync(join(HERE, `letters-${TAG}.json`), "utf8"));

const by = {};
const arm = (k) => (by[k] ??= { ratings: [], best: 0, worst: 0, notes: [] });
for (const [k, v] of Object.entries(picks)) {
  let m;
  if ((m = k.match(/^(.+)-([A-L])-rate$/))) arm(letters[`${m[1]}-${m[2]}`]).ratings.push(+v);
  else if ((m = k.match(/^(.+)-(best|worst)$/))) arm(letters[`${m[1]}-${v}`])[m[2]]++;
  else if ((m = k.match(/^(.+)-([A-L])-note$/))) arm(letters[`${m[1]}-${m[2]}`]).notes.push(`${m[1]}: ${v}`);
}
const rows = Object.entries(by).sort();
console.log("arm".padEnd(12), "n".padStart(3), "mean".padStart(6), "sd".padStart(5), "best".padStart(5), "worst".padStart(6));
for (const [a, r] of rows) {
  const n = r.ratings.length, mu = n ? r.ratings.reduce((s, x) => s + x, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(r.ratings.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1)) : NaN;
  console.log(a.padEnd(12), String(n).padStart(3), mu.toFixed(2).padStart(6), sd.toFixed(2).padStart(5), String(r.best).padStart(5), String(r.worst).padStart(6));
}
for (const [a, r] of rows) if (r.notes.length) console.log(`\n${a}\n  ${r.notes.join("\n  ")}`);
