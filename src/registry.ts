import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export type Domain = "prose" | "chat" | "code" | "ui" | "agent";
export type Kind = "lexical" | "structural" | "visual" | "behavioral";
export type Status = "rising" | "peaking" | "steady" | "fading" | "retired";

export interface Density {
  count: number;
  per: number;
}

export interface Detect {
  method: "regex" | "stat" | "judge";
  pattern?: string;
  flags?: string;
  fn?: string;
  density?: Density;
  judge?: string;
}

export interface Tell {
  id: string;
  name: string;
  /** Short display label (defaults to the first quoted phrase of name). */
  label?: string;
  domain: Domain;
  kind: Kind;
  severity: 0 | 1 | 2 | 3;
  what: string;
  detect: Detect;
  measure?: { graphite?: string[]; graphite_feature?: string; graphite_absent?: string[] };
  era?: { first_seen?: number | string; peak?: number | string };
  status: Status;
  substitutes?: string[];
  fix?: string;
  examples?: { bad?: string; good?: string };
  false_positives?: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  /** Why a tell is advisory (severity 0): the evidence that it doesn't separate models from people. */
  advisory?: string;
  /** Sub-group within a domain, e.g. typography or color for ui. */
  group?: string;
  /** Model families a source says show this tell. */
  models?: string[];
  /** What the tell looks like: an HTML mockup (ui), code lines (code) or a short exchange (agent, chat). */
  specimen?: { html?: string; code?: string[]; hit?: number[]; lang?: string; chat?: Array<{ role: string; text: string }> };
}

export interface Source {
  title: string;
  url: string | null;
  kind: "measured" | "curated" | "folk" | "essay" | "primary";
  author?: string;
  date?: string;
}

export interface Model {
  id: string;
  family: string;
  name: string;
  released: string;
  verified: boolean;
  /** Graphite's corpus name, for models Graphite measured. */
  graphite?: string;
  /** "shibbo-api": measured by shibbo's own run through the maker's API (data/measured/api.json). Graphite otherwise. */
  source?: "graphite" | "shibbo-api";
  /** Model id as the maker's API names it. */
  api?: string;
  /** The run directory under measure/runs/. */
  run?: string;
  /** Articles measured, for shibbo's own runs. */
  articles?: number;
}

export interface Models {
  families: Record<string, { name: string; maker: string }>;
  models: Model[];
  aliases: Record<string, string>;
  eras: Array<{
    id: string;
    label: string;
    period: number;
    source: string;
    note: string;
    words: Array<{ term: string; ratio: number }>;
  }>;
}

/** Per-model measurement of one term or tell, as a ratio against human text (>1 = model uses it more). */
export interface Measure {
  ratio: number | null;
  rate: number | null;
  human: number | null;
  term?: string;
  articles?: number;
  /** Raw occurrence counts behind the ratio. */
  counts?: { model: number; human: number };
  /** One side never used it; ratio is a lower-bound estimate (2x the count). */
  floor?: boolean;
  /** "shibbo": Graphite's table left this model out, so the value comes from shibbo's own count of the same articles. */
  via?: "shibbo";
  /** For shibbo counts: paired sign test over topics, q < 0.01. */
  significant?: boolean;
}

export interface LexEntry {
  term: string;
  kind: "ngram" | "frame";
  ratio: number;
  articles: number;
  /** One side never used it: ratio is a lower bound; count is the other side's raw uses. */
  floor?: boolean;
  count?: number;
}

export interface Graphite {
  attribution: string;
  license: string;
  url: string;
  threshold: { ratio: number; articles: number };
  models: Record<
    string,
    {
      tells: number;
      shared_with_previous: number | null;
      top: LexEntry[];
      lexicon: LexEntry[];
      under: LexEntry[];
    }
  >;
  tells: Record<string, Record<string, Measure & { terms: Array<{ term: string; ratio: number | null }> }>>;
  tellFeatures: Record<string, { feature: string; human: number; models: Record<string, { mean: number; ratio: number | null; d: number }> }>;
  features: Record<string, { human: number; models: Record<string, { mean: number; d: number }> }>;
}

const here = dirname(fileURLToPath(import.meta.url));

/** Walk up from this file to the package root (works from src/ and dist/src/). */
export function root(): string {
  let dir = here;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "data", "tells.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("shibbo: cannot find data/tells.yaml");
}

const cache = new Map<string, unknown>();
function load<T>(rel: string, parse: (s: string) => T): T {
  if (!cache.has(rel)) cache.set(rel, parse(rel.includes(":") ? "" : readFileSync(join(root(), rel), "utf8")));
  return cache.get(rel) as T;
}

/** Extra files in data/<dir>/ (one per research area), merged after the main file. */
function extras(dir: string): string[] {
  const d = join(root(), "data", dir);
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".yaml")).sort().map((f) => `data/${dir}/${f}`) : [];
}
export const tells = () =>
  load<Tell[]>("tells:all", () => [
    ...(YAML.parse(readFileSync(join(root(), "data/tells.yaml"), "utf8")) as Tell[]),
    ...extras("tells.d").flatMap((f) => (YAML.parse(readFileSync(join(root(), f), "utf8")) as Tell[]) ?? []),
  ]);
export const sources = () =>
  load<Record<string, Source>>("sources:all", () =>
    Object.assign({}, YAML.parse(readFileSync(join(root(), "data/sources.yaml"), "utf8")), ...extras("sources.d").map((f) => YAML.parse(readFileSync(join(root(), f), "utf8")) ?? {})),
  );
export const models = () => load<Models>("data/models.yaml", (s) => YAML.parse(s));
/** One model measured by shibbo's own API run (scripts/import_local.py -> data/measured/api.json). */
export interface ApiRun {
  id: string; name: string; family: string; lab: string; released: string; verified: boolean;
  run: string; api: string; date: string; docs: number; human_docs: number; words: number; human_words: number;
  style: Record<string, number>; human_style: Record<string, number>; tells_count: number;
  top: Array<LexEntry & { human_count: number; human_articles: number }>; under: Array<LexEntry & { human_count: number; human_articles: number; model_count?: number }>;
  lexicon: LexEntry[]; tells: Record<string, Measure & { terms: Array<{ term: string; ratio: number | null }> }>; log2ratio: Record<string, number>;
}
export function apiRuns(): { source: { title: string; url: string; license: string }; design: string; method: Record<string, unknown>; models: ApiRun[] } | null {
  const p = join(root(), "data", "measured", "api.json");
  if (!existsSync(p)) return null;
  return load("data/measured/api.json", (s) => JSON.parse(s));
}

/**
 * Graphite's measurements, plus the models shibbo measured through their APIs, so the checker and the rules can tune
 * to them. Their phrase lists stay out of `top` (rules cite those as Graphite's); `lexicon` and `tells` carry them.
 */
export function graphite(): Graphite | null {
  const p = join(root(), "data", "measured", "graphite.json");
  if (!existsSync(p)) return null;
  return load<Graphite>("graphite:merged", () => {
    const g = JSON.parse(readFileSync(p, "utf8")) as Graphite;
    const known = new Set(models().models.filter((m) => m.source === "shibbo-api").map((m) => m.id));
    for (const m of apiRuns()?.models ?? []) {
      if (!known.has(m.id) || g.models[m.id]) continue;
      g.models[m.id] = { tells: m.tells_count, shared_with_previous: null, top: [], lexicon: m.lexicon, under: m.under };
      for (const [tid, v] of Object.entries(m.tells)) (g.tells[tid] ??= {})[m.id] = v;
    }
    return g;
  });
}

/** Resolve any model id a harness might report ("claude-opus-5-5", "gpt-6") to a measured model, or null. */
/** The measured model an id names. `exact` is false when only the family matched and the newest measured sibling stands in. */
export function matchModel(id: string | undefined | null): { model: Model; exact: boolean } | null {
  if (!id) return null;
  const m = models();
  const norm = id.toLowerCase().replace(/\[.*\]$/, "").trim();
  const direct = m.models.find((x) => x.id === norm || x.graphite === norm || x.api === norm);
  if (direct) return { model: direct, exact: true };
  const alias = m.aliases[norm];
  if (alias) {
    const hit = m.models.find((x) => x.id === alias);
    // An alias is exact when it spells the same model another way (dashes for dots, a provider prefix, a date);
    // "gpt-6" for GPT-6 Astra or an unmeasured release mapped to a sibling is a stand-in.
    const flat = (x: string) => x.replace(/^.*\//, "").replace(/\./g, "-");
    return hit ? { model: hit, exact: flat(norm) === flat(hit.id) || flat(norm).startsWith(flat(hit.id) + "-") } : null;
  }
  // Fall back to the newest measured model in the same family.
  const family = Object.keys(m.families).find((f) => norm.includes(f));
  if (!family) return null;
  const fam = m.models.filter((x) => x.family === family).sort((a, b) => a.released.localeCompare(b.released));
  const last = fam.at(-1);
  return last ? { model: last, exact: false } : null;
}

export function resolveModel(id: string | undefined | null): Model | null {
  return matchModel(id)?.model ?? null;
}
