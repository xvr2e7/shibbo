// Canvas atlas: phrases as terrain, releases as routes. Pure drawing; time and hover state live in the page.
import { useEffect, useRef } from "react";
import { contourDensity } from "d3-contour";
import { zoom, zoomIdentity, type ZoomTransform, type ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import { quadtree, type Quadtree } from "d3-quadtree";
import mapData from "../data/map.json";
import { FAMS, ym, monthName } from "../data";

type Raw = [string, number, number, 0 | 1, string, number, ...number[]];
export type MapModel = { id: string; name: string; family: string; released: string; verified: boolean; x: number; y: number };
export type Phrase = { term: string; x: number; y: number; under: boolean; tell: string; floor: number; v: number[]; strength: number };

export const models = (mapData as { models: MapModel[] }).models;
export const phrases: Phrase[] = (mapData as unknown as { terms: Raw[] }).terms.map((r) => {
  const v = (r.slice(6) as number[]).map((x) => x / 10);
  return { term: r[0], x: r[1], y: r[2], under: r[3] === 1, tell: r[4], floor: r[5], v, strength: Math.max(...v.map(Math.abs)) };
});
export const explained = (mapData as { explained: number }).explained;
export const firstMeasured = Math.min(...models.map((m) => ym(m.released)));
const idx = new Map(models.map((m, i) => [m.id, i]));
const FAM_NAME: Record<string, string> = { gpt: "GPT", claude: "Claude", gemini: "Gemini" };

/** Which model is current in each family at a month, and which came before. */
export function state(month: number) {
  const current = new Map<string, MapModel>();
  const past = new Set<string>();
  for (const f of FAMS) {
    const seq = models.filter((x) => x.family === f && ym(x.released) <= month).sort((a, b) => ym(a.released) - ym(b.released));
    if (seq.length) current.set(f, seq.at(-1)!);
    for (const x of seq.slice(0, -1)) past.add(x.id);
  }
  return { current, past };
}

export function phraseState(d: Phrase, current: Map<string, MapModel>, past: Set<string>) {
  let level = 0;
  let owner: string | null = null;
  for (const m of current.values()) {
    const v = d.v[idx.get(m.id)!];
    const s = d.under ? -v : v;
    if (s >= 2 && s > level) { level = s; owner = m.family; }
  }
  if (level) return { alive: true, fossil: false, owner, level };
  for (const id of past) {
    const v = d.v[idx.get(id)!];
    if ((d.under ? -v : v) >= 2) return { alive: false, fossil: true, owner: null, level: 0 };
  }
  return { alive: false, fossil: false, owner: null, level: 0 };
}

export interface Hover { d: Phrase; x: number; y: number }

export function AtlasMap({ month, onHover, insets, resetSignal }: { month: number; onHover: (h: Hover | null) => void; insets: { left: number; right: number; top: number; bottom: number }; resetSignal: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ t: zoomIdentity as ZoomTransform, W: 0, H: 0, dpr: 1, base: { k: 1, x: 0, y: 0 }, qt: null as Quadtree<{ d: Phrase; px: number; py: number }> | null, C: {} as Record<string, string>, raf: 0, month, insets, z: null as ZoomBehavior<HTMLCanvasElement, unknown> | null });
  st.current.month = month;
  st.current.insets = insets;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      s.C = Object.fromEntries(["--sea", "--land-1", "--land-2", "--land-3", "--land-4", "--land-5", "--contour", "--hatch", "--fossil", "--ink", "--ink-2", "--ink-3", "--gpt", "--claude", "--gemini", "--halo", "--sheet"].map((n) => [n, cs.getPropertyValue(n).trim()]));
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
    const SANS = "'Archivo Variable', Archivo, system-ui, sans-serif";
    const SERIF = "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif";

    const draw = () => {
      const C = s.C;
      const { current, past } = state(s.month);
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.fillStyle = C["--sea"];
      ctx.fillRect(0, 0, s.W, s.H);
      const states = phrases.map((d) => ({ d, s: phraseState(d, current, past), px: sx(d.x), py: sy(d.y) }));
      const land = states.filter((e) => e.s.alive && !e.d.under);
      const shore = states.filter((e) => e.s.alive && e.d.under);
      const bw = Math.max(10, 13 * Math.sqrt(s.t.k));

      // The human shore: words people use that current models avoid. Hatched, the way maps mark shallows.
      if (shore.length > 3) {
        const cs = contourDensity<(typeof shore)[number]>().x((e) => e.px).y((e) => e.py).weight((e) => e.s.level).size([s.W, s.H]).cellSize(4).bandwidth(bw).thresholds(4)(shore);
        cs.forEach((c, i) => {
          ctx.beginPath();
          for (const poly of c.coordinates) ring(poly as number[][][]);
          if (i === 0 && hatch) { ctx.fillStyle = hatch; ctx.fill(); }
          ctx.strokeStyle = C["--hatch"]; ctx.lineWidth = i === 0 ? 1.2 : 0.6; ctx.stroke();
        });
      }
      // Land: phrases current models over-use.
      if (land.length > 3) {
        const cs = contourDensity<(typeof land)[number]>().x((e) => e.px).y((e) => e.py).weight((e) => e.s.level).size([s.W, s.H]).cellSize(3).bandwidth(bw).thresholds(9)(land);
        const tints = ["--land-1", "--land-1", "--land-2", "--land-2", "--land-3", "--land-3", "--land-4", "--land-4", "--land-5", "--land-5"];
        cs.forEach((c, i) => {
          ctx.beginPath();
          for (const poly of c.coordinates) ring(poly as number[][][]);
          ctx.fillStyle = C[tints[Math.min(i, tints.length - 1)]]; ctx.fill();
          ctx.strokeStyle = C["--contour"]; ctx.lineWidth = i === 0 ? 1.2 : 0.6; ctx.stroke();
        });
      }
      // Before the first measured release: a faint preview of the terrain to come.
      if (s.month < firstMeasured) {
        ctx.fillStyle = C["--fossil"];
        ctx.globalAlpha = 0.35;
        for (const e of states) if (!e.d.under) { ctx.beginPath(); ctx.arc(e.px, e.py, 1.2, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
        const cx = states.reduce((a, e) => a + (e.d.under ? 0 : e.px), 0) / states.filter((e) => !e.d.under).length;
        const cy = states.reduce((a, e) => a + (e.d.under ? 0 : e.py), 0) / states.filter((e) => !e.d.under).length;
        ctx.textAlign = "center";
        font(`italic 15px ${SERIF}`);
        ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"];
        const msg = `Unmapped until ${monthName(firstMeasured)}, the first measured release`;
        ctx.strokeText(msg, cx, cy); ctx.fillStyle = C["--ink-2"]; ctx.fillText(msg, cx, cy);
        font(`12.5px ${SANS}`);
        const sub = "Earlier tells are documented, not measured: see the field notes.";
        ctx.strokeText(sub, cx, cy + 20); ctx.fillStyle = C["--ink-3"]; ctx.fillText(sub, cx, cy + 20);
        ctx.textAlign = "left";
      }
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = C["--fossil"];
      for (const e of states) if (e.s.fossil) { ctx.beginPath(); ctx.arc(e.px, e.py, 1.6, 0, 7); ctx.stroke(); }
      for (const e of states) {
        if (!e.s.alive) continue;
        ctx.beginPath();
        ctx.arc(e.px, e.py, 1 + Math.min(e.s.level, 10) * 0.22 * Math.sqrt(Math.min(s.t.k, 4)), 0, 7);
        ctx.fillStyle = e.d.under ? C["--ink-2"] : C[`--${e.s.owner}`];
        ctx.globalAlpha = e.d.under ? 0.55 : 0.8;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // People, at the origin.
      const ox = sx(0), oy = sy(0);
      ctx.strokeStyle = C["--ink"];
      for (const r of [5, 12, 20]) { ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7); ctx.lineWidth = r === 5 ? 2 : 0.7; ctx.stroke(); }
      ctx.textAlign = "left";
      font(`600 15px ${SANS}`);
      ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.strokeText("People", ox + 26, oy + 5);
      ctx.fillStyle = C["--ink"]; ctx.fillText("People", ox + 26, oy + 5);
      font(`italic 12.5px ${SERIF}`);
      ctx.lineWidth = 3; ctx.strokeText("the human articles, same topics", ox + 26, oy + 21);
      ctx.fillStyle = C["--ink-2"]; ctx.fillText("the human articles, same topics", ox + 26, oy + 21);

      // Routes.
      for (const f of FAMS) {
        const seq = models.filter((m) => m.family === f && ym(m.released) <= s.month).sort((a, b) => ym(a.released) - ym(b.released));
        if (!seq.length) continue;
        const pts = seq.map((m) => [sx(m.x), sy(m.y)] as [number, number]);
        if (pts.length > 1) {
          ctx.lineCap = "round";
          ctx.beginPath(); curve(pts); ctx.strokeStyle = C["--halo"]; ctx.lineWidth = 6; ctx.stroke();
          ctx.beginPath(); curve(pts); ctx.strokeStyle = C[`--${f}`]; ctx.lineWidth = 2.5; ctx.stroke();
        }
        seq.forEach((m, i) => {
          const [x, y] = pts[i];
          const cur = i === seq.length - 1;
          ctx.beginPath(); ctx.arc(x, y, cur ? 8 : 5, 0, 7);
          ctx.fillStyle = C[`--${f}`]; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = C["--sheet"]; ctx.stroke();
          if (cur) { ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.strokeStyle = C[`--${f}`]; ctx.lineWidth = 1; ctx.stroke(); }
        });
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
      for (const m of models) if (ym(m.released) <= s.month) boxes.push([sx(m.x) - 10, sy(m.y) - 10, sx(m.x) + 10, sy(m.y) + 10]);
      for (const f of FAMS) {
        for (const m of models.filter((x) => x.family === f && ym(x.released) <= s.month)) {
          const cur = current.get(f)?.id === m.id;
          const mx = sx(m.x), my = sy(m.y);
          font(`${cur ? 650 : 520} ${cur ? 14 : 12}px ${SANS}`);
          const w = ctx.measureText(m.name).width;
          const sub = monthName(ym(m.released), "short") + (m.verified ? "" : "*");
          const spots: Array<[number, number]> = [[mx + 13, my - 4], [mx - 13 - w, my - 4], [mx - w / 2, my - 18], [mx - w / 2, my + 30], [mx + 13, my + 14], [mx - 13 - w, my + 14]];
          const [x, y] = spots.find(([a, b]) => fits(a, b, w, 13, 15)) ?? spots[0];
          ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.strokeText(m.name, x, y);
          ctx.fillStyle = cur ? C["--ink"] : C["--ink-2"]; ctx.fillText(m.name, x, y);
          font(`11px ${SANS}`);
          ctx.lineWidth = 3; ctx.strokeText(sub, x, y + 13);
          ctx.fillStyle = C["--ink-3"]; ctx.fillText(sub, x, y + 13);
        }
      }
      font(`500 23px ${SANS}`);
      ctx.save();
      ctx.font = `500 ${23}px ${SANS}`;
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
      const budget = Math.round(26 * Math.min(s.t.k, 6) ** 1.3);
      const cands = states.filter((e) => e.s.alive && e.px > left && e.px < s.W - right && e.py > top && e.py < s.H - bottom).sort((a, b) => (b.d.tell ? 3 : 0) + b.s.level - ((a.d.tell ? 3 : 0) + a.s.level));
      let placed = 0;
      for (const e of cands) {
        if (placed >= budget) break;
        const size = Math.round(12 + Math.min(e.s.level, 10) * 0.4);
        font(`italic ${e.d.tell ? 600 : 430} ${size}px ${SERIF}`);
        const text = e.d.term.replace(/ _ /g, " … ").replace(/^_ | _$/g, "… ");
        const w = ctx.measureText(text).width;
        const x = e.px + 5, y = e.py + 4;
        if (!fits(x, y, w, size - 2, 3)) continue;
        ctx.lineWidth = 3; ctx.strokeStyle = C["--halo"]; ctx.strokeText(text, x, y);
        ctx.fillStyle = e.d.under ? C["--ink-2"] : C["--ink"]; ctx.fillText(text, x, y);
        placed++;
      }
      s.qt = quadtree<{ d: Phrase; px: number; py: number }>().x((e) => e.px).y((e) => e.py).addAll(states.filter((e) => e.s.alive || e.s.fossil).map((e) => ({ d: e.d, px: e.px, py: e.py })));
    };
    const schedule = () => { if (!s.raf) s.raf = requestAnimationFrame(() => { s.raf = 0; draw(); }); };
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
    const onMove = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const hit = s.qt?.find(ev.clientX - r.left, ev.clientY - r.top, 10);
      canvas.style.cursor = hit ? (hit.d.tell ? "pointer" : "default") : "grab";
      onHover(hit ? { d: hit.d, x: ev.clientX - r.left, y: ev.clientY - r.top } : null);
    };
    const onLeave = () => onHover(null);
    const onClick = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const hit = s.qt?.find(ev.clientX - r.left, ev.clientY - r.top, 10);
      if (hit?.d.tell) location.hash = `#/tells/${hit.d.tell}`;
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    document.fonts?.ready.then(schedule);
    return () => { ro.disconnect(); mo.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); canvas.removeEventListener("click", onClick); cancelAnimationFrame(s.raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { (ref.current as HTMLCanvasElement & { __draw?: () => void })?.__draw?.(); }, [month]);
  useEffect(() => { if (resetSignal && st.current.z && ref.current) select(ref.current).call(st.current.z.transform, zoomIdentity); }, [resetSignal]);

  return <canvas ref={ref} role="img" aria-label={`Map of phrases that models write far more or far less often than people, as of ${monthName(month)}. Each family's releases form a route; people sit at the origin.`} />;
}
