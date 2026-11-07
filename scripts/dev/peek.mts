import { createReadStream } from "node:fs"; import { createGunzip } from "node:zlib"; import { createInterface } from "node:readline";
import { check } from "../../src/check.ts";
const [rule, corpus = "human", n = "25", lim = "3000"] = process.argv.slice(2);
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
let shown = 0, seen = 0;
for await (const line of createInterface({ input: createReadStream(".cache/ai_tells_articles.jsonl.gz").pipe(createGunzip()) })) {
  const d = JSON.parse(line); if (fnv(d.url) % 2 !== 0) continue; // TRAIN only
  if (++seen > +lim) break;
  const r = check(d[corpus], "-", { kind: "text", only: [rule], lexicon: false });
  for (const f of r.findings) { if (shown++ >= +n) process.exit(0); console.log("·", f.match.replace(/\s+/g, " ").slice(0, 110)); }
}
