// Checks the whole registry (data/tells.yaml plus data/tells.d/*.yaml):
// unique ids, known domains, regexes that compile and run fast, sources that resolve,
// a specimen for every tell you see (ui, code, agent) and an example pair for every tell you read.
//   npx tsx scripts/validate.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tells, sources, root, models, apiRuns } from "../src/registry.js";

const R = root();
const errors: string[] = [];
const warns: string[] = [];
let missed = 0;
const all = tells();
const src = sources();
const DOMAINS = new Set(["prose", "chat", "code", "ui", "agent"]);
const KINDS = new Set(["lexical", "structural", "visual", "behavioral"]);
const STATUS = new Set(["rising", "peaking", "steady", "fading", "retired"]);

// A mixed corpus for timing: the docs, the app source and some CSS.
const corpus = [
  ...readdirSync(join(R, "docs"), { recursive: true }).filter((f) => String(f).endsWith(".md")).map((f) => join(R, "docs", String(f))),
  join(R, "web/src/styles/app.css"),
  join(R, "web/src/routes/Atlas.tsx"),
  join(R, "src/check.ts"),
]
  .filter(existsSync)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const evil = "a".repeat(5000) + "!" + " ".repeat(5000) + "x";

const seen = new Map<string, number>();
for (const t of all) seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
for (const [id, n] of seen) if (n > 1) errors.push(`${id}: duplicate id (${n} entries)`);

for (const t of all) {
  const at = `${t.id}`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.id)) errors.push(`${at}: id must be kebab-case`);
  if (!DOMAINS.has(t.domain)) errors.push(`${at}: unknown domain ${t.domain}`);
  if (!KINDS.has(t.kind)) errors.push(`${at}: unknown kind ${t.kind}`);
  if (!STATUS.has(t.status)) errors.push(`${at}: unknown status ${t.status}`);
  if (![0, 1, 2, 3].includes(t.severity)) errors.push(`${at}: severity must be 0-3`);
  if (!t.name || !t.what) errors.push(`${at}: needs name and what`);
  if (!t.sources?.length) errors.push(`${at}: needs at least one source`);
  for (const s of t.sources ?? []) if (!src[s]) errors.push(`${at}: unknown source ${s}`);
  const d = t.detect;
  if (!d || !["regex", "stat", "judge"].includes(d.method)) errors.push(`${at}: detect.method must be regex, stat or judge`);
  if (d?.method === "regex") {
    if (!d.pattern) errors.push(`${at}: regex without pattern`);
    else {
      try {
        const re = new RegExp(d.pattern, (d.flags ?? "i").replace("g", "") + "g");
        const t0 = performance.now();
        corpus.match(re);
        evil.match(re);
        const ms = performance.now() - t0;
        if (ms > 150) errors.push(`${at}: regex took ${ms.toFixed(0)} ms on the test corpus`);
        else if (ms > 40) warns.push(`${at}: regex took ${ms.toFixed(0)} ms`);
        if (re.test("")) errors.push(`${at}: regex matches the empty string`);
        for (const m of (corpus + "\n" + (t.examples?.bad ?? "")).matchAll(re)) if (m[0] === "") { errors.push(`${at}: regex makes zero-width matches`); break; }
        if (t.examples?.bad && t.examples.bad.search(re) < 0) { missed++; warns.push(`${at}: pattern misses its own examples.bad`); }
      } catch (e) {
        errors.push(`${at}: bad regex: ${(e as Error).message}`);
      }
    }
  }
  if (d?.method === "judge" && !d.judge) errors.push(`${at}: judge without a question`);
  const sp = t.specimen;
  if (["ui", "code", "agent"].includes(t.domain) && !sp && !["purple-gradient", "tasteful-default", "inter-everywhere", "hero-pill-badge", "three-feature-cards", "glassmorphism", "gradient-text", "dot-separator-meta", "narrating-comments", "defensive-swallow", "emoji-logs", "speculative-abstraction"].includes(t.id))
    warns.push(`${at}: ${t.domain} tell without a specimen`);
  if (sp?.html && /<script|\son\w+=|url\(\s*['"]?https?:/i.test(sp.html)) errors.push(`${at}: specimen html must not load or run anything`);
  if (sp?.hit && sp.code && sp.hit.some((i) => i < 0 || i >= sp.code!.length)) errors.push(`${at}: specimen.hit out of range`);
  if (["prose", "chat"].includes(t.domain) && !t.examples?.bad && t.detect.method !== "stat") warns.push(`${at}: prose tell without an example`);
}

// shibbo's own API runs: each model entry names its run and the article count data/measured/api.json measured.
const runs = new Map((apiRuns()?.models ?? []).map((m) => [m.id, m]));
const ms = models();
for (const m of ms.models) {
  if (!ms.families[m.family]) errors.push(`model ${m.id}: unknown family ${m.family}`);
  if (m.source !== "shibbo-api") continue;
  const r = runs.get(m.id);
  if (!r) warns.push(`model ${m.id}: no measurements in data/measured/api.json (run npm run import:runs)`);
  else if (m.articles !== r.docs) errors.push(`model ${m.id}: articles ${m.articles} in models.yaml, ${r.docs} in api.json`);
}
for (const id of runs.keys()) if (!ms.models.some((m) => m.id === id)) warns.push(`api run ${id}: measured, but not in data/models.yaml yet (the checker and rules skip it)`);
for (const [a, id] of Object.entries(ms.aliases)) if (!ms.models.some((m) => m.id === id)) errors.push(`alias ${a}: unknown model ${id}`);

for (const [id, s] of Object.entries(src)) if (s.url && !/^https?:\/\//.test(s.url)) errors.push(`source ${id}: url must be http(s)`);
const used = new Set(all.flatMap((t) => t.sources ?? []));
const unused = Object.keys(src).filter((s) => !used.has(s));

const by = (k: (t: (typeof all)[number]) => string) => Object.entries(all.reduce<Record<string, number>>((a, t) => ((a[k(t)] = (a[k(t)] ?? 0) + 1), a), {}));
console.log(`${all.length} tells, ${Object.keys(src).length} sources (${unused.length} unused)`);
console.log("by domain:", by((t) => t.domain).map(([k, n]) => `${k} ${n}`).join(", "));
for (const w of warns) console.log("warn ", w);
if (missed) console.log(`${missed} regex ${missed === 1 ? "tell misses" : "tells miss"} their own bad example`);
for (const e of errors) console.log("ERROR", e);
if (errors.length) process.exit(1);
