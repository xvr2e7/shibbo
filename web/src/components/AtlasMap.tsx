// Canvas atlas: phrases as terrain, releases as routes. Pure drawing; time and hover state live in the page.
import { useEffect, useRef } from "react";
import { contourDensity } from "d3-contour";
import { zoom, zoomIdentity, type ZoomTransform, type ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import "d3-transition";
import { quadtree, type Quadtree } from "d3-quadtree";
import mapData from "../data/map.json";
import { ym, monthName, habits, type Habit } from "../data";

type Raw = [string, number, number, 0 | 1, string, number, ...Array<number | null>];
export type MapModel = { id: string; name: string; family: string; released: string; verified: boolean; source?: string; x: number; y: number; docs?: number };
/** v: per-model log2 ratio (null: too few uses to say). own: bit i set when model i over- or under-uses it by 4x or more, significantly, across 40+ articles. counts: see map-data.ts. */
export type Phrase = { term: string; x: number; y: number; under: boolean; tell: string; own: number; v: Array<number | null>; counts: number[]; reach: number; strength: number };

export const models = (mapData as { models: MapModel[] }).models;
const rawCounts = (mapData as unknown as { counts: number[][] }).counts;
export const phrases: Phrase[] = (mapData as unknown as { terms: Raw[] }).terms.map((r, i) => {
  const v = (r.slice(6) as Array<number | null>).map((x) => (x === null ? null : x / 10));
  const own = r[5];
  const c = rawCounts[i];
  const g = (mapData as { models: MapModel[] }).models.filter((m) => m.source === "graphite").length;
  // Reach: articles on the side that uses it more (people, or the widest-used owning model). Labels favour common phrases.
  const reach = r[3] === 1 ? c[1] : Math.max(0, ...Array.from({ length: g }, (_, k) => ((own >> k) & 1 ? c[3 + 2 * k] : 0)));
  return { term: r[0], x: r[1], y: r[2], under: r[3] === 1, tell: r[4], own, v, counts: c, reach, strength: Math.max(...v.map((x, k) => ((own >> k) & 1 && x !== null ? Math.abs(x) : 0))) };
});
/** Uses and articles behind a phrase for one model (index into models), with the human side it was compared with. */
export function phraseCounts(d: Phrase, i: number) {
  const c = d.counts, g = models.filter((m) => m.source === "graphite").length;
  if (i < g) return { model: c[2 + 2 * i], modelDocs: c[3 + 2 * i] as number | null, human: c[0], humanDocs: c[1] as number | null };
  const k = i - g;
  return { model: c[2 + 2 * g + 2 * k], modelDocs: null, human: c[3 + 2 * g + 2 * k], humanDocs: null };
}
export const mapWords = (mapData as unknown as { words: Record<string, number> }).words;
export const explained = (mapData as { explained: number }).explained;
export const firstMeasured = Math.min(...models.map((m) => ym(m.released)));
const idx = new Map(models.map((m, i) => [m.id, i]));
export const FAM_NAME: Record<string, string> = { gpt: "OpenAI", claude: "Claude", gemini: "Gemini", meta: "Llama", mistral: "Mistral", mosaic: "MPT", cohere: "Cohere", qwen: "Qwen" };
/** Families in a fixed order: the three measured in 2025-26 first, then the 2023 open and API models. */
export const FAMS = ["gpt", "claude", "gemini", "meta", "mistral", "mosaic", "cohere", "qwen"].filter((f) => models.some((m) => m.family === f));
/** A release counts as current for 18 months, or until the family's next measured release. */
const CURRENT_MONTHS = 18;

/** Which model is current in each family at a month, and which came before. */
export function state(month: number) {
  const current = new Map<string, MapModel>();
  const past = new Set<string>();
  for (const f of FAMS) {
    const seq = models.filter((x) => x.family === f && ym(x.released) <= month).sort((a, b) => ym(a.released) - ym(b.released));
    const last = seq.at(-1);
    if (last && month - ym(last.released) <= CURRENT_MONTHS) current.set(f, last);
    for (const x of seq) if (x !== current.get(f)) past.add(x.id);
  }
  return { current, past };
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const ease = (p: number) => 1 - (1 - p) ** 3;

export function phraseState(d: Phrase, current: Map<string, MapModel>, past: Set<string>) {
  let level = 0;
  let owner: string | null = null;
  for (const m of current.values()) {
    const i = idx.get(m.id)!;
    const v = d.v[i];
    if (!((d.own >> i) & 1) || v === null) continue;
    const s = d.under ? -v : v;
    if (s >= 2 && s > level) { level = s; owner = m.family; }
  }
  if (level) return { alive: true, fossil: false, owner, level };
  for (const id of past) {
    const i = idx.get(id)!;
    const v = d.v[i];
    if ((d.own >> i) & 1 && v !== null && (d.under ? -v : v) >= 2) return { alive: false, fossil: true, owner: null, level: 0 };
  }
  return { alive: false, fossil: false, owner: null, level: 0 };
}

export interface Hover { d?: Phrase; habit?: Habit; x: number; y: number }
export type Layers = { words: boolean; habits: boolean };

export function AtlasMap({ month, onHover, insets, resetSignal, layers = { words: true, habits: false }, focus = null }: { month: number; onHover: (h: Hover | null) => void; insets: { left: number; right: number; top: number; bottom: number }; resetSignal: number; layers?: Layers; focus?: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ t: zoomIdentity as ZoomTransform, W: 0, H: 0, dpr: 1, base: { k: 1, x: 0, y: 0 }, qt: null as Quadtree<{ d: Phrase; px: number; py: number }> | null, C: {} as Record<string, string>, raf: 0, focus: focus as string | null, target: month, shown: month, last: 0, insets, layers, z: null as ZoomBehavior<HTMLCanvasElement, unknown> | null, badges: [] as Array<{ h: Habit; x: number; y: number; r: number; o?: number }> });
  st.current.target = month;
  st.current.layers = layers;
  st.current.focus = focus;
  st.current.insets = insets;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      s.C = Object.fromEntries(["--sea", "--land-1", "--land-2", "--land-3", "--land-4", "--land-5", "--contour", "--hatch", "--fossil", "--ink", "--ink-2", "--ink-3", "--gpt", "--claude", "--gemini", "--meta", "--mistral", "--mosaic", "--cohere", "--qwen", "--halo", "--sheet"].map((n) => [n, cs.getPropertyValue(n).trim()]));
    };
    const sx = (x: number) => s.t.applyX(s.base.x + x * s.base.k);
    const sy = (y: number) => s.t.applyY(s.base.y + y * s.base.k);
    const fit = () => {
      const { left, right, top, bottom } = s.insets;
      const xs = [...models.map((m) => m.x), ...phrases.map((d) => d.x), 0];
      const ys = [...models.map((m) => m.y), ...phrases.map((d) => d.y), 0];
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const w = s.W - left - right - 48, h = s.H - top - bottom - 48;
      const k = Math.min(w / (x1 - x0), h / (y1 - y0));
      s.base = { k, x: left + 24 + (w - k * (x1 - x0)) / 2 - k * x0, y: top + 24 + (h - k * (y1 - y0)) / 2 - k * y0 };
    };
    let hatch: CanvasPattern | null = null;
    const makeHatch = () => {
      const p = document.createElement("canvas");
      p.width = p.height = 8 * s.dpr;
      const c = p.getContext("2d")!;
      c.scale(s.dpr, s.dpr);
      c.strokeStyle = s.C["--hatch"];
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, 8); c.lineTo(8, 0); c.moveTo(-2, 2); c.lineTo(2, -2); c.moveTo(6, 10); c.lineTo(10, 6); c.stroke();
      hatch = ctx.createPattern(p, "repeat");
      hatch?.setTransform(new DOMMatrix().scale(1 / s.dpr));
    };
    const ring = (rings: number[][][]) => {
      for (const r of rings) { r.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
    };
    const curve = (pts: Array<[number, number]>) => {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
      }
    };
    const font = (spec: string) => (ctx.font = spec);
    const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const SERIF = "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif";

    const draw = () => {
      const C = s.C;
      // Time is continuous: blend the month before and after, so terrain, routes and badges move instead of jumping.
      const t = s.shown, m0 = Math.floor(t), f = t - m0, f_ = f;
      const A = state(m0), B = state(m0 + 1);
      const { current, past } = f < 0.5 ? A : B;
      const moving = Math.abs(s.target - s.shown) > 0.001 || f > 0.001;
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.fillStyle = C["--sea"];
      ctx.fillRect(0, 0, s.W, s.H);
      const states = phrases.map((d) => {
        const a = phraseState(d, A.current, A.past), b = phraseState(d, B.current, B.past);
        const level = lerp(a.level, b.level, f);
        const alive = lerp(a.alive ? 1 : 0, b.alive ? 1 : 0, f);
        const fossil = lerp(a.fossil ? 1 : 0, b.fossil ? 1 : 0, f);
        return { d, s: { alive: alive > 0.02, fossil: fossil > 0.5, owner: (f < 0.5 ? a.owner : b.owner) ?? a.owner ?? b.owner, level, a: alive }, px: sx(d.x), py: sy(d.y) };
      });
      const land = states.filter((e) => e.s.alive && !e.d.under);
      const shore = states.filter((e) => e.s.alive && e.d.under);
      const bw = Math.max(10, 13 * Math.sqrt(s.t.k));

      // The human shore: words people use that current models avoid. Hatched, the way maps mark shallows.
      if (shore.length > 3) {
        const cs = contourDensity<(typeof shore)[number]>().x((e) => e.px).y((e) => e.py).weight((e) => e.s.level).size([s.W, s.H]).cellSize(moving ? 8 : 4).bandwidth(bw).thresholds(4)(shore);
        cs.forEach((c, i) => {
          ctx.beginPath();
          for (const poly of c.coordinates) ring(poly as number[][][]);
          if (i === 0 && hatch) { ctx.fillStyle = hatch; ctx.fill(); }
          ctx.strokeStyle = C["--hatch"]; ctx.lineWidth = i === 0 ? 1.2 : 0.6; ctx.stroke();
        });
      }
      // Land: phrases current models over-use.
      if (land.length > 3) {
        const cs = contourDensity<(typeof land)[number]>().x((e) => e.px).y((e) => e.py).weight((e) => e.s.level).size([s.W, s.H]).cellSize(moving ? 6 : 3).bandwidth(bw).thresholds(9)(land);
        const tints = ["--land-1", "--land-1", "--land-2", "--land-2", "--land-3", "--land-3", "--land-4", "--land-4", "--land-5", "--land-5"];
        cs.forEach((c, i) => {
          ctx.beginPath();
          for (const poly of c.coordinates) ring(poly as number[][][]);
          ctx.fillStyle = C[tints[Math.min(i, tints.length - 1)]]; ctx.fill();
          ctx.strokeStyle = C["--contour"]; ctx.lineWidth = i === 0 ? 1.2 : 0.6; ctx.stroke();
        });
      }
      // Before the first measured release: a faint preview of the terrain to come.
      const preview = Math.min(1, Math.max(0, firstMeasured - t));
      if (preview > 0) {
        ctx.fillStyle = C["--fossil"];
        ctx.globalAlpha = 0.35 * preview;
        for (const e of states) if (!e.d.under) { ctx.beginPath(); ctx.arc(e.px, e.py, 1.2, 0, 7); ctx.fill(); }
        ctx.globalAlpha = preview;
        const cx = states.reduce((a, e) => a + (e.d.under ? 0 : e.px), 0) / states.filter((e) => !e.d.under).length;
        const cy = states.reduce((a, e) => a + (e.d.under ? 0 : e.py), 0) / states.filter((e) => !e.d.under).length;
        ctx.textAlign = "center";
        font(`italic 15px ${SERIF}`);
        ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"];
        const msg = `Unmapped before ${monthName(firstMeasured)}, the first measured release`;
        ctx.strokeText(msg, cx, cy); ctx.fillStyle = C["--ink-2"]; ctx.fillText(msg, cx, cy);
        font(`12.5px ${SANS}`);
        const sub = "Earlier tells are documented, not measured: see the field notes.";
        ctx.strokeText(sub, cx, cy + 20); ctx.fillStyle = C["--ink-3"]; ctx.fillText(sub, cx, cy + 20);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = C["--fossil"];
      for (const e of states) if (e.s.fossil) { ctx.beginPath(); ctx.arc(e.px, e.py, 1.6, 0, 7); ctx.stroke(); }
      const wordAlpha = s.layers.words ? 1 : 0.18;
      for (const e of states) {
        if (!e.s.alive) continue;
        ctx.beginPath();
        ctx.arc(e.px, e.py, 1 + Math.min(e.s.level, 10) * 0.22 * Math.sqrt(Math.min(s.t.k, 4)), 0, 7);
        ctx.fillStyle = e.d.under ? C["--ink-2"] : C[`--${e.s.owner}`];
        ctx.globalAlpha = (e.d.under ? 0.55 : 0.8) * wordAlpha * e.s.a;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // People, at the origin.
      const ox = sx(0), oy = sy(0);
      ctx.strokeStyle = C["--ink"];
      for (const r of [5, 12, 20]) { ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7); ctx.lineWidth = r === 5 ? 2 : 0.7; ctx.stroke(); }
      ctx.textAlign = "left";
      font(`600 15px ${SANS}`);
      ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.strokeText("Human", ox + 26, oy + 5);
      ctx.fillStyle = C["--ink"]; ctx.fillText("Human", ox + 26, oy + 5);
      font(`italic 12.5px ${SERIF}`);
      ctx.lineWidth = 3; ctx.strokeText("the human articles, same topics", ox + 26, oy + 21);
      ctx.fillStyle = C["--ink-2"]; ctx.fillText("the human articles, same topics", ox + 26, oy + 21);

      // Routes.
      // A release grows in over the month before its date: the route extends and the marker swells.
      const grow = (m: MapModel) => ease(Math.min(1, Math.max(0, t - (ym(m.released) - 1))));
      for (const fam of FAMS) {
        const seq = models.filter((m) => m.family === fam && grow(m) > 0).sort((a, b) => ym(a.released) - ym(b.released));
        if (!seq.length) continue;
        const f = fam;
        const pts = seq.map((m) => [sx(m.x), sy(m.y)] as [number, number]);
        const head = grow(seq.at(-1)!);
        if (pts.length > 1 && head < 1) {
          const [px, py] = pts[pts.length - 2];
          pts[pts.length - 1] = [lerp(px, pts[pts.length - 1][0], head), lerp(py, pts[pts.length - 1][1], head)];
        }
        // A family with no release in the last 18 months fades back.
        ctx.globalAlpha = lerp(A.current.has(f) ? 1 : 0.28, B.current.has(f) ? 1 : 0.28, ease(f_));
        if (pts.length > 1) {
          ctx.lineCap = "round";
          ctx.beginPath(); curve(pts); ctx.strokeStyle = C["--halo"]; ctx.lineWidth = 6; ctx.stroke();
          ctx.beginPath(); curve(pts); ctx.strokeStyle = C[`--${f}`]; ctx.lineWidth = 2.5; ctx.stroke();
        }
        seq.forEach((m, i) => {
          const [x, y] = pts[i];
          const cur = i === seq.length - 1;
          const g = cur ? head : 1;
          ctx.beginPath(); ctx.arc(x, y, (cur ? lerp(5, 8, g) : 5) * (seq.length === 1 ? g : 1), 0, 7);
          ctx.fillStyle = C[`--${f}`]; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = C["--sheet"]; ctx.stroke();
          if (cur && g > 0.05) { ctx.beginPath(); ctx.arc(x, y, 14 * g, 0, 7); ctx.strokeStyle = C[`--${f}`]; ctx.lineWidth = 1; ctx.stroke(); }
        });
        ctx.globalAlpha = 1;
      }

      // The model a visitor came from (Models, "Show on the map") gets a pulse ring.
      const fm = s.focus ? models.find((m) => m.id === s.focus) : null;
      if (fm && grow(fm) > 0) {
        const fx = sx(fm.x), fy = sy(fm.y);
        ctx.beginPath(); ctx.arc(fx, fy, 22, 0, 7);
        ctx.strokeStyle = C["--ink"]; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
      // Labels, placed without collisions: models, then region names, then phrases.
      const boxes: Array<[number, number, number, number]> = [[ox - 22, oy - 22, ox + 220, oy + 26]];
      const { left, right, top, bottom } = s.insets;
      const fits = (x: number, y: number, w: number, above: number, below: number) => {
        const t = y - above, b = y + below;
        if (x < left + 4 || t < top + 4 || x + w > s.W - right - 4 || b > s.H - bottom - 4) return false;
        for (const [a, bb, c, d] of boxes) if (x < c && x + w > a && t < d && b > bb) return false;
        boxes.push([x - 2, t - 2, x + w + 2, b + 2]);
        return true;
      };
      for (const m of models) if (grow(m) > 0.5) boxes.push([sx(m.x) - 10, sy(m.y) - 10, sx(m.x) + 10, sy(m.y) + 10]);
      for (const f of FAMS.filter((g) => current.has(g))) {
        for (const m of models.filter((x) => x.family === f && grow(x) > 0 && (current.get(f)?.id === x.id || ym(x.released) > t - 30))) {
          const cur = current.get(f)?.id === m.id;
          ctx.globalAlpha = grow(m);
          const mx = sx(m.x), my = sy(m.y);
          font(`${cur ? 600 : 400} ${cur ? 14 : 12}px ${SANS}`);
          const w = ctx.measureText(m.name).width;
          const sub = monthName(ym(m.released), "short") + (m.verified ? "" : "*");
          const spots: Array<[number, number]> = [[mx + 13, my - 4], [mx - 13 - w, my - 4], [mx - w / 2, my - 18], [mx - w / 2, my + 30], [mx + 13, my + 14], [mx - 13 - w, my + 14], [mx + 13, my - 24], [mx - 13 - w, my - 24], [mx + 13, my + 34], [mx - 13 - w, my + 34], [mx - w / 2, my - 38], [mx - w / 2, my + 50]];
          const found = spots.find(([a, b]) => fits(a, b, w, 13, 15));
          const [x, y] = found ?? spots[0];
          if (!found) boxes.push([x - 2, y - 15, x + w + 2, y + 17]); // drawn anyway, so phrases must keep clear
          ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.strokeText(m.name, x, y);
          ctx.fillStyle = cur ? C["--ink"] : C["--ink-2"]; ctx.fillText(m.name, x, y);
          font(`11px ${SANS}`);
          ctx.lineWidth = 3; ctx.strokeText(sub, x, y + 13);
          ctx.fillStyle = C["--ink-3"]; ctx.fillText(sub, x, y + 13);
          ctx.globalAlpha = 1;
        }
      }
      font(`600 23px ${SANS}`);
      ctx.save();
      ctx.font = `600 ${23}px ${SANS}`;
      (ctx as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = "condensed";
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "1.5px";
      for (const f of FAMS) {
        const own = land.filter((e) => e.s.owner === f && e.s.level >= 4);
        if (own.length < 30) continue;
        const cx = own.reduce((a, e) => a + e.px, 0) / own.length, cy = own.reduce((a, e) => a + e.py, 0) / own.length;
        const text = `${FAM_NAME[f]} country`;
        const w = ctx.measureText(text).width;
        const offs = [[0, 0], [0, -36], [0, 36], [-60, 0], [60, 0], [0, -72], [0, 72], [-90, -40], [90, 40], [-90, 40], [90, -40]];
        const spot = offs.map(([dx, dy]) => [cx - w / 2 + dx, cy + dy]).find(([x, y]) => fits(x, y, w, 20, 4));
        if (!spot) continue;
        ctx.lineWidth = 5; ctx.strokeStyle = C["--halo"]; ctx.strokeText(text, spot[0], spot[1]);
        ctx.fillStyle = C[`--${f}`]; ctx.fillText(text, spot[0], spot[1]);
      }
      ctx.restore();
      // Habits: one glyph badge per style habit, placed with the current models that over-use it
      // (or by the people point when people do it more), sized by effect.
      s.badges = [];
      if (s.layers.habits) {
        const place = (cur: MapModel[], h: Habit) => {
          if (!cur.length) return null;
          const eff = cur.map((m) => ({ m, e: h.models[m.id].d * h.sign }));
          const pos = eff.filter((x) => x.e > 0.12);
          const neg = eff.filter((x) => x.e < -0.12);
          const side = pos.length ? pos : neg;
          if (!side.length) return null;
          const wsum = side.reduce((a, x) => a + x.e ** 2, 0);
          let hx = side.reduce((a, x) => a + x.e ** 2 * x.m.x, 0) / wsum;
          let hy = side.reduce((a, x) => a + x.e ** 2 * x.m.y, 0) / wsum;
          // A habit people do more sits by the people point, leaning toward the models that do it least.
          if (!pos.length) { hx *= 0.12; hy *= 0.12; }
          return { hx, hy, strength: Math.max(...side.map((x) => Math.abs(x.e))) };
        };
        const curA = [...A.current.values()].filter((m) => habits[0]?.models[m.id]);
        const curB = [...B.current.values()].filter((m) => habits[0]?.models[m.id]);
        for (const h of habits) {
          const a = place(curA, h), b = place(curB, h);
          if (!a && !b) continue;
          const p = a && b ? { hx: lerp(a.hx, b.hx, ease(f)), hy: lerp(a.hy, b.hy, ease(f)), strength: lerp(a.strength, b.strength, f), o: 1 } : a ? { ...a, o: 1 - f } : { ...b!, o: f };
          if (p.o < 0.05) continue;
          const r = (10 + Math.min(p.strength, 2) * 4) * (0.6 + 0.4 * p.o);
          s.badges.push({ h, x: sx(p.hx), y: sy(p.hy), r, ax: sx(p.hx), ay: sy(p.hy), o: p.o } as (typeof s.badges)[number]);
        }
        // Push overlapping badges apart (and off model markers); a leader line keeps each tied to its true spot.
        const markers = models.filter((m) => grow(m) > 0.5).map((m) => ({ x: sx(m.x), y: sy(m.y), r: 9 }));
        for (let it = 0; it < 120; it++) {
          let moved = false;
          for (let i = 0; i < s.badges.length; i++) {
            const a = s.badges[i];
            for (const o of [...s.badges.slice(i + 1), ...markers]) {
              const dx = a.x - o.x || 0.01, dy = a.y - o.y || 0.01, dist = Math.hypot(dx, dy), need = a.r + o.r + 6;
              if (dist >= need) continue;
              const push = (need - dist) / 2, ux = dx / dist, uy = dy / dist;
              a.x += ux * push; a.y += uy * push;
              if ("h" in o) { (o as typeof a).x -= ux * push; (o as typeof a).y -= uy * push; }
              moved = true;
            }
          }
          if (!moved) break;
        }
        for (const b of s.badges as Array<(typeof s.badges)[number] & { ax: number; ay: number }>) {
          if (Math.hypot(b.x - b.ax, b.y - b.ay) > b.r) {
            ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = C["--ink-3"]; ctx.lineWidth = 1; ctx.stroke();
            ctx.beginPath(); ctx.arc(b.ax, b.ay, 2, 0, 7); ctx.fillStyle = C["--ink-3"]; ctx.fill();
          }
        }
        for (const b of s.badges) {
          ctx.globalAlpha = b.o ?? 1;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
          ctx.fillStyle = C["--sheet"]; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = C["--ink"]; ctx.stroke();
          ctx.textAlign = "center";
          font(`600 ${Math.round(b.r * 0.95)}px ${SERIF}`);
          ctx.fillStyle = C["--ink"]; ctx.fillText(b.h.glyph, b.x, b.y + b.r * 0.33);
          boxes.push([b.x - b.r - 2, b.y - b.r - 2, b.x + b.r + 2, b.y + b.r + 2]);
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
        font(`600 11.5px ${SANS}`);
        for (const b of s.badges) {
          const w = ctx.measureText(b.h.label).width;
          const spots: Array<[number, number]> = [[b.x - w / 2, b.y + b.r + 13], [b.x + b.r + 4, b.y + 4], [b.x - b.r - 4 - w, b.y + 4], [b.x - w / 2, b.y - b.r - 5]];
          const spot = (b.o ?? 1) > 0.6 ? spots.find(([x, y]) => fits(x, y, w, 11, 3)) : undefined;
          if (!spot) continue;
          ctx.lineWidth = 3.5; ctx.strokeStyle = C["--halo"]; ctx.strokeText(b.h.label, spot[0], spot[1]);
          ctx.fillStyle = C["--ink"]; ctx.fillText(b.h.label, spot[0], spot[1]);
        }
      }

      // Label order: registry tells first, then phrases that are both lopsided and common (used in many articles).
      const rank = (e: (typeof states)[number]) => (e.d.tell ? 3 : 0) + Math.min(e.s.level, 6) + 1.5 * Math.log2(Math.max(e.d.reach, 150) / 150);
      const budget = s.layers.words ? Math.round(26 * Math.min(s.t.k, 6) ** 1.3) : 0;
      const cands = states.filter((e) => e.s.a > 0.3 && e.px > left && e.px < s.W - right && e.py > top && e.py < s.H - bottom).sort((a, b) => rank(b) - rank(a));
      let placed = 0;
      for (const e of cands) {
        if (placed >= budget) break;
        const size = Math.round(12 + Math.min(e.s.level, 10) * 0.4);
        font(`italic ${e.d.tell ? 600 : 400} ${size}px ${SERIF}`);
        const text = e.d.term.replace(/ _ /g, " … ").replace(/^_ | _$/g, "… ");
        const w = ctx.measureText(text).width;
        const x = e.px + 5, y = e.py + 4;
        if (!fits(x, y, w, size - 2, 3)) continue;
        ctx.globalAlpha = e.s.a;
        ctx.lineWidth = 3; ctx.strokeStyle = C["--halo"]; ctx.strokeText(text, x, y);
        ctx.fillStyle = e.d.under ? C["--ink-2"] : C["--ink"]; ctx.fillText(text, x, y);
        ctx.globalAlpha = 1;
        placed++;
      }
      s.qt = quadtree<{ d: Phrase; px: number; py: number }>().x((e) => e.px).y((e) => e.py).addAll(states.filter((e) => e.s.alive || e.s.fossil).map((e) => ({ d: e.d, px: e.px, py: e.py })));
    };
    // The shown month chases the target: small steps (playback) follow at once, big jumps (a click on the timeline) glide.
    const frame = (now: number) => {
      s.raf = 0;
      const dt = s.last ? Math.min(64, now - s.last) : 16;
      s.last = now;
      const diff = s.target - s.shown;
      if (Math.abs(diff) <= 1.01 || matchMedia("(prefers-reduced-motion: reduce)").matches) s.shown = s.target;
      else s.shown += diff * (1 - Math.exp(-dt / 140));
      draw();
      if (s.shown !== s.target) s.raf = requestAnimationFrame(frame);
      else s.last = 0;
    };
    const schedule = () => { if (!s.raf) s.raf = requestAnimationFrame(frame); };
    (canvas as HTMLCanvasElement & { __draw?: () => void }).__draw = schedule;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      s.W = r.width; s.H = r.height; s.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(s.W * s.dpr); canvas.height = Math.round(s.H * s.dpr);
      fit(); makeHatch(); draw();
    };
    readColors();
    const z = zoom<HTMLCanvasElement, unknown>().scaleExtent([0.6, 14]).on("zoom", (ev) => { s.t = ev.transform; schedule(); });
    s.z = z;
    select(canvas).call(z).on("dblclick.zoom", null);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const mo = new MutationObserver(() => { readColors(); makeHatch(); schedule(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const modelAt = (mx: number, my: number) => models.find((m) => ym(m.released) <= s.shown && Math.hypot(sx(m.x) - mx, sy(m.y) - my) <= 10);
    const onMove = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const badge = s.badges.find((b) => Math.hypot(b.x - mx, b.y - my) <= b.r + 2);
      if (badge) { canvas.style.cursor = badge.h.tell ? "pointer" : "default"; onHover({ habit: badge.h, x: mx, y: my }); return; }
      if (modelAt(mx, my)) { canvas.style.cursor = "pointer"; onHover(null); return; }
      const hit = s.layers.words ? s.qt?.find(mx, my, 10) : undefined;
      canvas.style.cursor = hit ? (hit.d.tell ? "pointer" : "default") : "grab";
      onHover(hit ? { d: hit.d, x: mx, y: my } : null);
    };
    const onLeave = () => onHover(null);
    const onClick = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const badge = s.badges.find((b) => Math.hypot(b.x - mx, b.y - my) <= b.r + 2);
      if (badge?.h.tell) { location.hash = `#/tells/${badge.h.tell}`; return; }
      const mk = modelAt(mx, my);
      if (mk) { location.hash = `#/models/${mk.id}`; return; }
      const hit = s.layers.words ? s.qt?.find(mx, my, 10) : undefined;
      if (hit?.d.tell) location.hash = `#/tells/${hit.d.tell}`;
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    document.fonts?.ready.then(schedule);
    return () => { ro.disconnect(); mo.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); canvas.removeEventListener("click", onClick); cancelAnimationFrame(s.raf); s.raf = 0; select(canvas).on(".zoom", null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { (ref.current as HTMLCanvasElement & { __draw?: () => void })?.__draw?.(); }, [month, layers.words, layers.habits, focus]);
  useEffect(() => { if (resetSignal && st.current.z && ref.current) select(ref.current).call(st.current.z.transform, zoomIdentity); }, [resetSignal]);

  const zoomBy = (factor: number) => {
    const c = ref.current, z = st.current.z;
    if (c && z) select(c).transition().duration(220).call(z.scaleBy, factor);
  };
  const fitView = () => {
    const c = ref.current, z = st.current.z;
    if (c && z) select(c).transition().duration(220).call(z.transform, zoomIdentity);
  };
  return (
    <>
      <canvas ref={ref} role="img" aria-label={`Map of phrases that models write far more or far less often than humans, as of ${monthName(month)}. Each family's releases form a route; human writing sits at the origin.`} />
      <div className="zoom-controls" role="group" aria-label="Map zoom">
        <button className="btn icon" type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in" title="Zoom in (or scroll up over the map)">+</button>
        <button className="btn icon" type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" title="Zoom out (or scroll down over the map)">−</button>
        <button className="btn icon" type="button" onClick={fitView} aria-label="Fit the whole map" title="Fit the whole map">⤢</button>
        <span className="zoom-hint">Scroll or pinch to zoom, drag to move. Labels fill in as you zoom.</span>
      </div>
    </>
  );
}
