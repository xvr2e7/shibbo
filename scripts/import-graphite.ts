// Turn Graphite's AI Tells measurements (CC BY 4.0) into data/measured/graphite.json.
// Usage: npm run import:graphite
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { root, tells, models, type Graphite, type LexEntry } from "../src/registry.js";

const R = root();
const raw = (f: string) => gunzipSync(readFileSync(join(R, "data/raw/graphite", f))).toString("utf8");

function csv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

// A tell, for counting purposes: used at least 2x as often by the model, in at least 20 model articles.
const THRESHOLD = { ratio: 2, articles: 20 };

const rows = csv(raw("tells_vs_human.csv.gz"));
const ms = models().models;
const bySlug = new Map(ms.map((m) => [m.graphite!, m]));

interface Row {
  kind: "ngram" | "frame";
  term: string;
  model: string; // shibbo model id
  modelSide: boolean;
  ratio: number; // model rate / human rate (<1 when human uses it more); "at least" estimate when one side is 0
  floor: boolean;
  modelArticles: number;
  humanArticles: number;
  modelRate: number;
  humanRate: number;
  modelCount: number;
  humanCount: number;
}

const parsed: Row[] = [];
for (const r of rows) {
  const m = bySlug.get(r.model);
  if (!m) continue;
  const modelSide = r.used_more_by === r.model;
  const modelCount = +r.model_count;
  const humanCount = +r.human_count;
  let ratio: number;
  let floor = false;
  if (r.ratio === "inf") {
    // One side never used it. Estimate a lower bound as if the other side had used it half a time.
    floor = true;
    ratio = modelSide ? modelCount * 2 : 1 / (humanCount * 2);
  } else {
    ratio = modelSide ? +r.ratio : 1 / +r.ratio;
  }
  parsed.push({
    kind: r.kind as Row["kind"],
    term: r.term,
    model: m.id,
    modelSide,
    ratio,
    floor,
    modelArticles: +r.model_articles,
    humanArticles: +r.human_articles,
    modelRate: +r.model_rate_per1k_positions,
    humanRate: +r.human_rate_per1k_positions,
    modelCount,
    humanCount,
  });
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const lex = (r: Row): LexEntry => ({ term: r.term, kind: r.kind, ratio: round(r.ratio, r.ratio < 1 ? 4 : 1), articles: r.modelSide ? r.modelArticles : r.humanArticles, ...(r.floor ? { floor: true, count: r.modelSide ? r.modelCount : r.humanCount } : {}) });

const out: Graphite = {
  attribution: 'Graphite, "AI Tells" (2026). https://graphite.io/five-percent/research/ai-tells',
  license: "CC BY 4.0",
  url: "https://graphite.io/research/ai-tells",
  threshold: THRESHOLD,
  models: {},
  tells: {},
  tellFeatures: {},
  features: {},
};

// Per-model tell sets, top lists and detection lexicons.
const tellSets = new Map<string, Set<string>>();
for (const m of ms) {
  const mine = parsed.filter((r) => r.model === m.id);
  const over = mine.filter((r) => r.modelSide && r.ratio >= THRESHOLD.ratio && r.modelArticles >= THRESHOLD.articles);
  tellSets.set(m.id, new Set(over.map((r) => `${r.kind}:${r.term}`)));
  const score = (r: Row) => Math.log(Math.min(r.ratio, 500)) * Math.log(r.modelArticles);
  const top = [...over].filter((r) => r.term.split(" ").length >= 2 || r.ratio >= 10).sort((a, b) => score(b) - score(a)).slice(0, 60);
  // Detection lexicon: strong, common, and multi-token or very skewed single words.
  const lexicon = over
    .filter((r) => r.ratio >= 8 && r.modelArticles >= 40 && (r.term.split(" ").length >= 2 || (r.ratio >= 15 && r.modelArticles >= 80)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 400);
  const under = mine
    .filter((r) => !r.modelSide && r.ratio <= 1 / 20 && r.humanArticles >= 100)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 30);
  out.models[m.id] = { tells: over.length, shared_with_previous: null, top: top.map(lex), lexicon: lexicon.map(lex), under: under.map(lex) };
}

// Version-to-version overlap within each family.
for (const fam of Object.keys(models().families)) {
  const seq = ms.filter((m) => m.family === fam).sort((a, b) => a.released.localeCompare(b.released));
  for (let i = 1; i < seq.length; i++) {
    const prev = tellSets.get(seq[i - 1].id)!;
    const cur = tellSets.get(seq[i].id)!;
    let shared = 0;
    for (const t of cur) if (prev.has(t)) shared++;
    out.models[seq[i].id].shared_with_previous = round(shared / cur.size, 3);
  }
}

// Per-tell, per-model measurements for every registry entry that names Graphite terms.
const index = new Map<string, Row>();
for (const r of parsed) index.set(`${r.model}|${r.term}`, r);
for (const t of tells()) {
  const terms = [...(t.measure?.graphite ?? []), ...(t.measure?.graphite_absent ?? [])];
  if (!terms.length) continue;
  const absent = !!t.measure?.graphite_absent;
  out.tells[t.id] = {};
  for (const m of ms) {
    const hits = terms.map((term) => ({ term, row: index.get(`${m.id}|${term}`) }));
    const found = hits.filter((h) => h.row);
    // Headline: the strongest over-use (or, for absence tells, the strongest under-use).
    const best = found.sort((a, b) => (absent ? a.row!.ratio - b.row!.ratio : b.row!.ratio - a.row!.ratio))[0];
    out.tells[t.id][m.id] = {
      ratio: best ? round(best.row!.ratio, best.row!.ratio < 1 ? 4 : 2) : null,
      rate: best ? best.row!.modelRate : null,
      human: best ? best.row!.humanRate : null,
      term: best?.term,
      articles: best?.row!.modelArticles,
      counts: best ? { model: best.row!.modelCount, human: best.row!.humanCount } : undefined,
      floor: best?.row!.floor || undefined,
      terms: hits.map((h) => ({ term: h.term, ratio: h.row ? round(h.row.ratio, h.row.ratio < 1 ? 4 : 2) : null })),
    };
  }
}

// Feature-based measures for tells that name a Graphite style feature.
const feats = csv(raw("features.csv.gz"));
const featByName = new Map(feats.map((r) => [r.feature, r]));
for (const t of tells()) {
  const f = t.measure?.graphite_feature;
  if (!f) continue;
  const r = featByName.get(f);
  if (!r) throw new Error(`${t.id}: unknown Graphite feature ${f}`);
  out.tellFeatures[t.id] = { feature: f, human: +r.human_mean, models: {} };
  for (const m of ms) {
    const mean = +r[`${m.graphite}_mean`];
    out.tellFeatures[t.id].models[m.id] = { mean: round(mean, 4), ratio: +r.human_mean ? round(mean / +r.human_mean, 3) : null, d: +r[`${m.graphite}_cohens_d_vs_human`] };
  }
}

// Style features: per-model mean and effect size against human text.
for (const r of feats) {
  const f = r.feature;
  const entry = { human: +r.human_mean, models: {} as Record<string, { mean: number; d: number }> };
  for (const m of ms) entry.models[m.id] = { mean: round(+r[`${m.graphite}_mean`], 4), d: +r[`${m.graphite}_cohens_d_vs_human`] };
  out.features[f] = entry;
}

mkdirSync(join(R, "data/measured"), { recursive: true });
writeFileSync(join(R, "data/measured/graphite.json"), JSON.stringify(out));
const summary = Object.entries(out.models).map(([id, v]) => `${id}: ${v.tells} tells, lexicon ${v.lexicon.length}, shared ${v.shared_with_previous ?? "-"}`);
console.log(summary.join("\n"));
console.log(`linked ${Object.keys(out.tells).length} registry tells; ${Object.keys(out.features).length} features`);
