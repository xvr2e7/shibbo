// Gather everything the web app shows into web/src/data/*.json.
//   npm run web:data
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { tells, models, graphite, sources, root, apiRuns } from "../src/registry.js";
import { rulesMarkdown, strength } from "../src/rules.js";

const R = root();
const OUT = join(R, "web", "src", "data");
mkdirSync(OUT, { recursive: true });
const g = graphite();
if (!g) throw new Error("run npm run import:graphite first");
const ms = models();
// shibbo's own API runs (scripts/import_local.py -> data/measured/api.json): a few hundred articles each.
const api = apiRuns();
const apiIds = new Set((api?.models ?? []).map((m) => m.id));

/** Typographic quotes and apostrophes for display text (patterns are left alone). */
const sq = (x?: string) =>
  x === undefined ? x : x.replace(/(^|[\s(\[{\/])"/g, "$1“").replace(/"/g, "”").replace(/(^|[\s(\[{])'/g, "$1‘").replace(/'/g, "’");
const display = <T extends { name: string; what: string; label?: string; fix?: string; false_positives?: string; examples?: { bad?: string; good?: string }; substitutes?: string[] }>(t: T): T => ({
  ...t,
  name: sq(t.name)!,
  label: sq(t.label),
  what: sq(t.what)!,
  fix: sq(t.fix),
  false_positives: sq(t.false_positives),
  examples: t.examples ? { bad: sq(t.examples.bad), good: sq(t.examples.good) } : undefined,
  substitutes: t.substitutes?.map((x) => sq(x)!),
});

const tellRows = tells().map(display).map((t) => {
  const perModel = Object.fromEntries(
    ms.models.filter((m) => m.graphite).map((m) => {
      const n = g.tells[t.id]?.[m.id];
      const f = g.tellFeatures[t.id]?.models[m.id];
      const hasTerms = !!n && Object.values(g.tells[t.id]).some((x) => x.ratio !== null);
      if (hasTerms && n!.ratio !== null) return [m.id, { ratio: n!.ratio, term: n!.term ?? null, counts: n!.counts ?? null, floor: !!n!.floor, via: "phrase", counted: n!.via === "shibbo" || undefined }];
      if (!hasTerms && f && f.ratio !== null) return [m.id, { ratio: f.ratio, term: null, counts: null, floor: false, via: "feature" }];
      return [m.id, null];
    }),
  );
  // shibbo's API runs: the strongest linked phrase on its own topics, only when the paired sign test backs it.
  for (const m of api?.models ?? []) {
    const n = m.tells[t.id];
    perModel[m.id] = n && n.significant && (n.counts?.model ?? 0) + (n.counts?.human ?? 0) >= 10 && Math.abs(Math.log2(n.ratio ?? 1)) >= 1
      ? { ratio: n.ratio, term: n.term ?? null, counts: n.counts ?? null, floor: !!n.floor, via: "phrase", own: m.docs }
      : null;
  }
  return {
    ...t,
    perModel,
    feature: g.tellFeatures[t.id] ? { name: g.tellFeatures[t.id].feature, human: g.tellFeatures[t.id].human } : null,
    strength: strength(t, null),
  };
});

const modelRows = ms.models.filter((m) => m.graphite).map((m) => ({
  ...m,
  source: "graphite",
  maker: ms.families[m.family].maker,
  familyName: ms.families[m.family].name,
  tells: g.models[m.id].tells,
  shared: g.models[m.id].shared_with_previous,
  top: g.models[m.id].top.slice(0, 40),
  under: g.models[m.id].under.slice(0, 20),
  rules: rulesMarkdown({ model: m.id, limit: 10, phrases: 10 }),
  features: Object.fromEntries(
    ["layer1__punct_emdash_per1k", "layer5__llm_delve_per1k", "layer5__llm_crucial_per1k", "layer1__sent_len_mean", "layer5__bullet_line_per1k", "layer5__selfref_last_mirrors_first"].map((f) => [f, { mean: g.features[f].models[m.id].mean, d: g.features[f].models[m.id].d, human: g.features[f].human }]),
  ),
}));

// Earlier chat models measured from RAID against their matched human texts (scripts/import_raid.py).
const raidPath = join(R, "data/measured/raid.json");
const raid = existsSync(raidPath) ? JSON.parse(readFileSync(raidPath, "utf8")) : null;
const localPath = join(R, "data/measured/local.json");
const local = existsSync(localPath) ? JSON.parse(readFileSync(localPath, "utf8")) : null;
for (const [src, set] of [["raid", raid], ["local", local]] as const) {
  if (!set) continue;
  for (const m of set.models) {
    if (src === "local" && m.docs < 100) continue; // same floor as the map
    const L = m.log2ratio as Record<string, number>;
    for (const t of tellRows) {
      const terms = [...(t.measure?.graphite ?? []), ...(t.measure?.graphite_absent ?? [])].filter((x) => L[x] !== undefined);
      const absent = !!t.measure?.graphite_absent;
      let best: string | null = null;
      for (const x of terms) if (best === null || (absent ? L[x] < L[best] : L[x] > L[best])) best = x;
      let entry: unknown = null;
      if (best !== null && Math.abs(L[best]) >= 1) entry = { ratio: +(2 ** L[best]).toFixed(3), term: best, counts: null, floor: false, via: "phrase" };
      // No em-dash ratio for RAID: its human texts carry 0.17 em dashes per 1,000 words against 3.1 in Graphite's, a sign of normalized punctuation.
      (t.perModel as Record<string, unknown>)[m.id] = entry;
    }
    const top = Object.entries(L).filter(([k, v]) => v >= 3 && k.includes(" ") && !k.includes("_")).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([term, v]) => ({ term, kind: "ngram", ratio: +(2 ** v).toFixed(1), articles: 0 }));
    const under = Object.entries(L).filter(([, v]) => v <= -3).sort((a, b) => a[1] - b[1]).slice(0, 20).map(([term, v]) => ({ term, kind: "ngram", ratio: +(2 ** v).toFixed(4), articles: 0 }));
    modelRows.push({
      id: m.id, family: m.family, name: m.name, released: m.released, verified: m.verified ?? true, graphite: undefined, maker: m.lab, familyName: m.lab, source: src, docs: m.docs,
      tells: Object.values(L).filter((v) => v >= 1).length, shared: null, top, under, rules: "", features: {},
    } as unknown as (typeof modelRows)[number]);
  }
}

for (const m of api?.models ?? []) {
  const reg = ms.models.find((x) => x.id === m.id);
  modelRows.push({
    id: m.id, family: m.family, name: m.name, released: m.released, verified: reg?.verified ?? false, graphite: undefined,
    maker: ms.families[m.family]?.maker ?? m.lab, familyName: ms.families[m.family]?.name ?? m.family, source: "shibbo-api", docs: m.docs, date: m.date, run: m.run, api: m.api,
    tells: m.tells_count, shared: null,
    top: m.top.slice(0, 40), under: m.under.slice(0, 20),
    rules: reg ? rulesMarkdown({ model: m.id, limit: 10, phrases: 10 }) : "",
    features: {}, style: m.style, human_style: m.human_style,
  } as unknown as (typeof modelRows)[number]);
}

// Tell density per model: average tell points per 1,000 words, next to the human texts from the same source.
// 2025–26 models from the arena (Graphite's held-out topics); 2022–23 models from scripts/raid-per1k.ts.
function per1kTable() {
  const out: Record<string, { model: number; human: number; source: string }> = {};
  const arenaPath = join(R, "data/measured/arena.json");
  if (existsSync(arenaPath)) {
    const a = JSON.parse(readFileSync(arenaPath, "utf8")) as { players: Array<{ id: string; mean_per1k: number }> };
    const human = a.players.find((p) => p.id === "people")?.mean_per1k;
    const players = a.players as Array<{ id: string; mean_per1k: number; source?: string; human_mean_per1k?: number; bridge?: boolean }>;
    // shibbo's API runs compare with people on the same few hundred topics. A bridge run is a second copy of a
    // Graphite model (same model, shibbo's prompt), so it stays out of the per-model table.
    if (human !== undefined) for (const p of players) if (p.id !== "people" && !p.bridge) out[p.id] = p.source === "shibbo-api" ? { model: p.mean_per1k, human: p.human_mean_per1k ?? human, source: "shibbo-api" } : { model: p.mean_per1k, human, source: "graphite" };
  }
  for (const m of raid?.models ?? []) if (m.per1k) out[m.id] = { model: m.per1k.model_mean, human: m.per1k.human_mean, source: "raid" };
  return out;
}

// Habits: style features Graphite measured per model, as effect sizes against people (Cohen's d).
// sign: +1 when models doing more of it is the tell; -1 when the tell is doing less than people.
const HABITS: Array<{ key: string; label: string; glyph: string; what: string; unit: string; sign: 1 | -1; tell?: string }> = [
  { key: "layer1__punct_emdash_per1k", label: "Em dashes", glyph: "—", what: "Em dashes per 1,000 words", unit: "per 1k words", sign: 1, tell: "em-dash-density" },
  { key: "layer5__dash_emdash_clause_mean_words", label: "Long dash asides", glyph: "—…—", what: "Words inside each em-dash clause", unit: "words", sign: 1 },
  { key: "layer5__hedge_stack_mean_per_sent", label: "Stacked hedges", glyph: "∼", what: "Hedges stacked in one sentence", unit: "per sentence", sign: 1, tell: "soft-hedging" },
  { key: "layer5__selfref_last_mirrors_first", label: "Echo ending", glyph: "↩", what: "Share of articles whose last paragraph restates the first", unit: "share", sign: 1, tell: "formulaic-close" },
  { key: "constructions__frame_antithesis_per1k", label: "Not X but Y", glyph: "↔", what: "Antithesis frames per 1,000 words", unit: "per 1k words", sign: 1, tell: "contrastive-negation" },
  { key: "constructions__frame_concessive_per1k", label: "While X, Y", glyph: "⇄", what: "Concessive frames per 1,000 words", unit: "per 1k words", sign: 1 },
  { key: "layer5__llm_hallmark_total_per1k", label: "Stock AI words", glyph: "✱", what: "Words like crucial, landscape, foster, nuance", unit: "per 1k words", sign: 1, tell: "showcase-underscore" },
  { key: "layer5__bp_opener_per1k", label: "Boilerplate openers", glyph: "¶", what: "Stock opening sentences", unit: "per 1k words", sign: 1, tell: "landscape" },
  { key: "layer5__close_cta_in_tail", label: "Call-to-action close", glyph: "→", what: "Ending on a call to action", unit: "share", sign: 1 },
  { key: "layer5__close_hope_in_tail", label: "Hopeful-future close", glyph: "☀", what: "Ending on hope for the future", unit: "share", sign: 1 },
  { key: "layer5__close_formula_in_tail", label: "Formula close", glyph: "∴", what: "Ending on a formula such as “in conclusion”", unit: "share", sign: 1, tell: "formulaic-close" },
  { key: "layer5__rep_content_word_overuse", label: "Repeated key words", glyph: "≡", what: "Content words used again and again", unit: "score", sign: 1 },
  { key: "layer5__has_mixed_list_types", label: "Mixed lists", glyph: "•", what: "Bullets and numbers mixed in one article", unit: "share", sign: 1, tell: "header-bullet-everything" },
  { key: "layer1__word_len_mean", label: "Longer words", glyph: "Aa", what: "Average word length", unit: "letters", sign: 1, tell: "robust-holistic" },
  { key: "layer1__ttr", label: "Varied vocabulary", glyph: "≠", what: "Share of distinct words (type-token ratio)", unit: "ratio", sign: 1 },
  { key: "layer1__sent_len_std", label: "Even sentences", glyph: "≈", what: "Spread of sentence lengths (models vary less)", unit: "words", sign: -1, tell: "uniform-rhythm" },
  { key: "layer5__syco_phrase_per1k", label: "Flattery", glyph: "♡", what: "Sycophantic phrases (people use more in these articles)", unit: "per 1k words", sign: 1 },
  { key: "layer1__punct_question_per1k", label: "Questions", glyph: "?", what: "Question marks per 1,000 words", unit: "per 1k words", sign: 1 },
  { key: "layer1__punct_exclaim_per1k", label: "Exclamations", glyph: "!", what: "Exclamation marks per 1,000 words", unit: "per 1k words", sign: 1 },
  { key: "layer5__selfref_signpost_per1k", label: "Signposting", glyph: "☞", what: "“In this article…” and similar", unit: "per 1k words", sign: 1, tell: "guide-signpost" },
];
const habits = HABITS.filter((h) => g.features[h.key]).map((h) => ({
  ...h,
  human: g.features[h.key].human,
  models: Object.fromEntries(Object.entries(g.features[h.key].models).map(([id, v]) => [id, { mean: v.mean, d: v.d }])),
}));

const chronoPath = join(R, "data", "chronology.yaml");
const chronology = existsSync(chronoPath) ? YAML.parse(readFileSync(chronoPath, "utf8")) : { milestones: [], tells: [] };
for (const t of chronology.tells ?? []) { t.evidence = sq(t.evidence); t.tell = sq(t.tell); }
for (const m of chronology.milestones ?? []) m.note = sq(m.note);

const evalPath = join(R, "data/measured/eval.json");
const evalData = existsSync(evalPath) ? JSON.parse(readFileSync(evalPath, "utf8")) : null;
if (evalData) delete evalData.rules_train;

writeFileSync(join(OUT, "registry.json"), JSON.stringify({
  built: new Date().toISOString().slice(0, 10),
  tells: tellRows,
  models: modelRows,
  families: ms.families,
  eras: ms.eras,
  sources: sources(),
  graphite: { attribution: g.attribution, license: g.license, url: g.url, threshold: g.threshold },
  eval: evalData,
  raid: raid ? { source: raid.source, design: raid.design } : null,
  api: api ? { source: api.source, design: api.design, method: api.method } : null,
  expected: existsSync(join(R, "data/tracking/expected.yaml")) ? (YAML.parse(readFileSync(join(R, "data/tracking/expected.yaml"), "utf8")).expected ?? []).filter((e: { status: string; expires?: string }) => e.status !== "expired" && e.status !== "released" && (!e.expires || String(e.expires) >= new Date().toISOString().slice(0, 10))) : [],
  habits,
  arena: existsSync(join(R, "data/measured/arena.json")) ? JSON.parse(readFileSync(join(R, "data/measured/arena.json"), "utf8")) : null,
  per1k: per1kTable(),
  benchmarks: existsSync(join(R, "data/measured/benchmarks.yaml")) ? YAML.parse(readFileSync(join(R, "data/measured/benchmarks.yaml"), "utf8")) : null,
}));
// Merge reviewed additions when present (from the release research pass).
const addPath = join(R, "data", "chronology-releases.yaml");
if (existsSync(addPath)) {
  const add = YAML.parse(readFileSync(addPath, "utf8"));
  const have = new Set((chronology.milestones ?? []).map((m: { name: string }) => m.name.toLowerCase()));
  for (const m of add.milestones ?? []) if (!have.has(String(m.name).toLowerCase())) chronology.milestones.push(m);
  chronology.milestones.sort((a: { date: string }, b: { date: string }) => String(a.date).localeCompare(String(b.date)));
}
writeFileSync(join(OUT, "chronology.json"), JSON.stringify(chronology));
// Project news for the home page (data/news.yaml), newest first.
const newsPath = join(R, "data", "news.yaml");
const news = (existsSync(newsPath) ? (YAML.parse(readFileSync(newsPath, "utf8")) ?? []) : []) as Array<{ date: string }>;
writeFileSync(join(OUT, "news.json"), JSON.stringify(news.map((n) => ({ ...n, date: String(n.date).slice(0, 10) })).sort((a, b) => b.date.localeCompare(a.date))));

// Docs: a generated list of every source, so it never drifts from the data.
{
  const srcs = Object.values(sources()).filter((s) => s.url);
  const chronoSrc = new Map<string, string>();
  for (const t of chronology.tells ?? []) chronoSrc.set(t.source.url, t.source.title);
  for (const m of chronology.milestones ?? []) if (m.source?.url) chronoSrc.set(m.source.url, m.source.title || m.name);
  const lines = [
    "# Sources",
    "",
    "<!-- Generated by scripts/build-web-data.ts. Edit data/*.yaml instead. -->",
    "",
    "## Measurements",
    "",
    `- Graphite, [“AI Tells”](${g.url}) (2026), ${g.license}. Per-model rates for 2025–26 models, the atlas, and the checker’s phrase list.`,
    raid ? `- [RAID](${raid.source.url}) (Dugan et al., ACL 2024), ${raid.source.license}. Measured by shibbo for 2022–23 chat models against matched human texts.` : "",
    api?.models.length ? `- shibbo's own runs through maker APIs and OpenRouter (${api.models.map((m) => m.name).join(", ")}), on held-out Graphite topics against their human articles. [measure/](${api.source.url}).` : "",
    "- Model and lab icons: [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT). The marks belong to their owners.",
    "",
    "## Registry sources",
    "",
    "<!-- shibbo-ignore -->",
    ...srcs.map((s) => `- [${s.title}](${s.url}) (${s.kind})`),
    "<!-- /shibbo-ignore -->",
    "",
    `## Timeline sources (${chronoSrc.size})`,
    "",
    "<!-- shibbo-ignore -->",
    ...[...chronoSrc].sort((a, b) => a[1].localeCompare(b[1])).map(([u, t]) => `- [${t.replace(/[[\]]/g, "")}](${u})`),
    "<!-- /shibbo-ignore -->",
    "",
  ];
  writeFileSync(join(R, "docs", "concepts", "sources.md"), lines.filter((l) => l !== null).join("\n"));
}

// Brand icons (LobeHub Icons, MIT; the marks belong to their owners). Only the ones the app uses.
const ICON_DIR = join(R, "node_modules", "@lobehub", "icons-static-svg", "icons");
const BRANDS: Record<string, string[]> = {
  openai: ["openai"], anthropic: ["claude-color", "anthropic"], google: ["gemini-color", "google-color"], gemma: ["gemma-color"],
  meta: ["meta-color", "meta"], mistral: ["mistral-color"], deepseek: ["deepseek-color"], qwen: ["qwen-color"], xai: ["grok", "xai"],
  microsoft: ["microsoft-color"], moonshot: ["kimi-color", "moonshot"], zhipu: ["zhipu-color", "chatglm-color"], minimax: ["minimax-color"],
  cohere: ["cohere-color"], yi: ["yi-color"], nvidia: ["nvidia-color"], amazon: ["nova-color", "aws-color"], apple: ["apple"], tii: ["tii-color"],
  claudecode: ["claudecode-color"], codex: ["codex-color"], cursor: ["cursor"], copilot: ["githubcopilot", "copilot-color"], geminicli: ["geminicli-color"],
  windsurf: ["windsurf"], cline: ["cline"], roocode: ["roocode"], amp: ["amp-color"], goose: ["goose"], junie: ["junie-color"], kiro: ["kiro-color"],
  opencode: ["opencode"], github: ["github"],
  xiaomi: ["xiaomimimo"], tencent: ["hunyuan-color", "tencent-color"], baidu: ["wenxin-color", "baidu-color"], bytedance: ["doubao-color", "bytedance-color"],
  ibm: ["ibm"], ai2: ["ai2-color", "ai2"], ai21: ["ai21"], liquid: ["liquid"], stepfun: ["stepfun-color"],
};
const icons: Record<string, string> = {};
for (const [brand, names] of Object.entries(BRANDS)) {
  const file = names.map((n) => join(ICON_DIR, `${n}.svg`)).find((f) => existsSync(f));
  if (file) icons[brand] = readFileSync(file, "utf8").replace(/ height="1em"| width="1em"/g, "").replace(/<title>[^<]*<\/title>/, "");
}
writeFileSync(join(OUT, "icons.json"), JSON.stringify(icons));
copyFileSync(join(R, "data/measured/map.json"), join(OUT, "map.json"));
console.log(`icons: ${Object.keys(JSON.parse(readFileSync(join(OUT, "icons.json"), "utf8"))).length}; web data: ${tellRows.length} tells, ${modelRows.length} models, ${chronology.milestones?.length ?? 0} milestones, ${chronology.tells?.length ?? 0} historical tells`);
