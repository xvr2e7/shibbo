import registry from "./data/registry.json";
import chronologyRaw from "./data/chronology.json";

export type Fam = string;
export interface Measure { ratio: number; term: string | null; counts: { model: number; human: number } | null; floor: boolean; via: "phrase" | "feature" }
export interface Tell {
  id: string; name: string; label?: string; domain: string; kind: string; severity: number; what: string; status: string;
  fix?: string; examples?: { bad?: string; good?: string }; false_positives?: string; confidence: string; sources: string[];
  substitutes?: string[]; era?: { first_seen?: number | string; peak?: number | string };
  detect: { method: string; pattern?: string; flags?: string; fn?: string; judge?: string };
  measure?: { graphite?: string[]; graphite_feature?: string; graphite_absent?: string[] };
  perModel: Record<string, Measure | null>; feature: { name: string; human: number } | null; strength: number | null;
  group?: string; models?: string[]; advisory?: string;
  specimen?: { html?: string; code?: string[]; hit?: number[]; lang?: string; chat?: Array<{ role: string; text: string }> };
}
export interface Lex { term: string; kind: string; ratio: number; articles: number; floor?: boolean; count?: number }
export interface Model {
  id: string; family: Fam; name: string; released: string; verified: boolean; maker: string; familyName: string; source?: string; docs?: number;
  tells: number; shared: number | null; top: Lex[]; under: Lex[]; rules: string;
  features: Record<string, { mean: number; d: number; human: number }>;
}
export interface Source { title: string; url: string | null; kind: string; author?: string; date?: string }
export interface Milestone { id: string; name: string; maker?: string; lab?: string; date: string; kind: string; weights?: string; measured?: string[]; note?: string; source?: { title: string; url: string; kind?: string } }
export interface HistTell { id: string; era_start: string | number; era_end: string | number | null; systems?: string | string[]; tell: string; example?: string; evidence: string; source: { title: string; url: string; year?: number }; kind: string }

export const data = registry as unknown as {
  built: string; tells: Tell[]; models: Model[]; families: Record<Fam, { name: string; maker: string }>;
  eras: Array<{ id: string; label: string; period: number; source: string; note: string; words: Array<{ term: string; ratio: number }> }>;
  sources: Record<string, Source>; graphite: { attribution: string; license: string; url: string; threshold: { ratio: number; articles: number } };
  eval: null | {
    topics: { train: number; test: number }; half_life: number; own_model_boost: number;
    test: Record<"default" | "model_aware" | "registry_only", Record<string, { auc: number; flagged: number; median: number; human_flagged?: number }>>;
  };
};
export interface Habit { key: string; label: string; glyph: string; what: string; unit: string; sign: 1 | -1; tell?: string; human: number; models: Record<string, { mean: number; d: number }> }
export const habits = ((registry as unknown as { habits?: Habit[] }).habits ?? []) as Habit[];
export const chronology = chronologyRaw as { milestones: Milestone[]; tells: HistTell[] };

export const FAMS: Fam[] = ["gpt", "claude", "gemini", "meta", "mistral", "mosaic", "cohere", "qwen"];
export const ordered = FAMS.flatMap((f) => data.models.filter((m) => m.family === f).sort((a, b) => a.released.localeCompare(b.released)));
export const graphiteOrdered = ordered.filter((m) => m.source !== "raid");
export const tellById = new Map(data.tells.map((t) => [t.id, t]));
export const modelById = new Map(data.models.map((m) => [m.id, m]));

/** Months as an integer: year * 12 + month index. */
export const ym = (s: string | number): number => {
  const str = String(s);
  const [y, m] = str.split("-");
  return +y * 12 + (m ? +m - 1 : 0);
};
export const monthName = (i: number, style: "long" | "short" = "long") =>
  new Date(Date.UTC(Math.floor(i / 12), i % 12, 15)).toLocaleString("en", { month: style, year: "numeric", timeZone: "UTC" });

export const label = (t: Tell) => {
  if (t.label) return t.label.replace(/^[“"]([^”"]+)[”"]$/, "$1");
  const m = t.name.match(/^[“"]([^”"]+)[”"]/);
  return m ? m[1] : t.name;
};

export function fmtRatio(r: number): string {
  const big = (x: number) => (x >= 100 ? Math.round(x).toLocaleString("en") : x >= 10 ? x.toFixed(0) : x.toFixed(1));
  return r >= 1 ? `${big(r)}×` : `human ${big(1 / r)}×`;
}

/** Plain-language reading of one measurement. */
export function describe(m: Measure, model: Model): string {
  if (m.floor && m.counts) return m.ratio >= 1 ? `${model.name} used it ${m.counts.model.toLocaleString("en")} times; human writers never did` : `human writers used it ${m.counts.human.toLocaleString("en")} times; ${model.name} never did`;
  return m.ratio >= 1 ? `${model.name} uses it ${fmtRatio(m.ratio)} as often as human writers` : `human writers use it ${fmtRatio(m.ratio).replace("human ", "")} as often as ${model.name}`;
}

export const familyColor = (f: string) => (FAMS.includes(f) ? `var(--${f})` : "var(--other)");

/** Map a lab name from the chronology to a family colour when it is one of the three measured families. */
export function labFamily(lab = ""): string {
  const l = lab.toLowerCase();
  if (l.includes("openai")) return "gpt";
  if (l.includes("anthropic")) return "claude";
  if (l.includes("google") || l.includes("deepmind")) return "gemini";
  return "other";
}
