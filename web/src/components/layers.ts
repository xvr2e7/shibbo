// The four layers the Tells page sorts by (prose, code, interface, behavior), the year axis and the root habits
// that run through more than one layer. Root habits come from data/roots.json (scripts/build-roots-data.ts).
import { data, tellById, type Tell } from "../data";
import rootsRaw from "../data/roots.json";

export type LayerId = "prose" | "code" | "interface" | "behavior";
export interface Layer { id: LayerId; name: string; domains: string[]; blurb: string }

export const LAYERS: Layer[] = [
  { id: "prose", name: "Prose", domains: ["prose", "chat"], blurb: "Words a person reads: articles, replies, messages." },
  { id: "code", name: "Code", domains: ["code"], blurb: "Source, comments, tests and commits." },
  { id: "interface", name: "Interface", domains: ["ui"], blurb: "Pages and screens: color, type, layout, motion." },
  { id: "behavior", name: "Behavior", domains: ["agent"], blurb: "What an agent does while it works: its steps, its tool calls and how it reports." },
];
export const layerById = new Map(LAYERS.map((l) => [l.id, l]));
export const isLayer = (s: string | null | undefined): s is LayerId => !!s && layerById.has(s as LayerId);
export const layerOfDomain = (d: string): LayerId | null => LAYERS.find((l) => l.domains.includes(d))?.id ?? null;
export const layerOf = (t: Tell): LayerId => layerOfDomain(t.domain) ?? "prose";

/** Year columns. Tells with no first-seen year sit apart, in their own strip under each group. */
export const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
export const UNDATED = 0;
export const yearOf = (t: Tell): number => {
  const y = t.era?.first_seen;
  return y === undefined || y === null ? UNDATED : +String(y).slice(0, 4) || UNDATED;
};

export interface RootTell { id: string; name: string; layer: LayerId; first_seen: number | null }
export interface Root { id: string; name: string; what: string; tells: RootTell[] }
export const ROOTS: Root[] = (rootsRaw as { roots: Root[] }).roots.map((r) => ({ ...r, tells: r.tells.filter((t) => tellById.has(t.id)) }));
export const rootById = new Map(ROOTS.map((r) => [r.id, r]));

/** The roots each tell belongs to (a tell can sit in two). */
export const rootsOfTell = new Map<string, Root[]>();
for (const r of ROOTS) for (const t of r.tells) rootsOfTell.set(t.id, [...(rootsOfTell.get(t.id) ?? []), r]);

const GROUP_ORDER: Record<LayerId, string[]> = {
  prose: ["clarity", "vocabulary", "phrasing", "openers", "closers", "structure", "formatting", "punctuation", "tone", "disclaimers", "fiction"],
  code: ["comments", "structure", "errors", "tests", "deps", "output", "docs", "git"],
  interface: ["color", "typography", "layout", "components", "motion", "iconography", "copy", "imagery", "dataviz"],
  behavior: ["clarity", "claims", "scope", "process", "files", "tone", "safety"],
};
const GROUP_NAME: Record<string, string> = {
  typography: "Type", color: "Color", copy: "Interface copy", iconography: "Icons", dataviz: "Charts",
  errors: "Error handling", docs: "Docs and READMEs", git: "Commits and PRs", deps: "Dependencies", output: "Logs and output",
  lexical: "Words",
};
export const groupOf = (t: Tell) => t.group ?? (t.domain === "prose" || t.domain === "chat" ? (t.kind === "lexical" ? "lexical" : "structure") : "other");
export const groupName = (g: string) => GROUP_NAME[g] ?? g[0].toUpperCase() + g.slice(1);

/** A layer's groups in reading order: the known ones first, then any others A to Z. */
export function groupsOf(layer: LayerId, tells: Tell[]): string[] {
  const present = new Set(tells.map(groupOf));
  const known = GROUP_ORDER[layer].filter((g) => present.has(g));
  return [...known, ...[...present].filter((g) => !known.includes(g)).sort()];
}

export const tellsOfLayer = Object.fromEntries(LAYERS.map((l) => [l.id, data.tells.filter((t) => l.domains.includes(t.domain))])) as Record<LayerId, Tell[]>;
