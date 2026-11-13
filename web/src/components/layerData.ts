// The four measured layers, each reduced to what a sheet of the stack draws: points, a few labels, model anchors
// and release trails, in the sheet's own unit square. Prose comes from map.json (the prose atlas), interface from
// ui-map.json, and code and conduct from code-map.json and conduct-map.json once they exist
// (scripts/copy-layer-maps.ts copies them from data/measured/). A layer whose file is missing shows as "measuring now".
import { models as proseModels, phrases } from "./AtlasMap";
import uiRaw from "../data/ui-map.json";
import type { LayerId } from "./layers";
import { famVar, byFamily } from "./families";

/** The order of the stack, top to bottom: from what a reader sees (prose, pages) to what lies under it (code). */
// Conduct has tells in the registry but no sheet: its only runs came from one maker's agent, which is no basis for a map of models.
export const STACK: LayerId[] = ["prose", "interface", "code"];
export const LAYER_NAME: Record<LayerId, string> = { prose: "Prose", interface: "Interface", code: "Code", conduct: "Conduct" };

// the generic layer shape (ui-map.json, code-map.json, conduct-map.json)
export type Owned = { token: string; pages?: number; points?: number; of: number; others: number; p: number };
export type GModel = { id: string; route?: string; name: string; family: string; released: string | null; date_url?: string | null; x: number; y: number; n: number; complete?: boolean; active?: boolean; owns: Owned[] };
export type GToken = { id: string; label: string; group?: string; n: number; x: number | null; y: number | null; share: number[] };
export type GPoint = { model: number; x: number; y: number; text: string; title?: string; file?: string; lang?: string; t?: number[] };
export type GLayer = {
  id: LayerId; models: GModel[]; tokens: GToken[]; points: GPoint[]; limits: string[]; explained?: number[];
  unit: [string, string]; primary?: string; generated?: string; method?: Record<string, unknown>; attribution?: string;
};

type Any = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Read any file in the ui-map shape, tolerating the field names a sibling script may use (points/pages, text/excerpt, released/release). */
export function normalize(id: LayerId, raw: Any, unit: [string, string]): GLayer {
  const ms = (raw.models as Any[] | undefined) ?? [];
  const ownedTop = (raw.owns ?? raw.owned) as Record<string, Owned[]> | Owned[][] | undefined;
  const models: GModel[] = ms.map((m, i) => ({
    id: String(m.id), route: str(m.route) ?? undefined, name: str(m.name) ?? String(m.id), family: str(m.family) ?? "other",
    released: str(m.released) ?? str(m.release), date_url: str(m.date_url), x: num(m.x), y: num(m.y),
    n: num(m.points ?? m.pages ?? m.transcripts ?? m.replies ?? m.n), complete: m.complete as boolean | undefined, active: m.active as boolean | undefined,
    owns: ((m.owns as Owned[] | undefined) ?? (Array.isArray(ownedTop) ? ownedTop[i] : ownedTop?.[String(m.id)]) ?? []) as Owned[],
  }));
  const tokens: GToken[] = ((raw.tokens as Any[] | undefined) ?? []).map((t) => ({
    id: String(t.id), label: str(t.label) ?? String(t.id), group: str(t.group) ?? undefined, n: num(t.points ?? t.pages ?? t.n),
    x: typeof t.x === "number" ? t.x : null, y: typeof t.y === "number" ? t.y : null, share: (t.share as number[] | undefined) ?? [],
  }));
  const pts = ((raw.points ?? raw.pages ?? raw.replies ?? raw.transcripts) as Any[] | undefined) ?? [];
  // An excerpt may be a string or { file, from, text }; a brief id reads better as the brief itself.
  const briefs = (raw.briefs ?? {}) as Record<string, { brief?: string }>;
  const points: GPoint[] = pts.map((p) => {
    const ex = p.excerpt && typeof p.excerpt === "object" ? (p.excerpt as Any) : null;
    const brief = str(p.brief);
    return {
      model: num(p.model), x: num(p.x), y: num(p.y),
      text: str(p.text) ?? str(ex?.text) ?? str(p.excerpt) ?? str(p.snippet) ?? str(p.h1) ?? "",
      title: str(p.title) ?? str(p.task) ?? (brief ? briefs[brief]?.brief ?? brief : undefined),
      file: str(ex?.file) ?? undefined, lang: str(p.lang) ?? undefined, t: p.t as number[] | undefined,
    };
  });
  return {
    id, models, tokens, points, unit, limits: (raw.limits as string[] | undefined) ?? [], explained: raw.explained as number[] | undefined,
    primary: str(raw.primary) ?? undefined, generated: str(raw.generated) ?? undefined, method: raw.method as Any | undefined, attribution: str(raw.attribution) ?? undefined,
  };
}

// Code and conduct arrive from another measurement run; until a file exists the glob is empty for it.
const optional = import.meta.glob<Any>("../data/{code,conduct}-map.json", { eager: true, import: "default" });
const fileOf = (name: string) => optional[`../data/${name}-map.json`];
export const UNITS: Record<LayerId, [string, string]> = { prose: ["phrase", "phrases"], interface: ["page", "pages"], code: ["reply", "replies"], conduct: ["transcript", "transcripts"] };
export const codeLayer: GLayer | null = fileOf("code") ? normalize("code", fileOf("code"), UNITS.code) : null;
export const conductLayer: GLayer | null = fileOf("conduct") ? normalize("conduct", fileOf("conduct"), UNITS.conduct) : null;
export const uiLayer: GLayer = normalize("interface", uiRaw as unknown as Any, UNITS.interface);

// shared model keys
/** One key per model across layers: "claude-opus-5.5" (prose) and "claude-opus-5-5" (interface) are the same model. */
export const modelKey = (id: string) => id.split("/").pop()!.toLowerCase().replace(/-\d{8}$/, "").replace(/\./g, "-").replace(/-(preview|latest)$/, "");

// sheets
/** Sheet units: u across 0..1, v down 0..ASPECT. */
export const ASPECT = 0.64;
export type SheetPoint = { u: number; v: number; c: string; r: number; sprite?: number; alpha: number };
export type SheetAnchor = { key: string; name: string; family: string; released: string | null; u: number; v: number };
export type SheetLabel = { u: number; v: number; text: string; serif: boolean };
export type Sheet = {
  id: LayerId; name: string; ready: boolean; count: string; points: SheetPoint[]; anchors: SheetAnchor[]; labels: SheetLabel[];
  origin?: { u: number; v: number; label: string }; sprite?: { src: string; w: number; h: number; cols: number };
  /** How map units became sheet units, and the box the full map fits to its window: together they let a sheet land exactly where its map draws. */
  frame?: Frame; box?: Box;
};
export type Frame = { cx: number; cy: number; k: number; yUp: boolean };
export type Box = { x0: number; x1: number; y0: number; y1: number };

const q = (a: number[], f: number) => { const v = [...a].sort((m, n) => m - n); return v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))] ?? 0; };
/** One uniform scale for both axes, so distances on the sheet keep the map's geometry. yUp flips maps whose y axis points up. */
function fitter(xs: number[], ys: number[], yUp: boolean) {
  const x0 = Math.min(q(xs, 0.03)), x1 = Math.max(q(xs, 0.97)), y0 = q(ys, 0.03), y1 = q(ys, 0.97);
  const pad = 0.07;
  const k = Math.min((1 - 2 * pad) / Math.max(x1 - x0, 1e-9), (ASPECT - 2 * pad) / Math.max(y1 - y0, 1e-9));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const at = (x: number, y: number) => ({ u: 0.5 + (x - cx) * k, v: ASPECT / 2 + (yUp ? -(y - cy) : y - cy) * k });
  return Object.assign(at, { frame: { cx, cy, k, yUp } as Frame });
}
/** The box each full map fits to its window. These mirror fit() in AtlasMap, LayerAtlas and InterfaceAtlas; change them together. */
const spanBox = (xs: number[], ys: number[]): Box => ({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
const trimBox = (xs: number[], ys: number[], f: number, mx: number[], my: number[]): Box => ({ x0: Math.min(q(xs, f), ...mx), x1: Math.max(q(xs, 1 - f), ...mx), y0: Math.min(q(ys, f), ...my), y1: Math.max(q(ys, 1 - f), ...my) });
const inside = (p: { u: number; v: number }) => p.u >= 0.01 && p.u <= 0.99 && p.v >= 0.01 && p.v <= ASPECT - 0.01;
const fmt = (n: number) => n.toLocaleString("en");
/** Every k-th item, so a big layer keeps its spread at a few hundred marks. */
const thin = <T,>(a: T[], max: number) => (a.length <= max ? a : a.filter((_, i) => Math.floor((i * max) / a.length) !== Math.floor(((i - 1) * max) / a.length)));
const MAX_POINTS = 360;

function proseSheet(): Sheet {
  const ranked = phrases.map((d) => ({ d, rank: (d.tell ? 3 : 0) + Math.min(d.strength, 6) + 1.5 * Math.log2(Math.max(d.reach, 150) / 150) })).sort((a, b) => b.rank - a.rank);
  const over = ranked.filter((e) => !e.d.under).slice(0, 300), under = ranked.filter((e) => e.d.under).slice(0, 60);
  const pick = [...under, ...over];
  // Fit the phrases; models and the human point sit inside that frame on this map (anchors are drawn even near the edge).
  const at = fitter(pick.map((e) => e.d.x), pick.map((e) => e.d.y), false);
  const owner = (e: (typeof pick)[number]) => {
    let best = -1, bv = 0;
    e.d.v.forEach((v, i) => { if ((e.d.own >> i) & 1 && v !== null && Math.abs(v) > bv) { bv = Math.abs(v); best = i; } });
    return best >= 0 ? proseModels[best].family : null;
  };
  const points = pick.map((e) => ({ ...at(e.d.x, e.d.y), c: e.d.under ? "--ink-3" : famVar(owner(e)), r: 0.0042 + Math.min(e.d.strength, 8) * 0.0005, alpha: e.d.under ? 0.5 : 0.75 })).filter(inside);
  const labels = over.filter((e) => e.d.tell).slice(0, 5).map((e) => ({ ...at(e.d.x, e.d.y), text: e.d.term.replace(/ _ /g, " … "), serif: true }));
  const anchors = proseModels.map((m) => ({ key: modelKey(m.id), name: m.name, family: m.family, released: m.released, ...at(m.x, m.y) })).filter(inside);
  return { id: "prose", name: "Prose", ready: true, count: `${fmt(phrases.length)} phrases, ${proseModels.length} models`, points, anchors, labels, origin: { ...at(0, 0), label: "Human" },
    frame: at.frame, box: spanBox([...proseModels.map((m) => m.x), ...phrases.map((d) => d.x), 0], [...proseModels.map((m) => m.y), ...phrases.map((d) => d.y), 0]) };
}

/** Interface, code and conduct: the main set's points, the tokens that split models most, and the models with enough points to place. */
export function genericSheet(L: GLayer | null, id: LayerId): Sheet {
  if (!L) return { id, name: LAYER_NAME[id], ready: false, count: "Measuring now", points: [], anchors: [], labels: [] };
  const main = L.models.map((m, i) => ({ m, i })).filter((e) => (!L.primary || !e.m.route || e.m.route === L.primary) && e.m.active !== false && e.m.n >= 6);
  const mainIdx = new Set(main.map((e) => e.i));
  const pts = thin(L.points.filter((p) => mainIdx.has(p.model)), MAX_POINTS);
  const at = fitter([...pts.map((p) => p.x), ...main.map((e) => e.m.x)], [...pts.map((p) => p.y), ...main.map((e) => e.m.y)], true);
  const sprite = id === "interface" ? (uiRaw as unknown as { sprite: Sheet["sprite"] }).sprite : undefined;
  const points = pts.map((p) => {
    const raw = L.points.indexOf(p);
    return { ...at(p.x, p.y), c: famVar(L.models[p.model]?.family), r: 0.0055, alpha: 0.8, sprite: sprite ? raw : undefined };
  }).filter(inside);
  const spread = (t: GToken) => { const v = main.map((e) => t.share[e.i] ?? 0); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
  const labels = L.tokens.filter((t) => t.x !== null && t.group !== "tell").sort((a, b) => spread(b) - spread(a)).slice(0, 4)
    .map((t) => ({ ...at(t.x!, t.y!), text: t.label, serif: false })).filter(inside);
  const anchors = main.map(({ m }) => ({ key: modelKey(m.id), name: m.name, family: m.family, released: m.released, ...at(m.x, m.y) }));
  const n = L.points.filter((p) => mainIdx.has(p.model)).length;
  const route = L.models.map((m, i) => ({ m, i })).filter((e) => !L.primary || !e.m.route || e.m.route === L.primary);
  const routeIdx = new Set(route.map((e) => e.i));
  const all = L.points.filter((p) => routeIdx.has(p.model));
  // Interface fits its pages and tokens to the middle 90% and its active models; code and conduct fit points to the middle 92% and every model.
  const box = id === "interface"
    ? trimBox([...all.map((p) => p.x), ...L.tokens.filter((t) => t.x !== null).map((t) => t.x!)], [...all.map((p) => p.y), ...L.tokens.filter((t) => t.y !== null).map((t) => t.y!)], 0.05, route.filter((e) => e.m.active !== false).map((e) => e.m.x), route.filter((e) => e.m.active !== false).map((e) => e.m.y))
    : trimBox(all.map((p) => p.x), all.map((p) => p.y), 0.04, route.map((e) => e.m.x), route.map((e) => e.m.y));
  return { id, name: LAYER_NAME[id], ready: true, count: `${fmt(n)} ${L.unit[n === 1 ? 0 : 1]}, ${main.length} models`, points, anchors, labels, sprite, frame: at.frame, box };
}

let cache: Sheet[] | null = null;
export function sheets(): Sheet[] {
  cache ??= [proseSheet(), genericSheet(uiLayer, "interface"), genericSheet(codeLayer, "code")];
  return cache;
}

/** Models placed on two or more sheets, newest first within each family: the threads through the stack. */
export function sharedModels(all: Sheet[]) {
  const by = new Map<string, { key: string; name: string; family: string; released: string | null; on: LayerId[] }>();
  for (const s of all) for (const a of s.anchors) {
    const e = by.get(a.key) ?? { key: a.key, name: a.name, family: a.family, released: a.released, on: [] };
    if (!e.on.includes(s.id)) e.on.push(s.id);
    if (!e.released && a.released) e.released = a.released;
    by.set(a.key, e);
  }
  return [...by.values()].filter((e) => e.on.length >= 2).sort((a, b) => byFamily(a.family, b.family) || (b.released ?? "").localeCompare(a.released ?? ""));
}
