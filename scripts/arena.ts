// The tell arena: people and every measured model on the same held-out topics.
//
//   npx tsx scripts/arena.ts [<path/to/ai_tells_articles.jsonl.gz>] [--jobs 6] [--without <run,run>]   ->  data/measured/arena.json
//
// --without leaves the named runs out (say, api-claude-opus-5.5 to see the board with no bridge).
//
// Each test topic stages a battle between every pair of writers (people count as a writer). The article
// with fewer tell points per 1,000 words wins; equal scores tie. Ratings come from a Bradley-Terry fit
// (the model behind arena-style Elo), shown on an Elo-like scale, with 95% intervals from resampling topics.
// The checker uses a phrase list rebuilt from the train half only, as in scripts/eval-graphite.ts.
//
// Players: people and Graphite's models on every held-out topic, plus shibbo's own API runs
// (measure/runs/api-*/matched.jsonl, 100+ articles), each on the few hundred held-out topics it answered.
//
// Leave-own-out: the phrase list comes from the train half of Graphite's models. A Graphite model's articles are
// scored with that model's own entries removed, so no writer is scored with phrases learned from its own model's
// text. People and shibbo's runs of other models get the full list.
//
// Bridge runs: a run whose model Graphite also measured (same model, shibbo's prompt) enters as its own writer,
// flagged bridge, scored leave-own-out like its Graphite twin. Its rating minus the twin's is the prompt offset
// between the two sources. The script works with no bridge run, one or several.
//
// Three scorings share one fit: total points, curated rules only, phrase list only. Each writer's rank under
// each is published, since the two halves of the checker order models differently.
//
// Scores are cached per player in .cache/arena/<hash of checker, phrase list and scoring version>/, so a rerun
// scores only new runs; child processes (--jobs) score players in parallel.
import { writeFileSync, readFileSync, existsSync, createReadStream, mkdirSync, readdirSync, statSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { check } from "../src/check.js";
import { tokens } from "../src/text.js";
import { models, root, type LexEntry } from "../src/registry.js";

const args = process.argv.slice(2);
const flag = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const newest = join(root(), ".cache/graphite-55/ai_tells_articles_opus55.jsonl.gz");
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? (existsSync(newest) ? newest : join(root(), ".cache/ai_tells_articles.jsonl.gz"));
const scoreOnly = flag("--score"); // child mode: score these players (comma-separated ids) and exit
const jobs = +(flag("--jobs") ?? 6);
const all = models().models;
const ms = all.filter((m) => m.graphite);
const corpora = ["human", ...ms.map((m) => m.graphite!)];
const idOf = (slug: string) => (slug === "human" ? "people" : ms.find((m) => m.graphite === slug)!.id);
const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const R = root();

// ── shibbo's own API runs ──
// The prompt hands each model a title (GPT-4.1's, from Graphite's data), which it echoes as its first line. That line
// is another model's writing, so it goes, as in scripts/tellcount.py strip_title.
const words = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
function stripTitle(text: string, title: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim());
  if (i < 0) return text;
  const a = words(lines[i]), b = words(title);
  const sa = new Set(a), sb = new Set(b);
  const shared = [...sa].filter((x) => sb.has(x)).length;
  const same = a.join(" ") === b.join(" ") || (lines[i].trimStart().startsWith("#") && b.length > 0 && shared >= 0.8 * Math.max(sa.size, sb.size));
  return same ? lines.slice(i + 1).join("\n") : text;
}
const MIN_API = 100;
const apiMeta = new Map(all.filter((m) => m.source === "shibbo-api").map((m) => [m.run ?? `api-${m.id}`, m]));
// id: the writer's id on the board. model: the model that wrote. A bridge run's model is also a Graphite model, so its
// writer id gets a suffix and never clashes with the Graphite writer.
const BRIDGE_SUFFIX = "@shibbo";
const apiRuns: Array<{ id: string; model: string; bridge: boolean; run: string; texts: Map<string, string> }> = [];
const runsDir = join(R, "measure/runs");
const without = new Set((flag("--without") ?? "").split(",").filter(Boolean));
for (const run of existsSync(runsDir) ? readdirSync(runsDir).filter((d) => d.startsWith("api-") && !without.has(d)).sort() : []) {
  const f = join(runsDir, run, "matched.jsonl");
  if (!existsSync(f)) continue;
  const rows = readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as { topic: string; title?: string; text?: string; stop_reason?: string });
  const ok = rows.filter((r) => r.text && ["end_turn", "max_tokens", "stop", "length"].includes(r.stop_reason ?? ""));
  if (ok.length < MIN_API) { if (!scoreOnly) console.error(`skip ${run}: ${ok.length} articles (needs ${MIN_API})`); continue; }
  const off = ok.filter((r) => fnv(r.topic) % 2 !== 1).length;
  if (off) throw new Error(`${run}: ${off} articles on train-half topics; the arena scores held-out topics only`);
  const model = apiMeta.get(run)?.id ?? run.slice(4);
  const bridge = ms.some((m) => m.id === model);
  apiRuns.push({ id: bridge ? model + BRIDGE_SUFFIX : model, model, bridge, run, texts: new Map(ok.map((r) => [r.topic, stripTitle(r.text!, r.title ?? "")])) });
}
const bridges = apiRuns.filter((r) => r.bridge);
const players = [...corpora.map(idOf), ...apiRuns.map((r) => r.id)];
const sourceOf = (id: string) => (apiRuns.some((r) => r.id === id) ? "shibbo-api" : id === "people" ? "people" : "graphite");

// ── articles: the whole file for the train lexicon; in child mode only the test column a player needs ──
type Doc = Record<string, string> & { url: string };
const docs: Doc[] = [];
const wantCols = scoreOnly ? new Set(scoreOnly.split(",").filter((id) => !apiRuns.some((r) => r.id === id)).map((id) => (id === "people" ? "human" : ms.find((m) => m.id === id)?.graphite)).filter(Boolean) as string[]) : null;
for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const d = JSON.parse(line) as Doc;
  if (wantCols) {
    if (fnv(d.url) % 2 !== 1) continue;
    const slim: Doc = { url: d.url } as Doc;
    for (const c of wantCols) if (d[c]) slim[c] = d[c];
    docs.push(slim);
  } else docs.push(d);
}
const test = docs.filter((d) => fnv(d.url) % 2 === 1);
const train = docs.filter((d) => fnv(d.url) % 2 === 0);
if (!scoreOnly) console.error(`${docs.length} topics: ${train.length} train, ${test.length} test; players: ${players.length} (${apiRuns.length} shibbo API runs, ${bridges.length} of them bridge runs${bridges.length ? `: ${bridges.map((r) => r.run).join(", ")}` : ""})`);

// ── train-half lexicon (same procedure and thresholds as the evaluation), cached by article file ──
const st = statSync(file);
const lexPath = join(R, ".cache/arena", `lexicon-${createHash("sha1").update(`${file}|${st.size}|${st.mtimeMs}|${corpora.join(",")}|v1`).digest("hex").slice(0, 12)}.json`);
mkdirSync(join(R, ".cache/arena"), { recursive: true });
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
function buildLexicon(): Record<string, LexEntry[]> {
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
  return lexicon;
}
let lexicon: Record<string, LexEntry[]>;
if (existsSync(lexPath)) lexicon = JSON.parse(readFileSync(lexPath, "utf8"));
else if (scoreOnly) throw new Error("child started before the lexicon was cached");
else { lexicon = buildLexicon(); writeFileSync(lexPath, JSON.stringify(lexicon)); }
// Only Graphite's models train the list: none of shibbo's runs has text on the train half.
for (const id of Object.keys(lexicon)) if (!ms.some((m) => m.id === id)) throw new Error(`lexicon entry ${id} is not a Graphite model`);
if (!scoreOnly) console.error(`train lexicon ready (${Object.keys(lexicon).length} Graphite models)`);

// ── scores per player, cached by a hash of the checker, the registry, the phrase list and the scoring version ──
// Bump SCORING when what a cache file holds, or which phrase list a player gets, changes.
const SCORING = "loo-v2: [total, registry, lexicon] per 1k; Graphite models and bridge runs scored without their own model's entries";
const srcFiles = (dir: string): string[] => readdirSync(join(R, dir), { recursive: true }).map(String).filter((f) => /\.(ts|ya?ml)$/.test(f)).sort().map((f) => join(R, dir, f));
const scorerHash = createHash("sha1");
for (const f of [...srcFiles("src"), join(R, "data/tells.yaml"), ...srcFiles("data/tells.d")]) scorerHash.update(readFileSync(f));
scorerHash.update(JSON.stringify(lexicon));
scorerHash.update(SCORING);
const scoreDir = join(R, ".cache/arena", `scores-${scorerHash.digest("hex").slice(0, 12)}`);
mkdirSync(scoreDir, { recursive: true });
const testUrls = test.map((d) => d.url);
const textOf = (id: string, d: Doc): string | undefined => {
  const run = apiRuns.find((r) => r.id === id);
  if (run) return run.texts.get(d.url);
  return d[id === "people" ? "human" : ms.find((m) => m.id === id)!.graphite!];
};
const cacheFile = (id: string) => join(scoreDir, `${id}.json`);
// The model behind a writer, when the phrase list holds entries learned from that model's text.
const ownModel = (id: string): string | null => {
  const m = apiRuns.find((r) => r.id === id)?.model ?? id;
  return lexicon[m] ? m : null;
};
const lexiconFor = (id: string): Record<string, LexEntry[]> => {
  const own = ownModel(id);
  if (!own) return lexicon;
  const rest = Object.fromEntries(Object.entries(lexicon).filter(([k]) => k !== own));
  if (Object.keys(rest).length !== Object.keys(lexicon).length - 1) throw new Error(`leave-own-out for ${id} did not remove exactly one list`);
  return rest;
};
const TRIADS = "triads";
type Score = [total: number, registry: number, lexicon: number]; // tell points per 1,000 words
type Cache = { id: string; texts: string; scoring: string; scores: Record<string, Score>; points: { registry: number; triads: number; lexicon: number } };
const textsHash = (id: string) => {
  const run = apiRuns.find((r) => r.id === id);
  return run ? createHash("sha1").update(JSON.stringify([...run.texts])).digest("hex") : "graphite";
};
function scorePlayer(id: string) {
  const lex = lexiconFor(id);
  const scores: Record<string, Score> = {};
  const points = { registry: 0, triads: 0, lexicon: 0 };
  for (const d of test) {
    const t = textOf(id, d);
    if (!t) continue;
    const r = check(t, "-", { kind: "text", lexiconData: lex, model: null });
    let reg = 0, lx = 0;
    for (const f of r.findings) {
      if (!f.counted) continue;
      if (f.origin === "registry") { reg += f.severity; if (f.id === TRIADS) points.triads += f.severity; } else lx += f.severity;
    }
    const per1k = 1000 / Math.max(r.words, 150);
    scores[d.url] = [r.penalty * per1k, reg * per1k, lx * per1k];
    points.registry += reg; points.lexicon += lx;
  }
  writeFileSync(cacheFile(id), JSON.stringify({ id, texts: textsHash(id), scoring: SCORING, scores, points } satisfies Cache));
}
const cached = (id: string): Cache | null => {
  if (!existsSync(cacheFile(id))) return null;
  const c = JSON.parse(readFileSync(cacheFile(id), "utf8")) as Cache;
  if (c.scoring !== SCORING || c.texts !== textsHash(id)) return null; // the scoring changed, or the run grew
  return c;
};
if (scoreOnly) {
  for (const id of scoreOnly.split(",")) { scorePlayer(id); console.error(`scored ${id}`); }
  process.exit(0);
}
const missing = players.filter((id) => !cached(id));
if (missing.length) {
  console.error(`scoring ${missing.length} players in ${Math.min(jobs, missing.length)} processes: ${missing.join(", ")}`);
  const queue = [...missing];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      await new Promise<void>((ok, fail) => {
        const p = spawn(process.execPath, [...process.execArgv, process.argv[1], file, "--score", id], { stdio: ["ignore", "inherit", "inherit"] });
        p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`scoring ${id} failed (${code})`))));
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, missing.length) }, worker));
}
const byPlayer = players.map((id) => cached(id)!);
const VARIANTS = ["total", "registry", "lexicon"] as const;
type Variant = (typeof VARIANTS)[number];
const matrix = (k: number): number[][] => testUrls.map((u) => byPlayer.map((c) => c.scores[u]?.[k] ?? NaN)); // [topic][player]
const per1k = matrix(0);
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
// Two stages, so a new run never moves the board: people and Graphite's models (every topic) are fit together;
// then each API run, bridge runs included, is fit alone against their fixed strengths, from its battles with them.
const B = corpora.length; // players 0..B-1 play every topic
function bradleyTerry(w: Float64Array[]): number[] {
  let p = new Array(P).fill(1);
  for (let it = 0; it < 20000; it++) {
    const next = p.map((_, i) => {
      if (i >= B) return 1;
      let wins = 0, den = 0;
      for (let j = 0; j < B; j++) if (j !== i) { const n = w[i][j] + w[j][i]; wins += w[i][j]; if (n) den += n / (p[i] + p[j]); }
      return den ? wins / den : p[i];
    });
    const g = Math.exp(next.slice(0, B).reduce((a, x) => a + Math.log(x), 0) / B);
    const norm = next.map((x) => x / g);
    const delta = Math.max(...norm.map((x, i) => Math.abs(x - p[i])));
    p = norm;
    if (delta < 1e-12) break;
  }
  for (let i = B; i < P; i++) {
    let x = 1;
    for (let it = 0; it < 20000; it++) {
      let wins = 0, den = 0;
      for (let j = 0; j < B; j++) { const n = w[i][j] + w[j][i]; wins += w[i][j]; if (n) den += n / (x + p[j]); }
      const nx = den && wins ? wins / den : x;
      if (Math.abs(nx - x) < 1e-12 * Math.max(1, x)) { x = nx; break; }
      x = nx;
    }
    p[i] = x;
  }
  return p.map((x) => 1000 + 400 * Math.log10(x)); // Elo-like scale, geometric mean of people and Graphite's models at 1000
}
const w = tally(per1k);
const rating = bradleyTerry(w);
// The same fit under each scoring. Rank 1 is the highest rating; equal ratings keep player order.
const ratings: Record<Variant, number[]> = { total: rating, registry: bradleyTerry(tally(matrix(1))), lexicon: bradleyTerry(tally(matrix(2))) };
const rankOf = (r: number[]) => { const order = r.map((_, i) => i).sort((a, b) => r[b] - r[a] || a - b); const out = new Array<number>(P); order.forEach((i, k) => (out[i] = k + 1)); return out; };
const ranks = Object.fromEntries(VARIANTS.map((v) => [v, rankOf(ratings[v])])) as Record<Variant, number[]>;
const hi = players.indexOf("people");
// Spearman between the two halves of the checker, over the models (people and bridge runs left out: people lead by
// construction, and a bridge run is a second copy of a model already counted).
const spearman = (a: number[], b: number[]) => {
  const rk = (xs: number[]) => { const o = xs.map((_, i) => i).sort((i, j) => xs[j] - xs[i] || i - j); const r = new Array<number>(xs.length); o.forEach((i, k) => (r[i] = k + 1)); return r; };
  const ra = rk(a), rb = rk(b), n = a.length;
  return 1 - (6 * ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0)) / (n * (n * n - 1));
};
const modelIdx = players.map((_, i) => i).filter((i) => i !== hi && !bridges.some((r) => r.id === players[i]));
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

// ── prompt offset: the same model under shibbo's prompt and under Graphite's ──
const nameOfModel = (id: string) => all.find((m) => m.id === id)?.name ?? id;
const offsets = bridges.map((r) => {
  const i = players.indexOf(r.id), j = players.indexOf(r.model);
  // Shared topics: -1 the bridge article has fewer tell points, 1 the Graphite article does, 0 a tie.
  const d = per1k.filter((row) => !Number.isNaN(row[i]) && !Number.isNaN(row[j])).map((row) => Math.sign(row[i] - row[j]));
  const rate = (xs: number[]) => xs.reduce((a, x) => a + (x < 0 ? 1 : x === 0 ? 0.5 : 0), 0) / Math.max(1, xs.length);
  const bs: number[] = [];
  for (let b = 0; b < 2000; b++) bs.push(rate(d.map(() => d[Math.floor(rnd() * d.length)])));
  const diffs = boots.map((b) => b[i] - b[j]);
  return {
    model: r.model, name: nameOfModel(r.model), run: r.run,
    bridge_rating: Math.round(rating[i]), graphite_rating: Math.round(rating[j]),
    // Bridge minus Graphite: above zero, shibbo's prompt draws fewer tells from the same model.
    // The difference of the two published (rounded) ratings, so the board and the gap agree.
    offset: Math.round(rating[i]) - Math.round(rating[j]), low: Math.round(q(diffs, 0.025)), high: Math.round(q(diffs, 0.975)),
    shared_topics: d.length,
    // Share of shared topics where the bridge article had fewer tell points than the Graphite one (ties split).
    win_rate: +rate(d).toFixed(3), win_low: +q(bs, 0.025).toFixed(3), win_high: +q(bs, 0.975).toFixed(3),
  };
});
const promptOffset = offsets.length ? { mean: Math.round(offsets.reduce((a, o) => a + o.offset, 0) / offsets.length), models: offsets } : null;

// Battles a rating rests on: against people and Graphite's models (for them, against each other).
const rated = (i: number, j: number) => i !== j && j < B;
const share = (c: Cache) => (c.points.registry ? c.points.triads / c.points.registry : 0);
const out = {
  generated: new Date().toISOString().slice(0, 10),
  method: `Battles on Graphite's held-out topics (people vs. ${ms.length} Graphite-measured models on every topic${apiRuns.length ? `, plus ${apiRuns.length} of shibbo's own API runs, each on the topics it answered` : ""}). Fewer tell points per 1,000 words wins; ties split. Bradley-Terry ratings on an Elo-like scale (geometric mean of people and Graphite's models at 1000); each API run is rated against their fixed strengths, so it never moves them. 95% intervals from 200 topic resamples. The phrase list comes from the train half of Graphite's models; each Graphite model${bridges.length ? " and bridge run" : ""} is scored with its own model's entries removed (leave-own-out). ${bridges.length ? `${bridges.length} bridge run${bridges.length > 1 ? "s" : ""} (a Graphite model under shibbo's prompt) measure${bridges.length > 1 ? "" : "s"} the offset between the two sources.` : "No bridge run yet: no model was written under both prompts, so the offset between the two sources is unmeasured."} Ranks are published under three scorings: total, curated rules only, phrase list only.`,
  topics: test.length,
  leave_own_out: true,
  scoring: {
    variants: VARIANTS,
    // Rank agreement between rules-only and phrase-list-only ratings, over the models.
    spearman_registry_lexicon: +spearman(modelIdx.map((i) => ratings.registry[i]), modelIdx.map((i) => ratings.lexicon[i])).toFixed(2),
    spearman_models: modelIdx.length,
    people_first_in_all: VARIANTS.every((v) => ranks[v][hi] === 1),
    // The triad rule's share of curated-rule points, over the models' articles (mean of per-model shares) and for people.
    triad_share_of_rule_points: +(modelIdx.reduce((a, i) => a + share(byPlayer[i]), 0) / modelIdx.length).toFixed(3),
    triad_share_range: [+Math.min(...modelIdx.map((i) => share(byPlayer[i]))).toFixed(3), +Math.max(...modelIdx.map((i) => share(byPlayer[i]))).toFixed(3)],
    triad_share_people: +share(byPlayer[hi]).toFixed(3),
  },
  prompt_offset: promptOffset,
  players: players.map((id, i) => {
    const run = apiRuns.find((r) => r.id === id);
    const has = per1k.filter((r) => !Number.isNaN(r[i]));
    const rs = VARIANTS.map((v) => ranks[v][i]);
    return {
      id,
      ...(run?.bridge ? { bridge: true, model: run.model, name: `${nameOfModel(run.model)}, shibbo's prompt` } : {}),
      source: sourceOf(id),
      topics: has.length,
      rating: Math.round(rating[i]),
      low: Math.round(q(boots.map((b) => b[i]), 0.025)),
      high: Math.round(q(boots.map((b) => b[i]), 0.975)),
      ranks: Object.fromEntries(VARIANTS.map((v) => [v, ranks[v][i]])),
      rank_range: [Math.min(...rs), Math.max(...rs)],
      rating_registry: Math.round(ratings.registry[i]),
      rating_lexicon: Math.round(ratings.lexicon[i]),
      // Leave-own-out applied: this writer's own model's phrases were left out of its score.
      own_phrases_removed: ownModel(id) !== null,
      battles: players.reduce((a, _, j) => a + (rated(i, j) ? w[i][j] + w[j][i] : 0), 0),
      wins: +players.reduce((a, _, j) => a + (rated(i, j) ? w[i][j] : 0), 0).toFixed(1),
      median_per1k: +median(per1k.map((r) => r[i])).toFixed(2),
      mean_per1k: +(has.reduce((a, r) => a + r[i], 0) / has.length).toFixed(2),
      clean_share: +(has.filter((r) => r[i] === 0).length / has.length).toFixed(3),
      // People on the same topics, so a run on a few hundred topics compares with its own human twins.
      human_median_per1k: +median(has.map((r) => r[hi])).toFixed(2),
      human_mean_per1k: +(has.filter((r) => !Number.isNaN(r[hi])).reduce((a, r) => a + r[hi], 0) / Math.max(1, has.filter((r) => !Number.isNaN(r[hi])).length)).toFixed(2),
      win_vs_people: i === hi ? null : +(w[i][hi] / Math.max(1, w[i][hi] + w[hi][i])).toFixed(3),
    };
  }).sort((a, b) => a.ranks.total - b.ranks.total),
  winrate: { order: players, matrix: winrate },
};
writeFileSync(join(root(), "data/measured/arena.json"), JSON.stringify(out, null, 1));
for (const p of out.players) console.log(`${p.id.padEnd(26)} ${p.source.padEnd(10)} ${String(p.rating).padStart(5)}  [${p.low}, ${p.high}]  ranks ${p.rank_range[0]}-${p.rank_range[1]} (total ${p.ranks.total}, rules ${p.ranks.registry}, phrases ${p.ranks.lexicon})  ${String(p.battles).padStart(6)} rated battles on ${p.topics} topics  median ${p.median_per1k} pts/1k (people on the same topics ${p.human_median_per1k})`);
console.log(`rules-only vs phrase-list-only order, Spearman over ${out.scoring.spearman_models} models: ${out.scoring.spearman_registry_lexicon}; triad rule: ${Math.round(out.scoring.triad_share_of_rule_points * 100)}% of the models' rule points`);
console.log(promptOffset ? `prompt offset (bridge minus Graphite): mean ${promptOffset.mean}; ${promptOffset.models.map((o) => `${o.model} ${o.offset} [${o.low}, ${o.high}], bridge cleaner on ${Math.round(o.win_rate * 100)}% of ${o.shared_topics} shared topics`).join("; ")}` : "prompt offset: no bridge run present (measure/runs/api-<graphite model id>/matched.jsonl)");
