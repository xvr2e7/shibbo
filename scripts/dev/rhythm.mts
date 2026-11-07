import { createReadStream } from "node:fs"; import { createGunzip } from "node:zlib"; import { createInterface } from "node:readline";
import { paragraphs } from "../../src/text.ts";
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const cv = (t: string) => { const w = paragraphs(t).filter(p => p.kind === "para").flatMap(p => p.sentences.map(s => s.words)).filter(x => x >= 3); if (w.length < 15) return null; const m = w.reduce((a, b) => a + b, 0) / w.length; return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length) / m; };
const vals: Record<string, number[]> = {}; let n = 0;
for await (const line of createInterface({ input: createReadStream(".cache/ai_tells_articles.jsonl.gz").pipe(createGunzip()) })) {
  const d = JSON.parse(line); if (fnv(d.url) % 2 !== 0) continue; if (++n > 1500) break;
  for (const k of Object.keys(d)) if (k !== "url") { const c = cv(d[k]); if (c !== null) (vals[k] ??= []).push(c); }
}
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * xs.length)];
for (const [k, xs] of Object.entries(vals)) {
  const below = (t: number) => (xs.filter(x => x < t).length / xs.length * 100).toFixed(0) + "%";
  console.log(k.padEnd(24), "median CV", q(xs, .5).toFixed(3), " <0.40:", below(0.40).padStart(4), " <0.45:", below(0.45).padStart(4));
}
