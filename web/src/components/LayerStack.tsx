// The layered atlas: four measured layers as sheets in an isometric stack, each printed with its own map at reduced
// detail. A thread joins one model's place on every sheet it appears on. Click a sheet (or its button) and it
// lies flat, handing over to that layer's full map. Below 760 px, or with no room, the sheets sit as flat sections.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandIcon } from "./BrandIcon";
import { sheets, sharedModels, ASPECT, STACK, LAYER_NAME, type Sheet } from "./layerData";
import { canon, famVar, famName, famBrand, byFamily, FAM_VARS } from "./families";
import { data } from "../data";
import type { LayerId } from "./layers";
import "../styles/layer-stack.css";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif";
const BASE = import.meta.env.BASE_URL;
const COLORS = ["--sea", "--sheet", "--paper", "--ink", "--ink-2", "--ink-3", "--rule", "--rule-strong", "--halo", "--focus", ...FAM_VARS];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (d: string | null) => (d ? `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : "");
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/** Where each layer's full map draws, so a sheet lands flat about where its map will be. Matches the insets in Atlas.tsx and InterfaceAtlas.tsx. */
const FLAT_INSETS: Record<LayerId, { left: number; right: number; top: number; bottom: number }> = {
  prose: { left: 380, right: 360, top: 16, bottom: 330 },
  interface: { left: 260, right: 32, top: 60, bottom: 330 },
  code: { left: 260, right: 32, top: 60, bottom: 330 },
  conduct: { left: 260, right: 32, top: 60, bottom: 330 },
};

// A sheet's place on screen: an affine map from sheet units (u across, v down, centred) to pixels.
type Pose = { cx: number; cy: number; k: number; th: number; sq: number };
const ISO: Pick<Pose, "th" | "sq"> = { th: Math.PI / 4, sq: 0.5 };
function mat(p: Pose) {
  const c = Math.cos(p.th), s = Math.sin(p.th);
  return { a: p.k * c, b: p.k * s * p.sq, c: -p.k * s, d: p.k * c * p.sq, e: p.cx, f: p.cy };
}
const proj = (m: ReturnType<typeof mat>, u: number, v: number) => [m.e + m.a * (u - 0.5) + m.c * (v - ASPECT / 2), m.f + m.b * (u - 0.5) + m.d * (v - ASPECT / 2)] as const;
function unproj(m: ReturnType<typeof mat>, x: number, y: number) {
  const det = m.a * m.d - m.b * m.c, dx = x - m.e, dy = y - m.f;
  return { u: (m.d * dx - m.c * dy) / det + 0.5, v: (-m.b * dx + m.a * dy) / det + ASPECT / 2 };
}

type Colors = Record<string, string>;
type Lit = ((a: { key: string; family: string }) => boolean) | null;
type DrawOpts = { alpha: number; flat: number; hover: boolean; lit: Lit; img: HTMLImageElement | null; thick: number; labels: number };

/** Draw one sheet: paper, edge, its points (tiles for interface pages), trails, anchors and a few labels. */
function drawSheet(ctx: CanvasRenderingContext2D, dpr: number, C: Colors, sh: Sheet, m: ReturnType<typeof mat>, o: DrawOpts) {
  if (o.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  const corners = [proj(m, 0, 0), proj(m, 1, 0), proj(m, 1, ASPECT), proj(m, 0, ASPECT)];
  const path = () => { ctx.beginPath(); corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  if (!sh.ready) {
    path();
    ctx.setLineDash([6, 5]); ctx.lineWidth = o.hover ? 1.6 : 1.2; ctx.strokeStyle = o.hover ? C["--ink-2"] : C["--rule-strong"]; ctx.stroke(); ctx.setLineDash([]);
    // Near the front corner, the part a sheet above leaves in view.
    const [x, y] = o.thick > 0.2 ? proj(m, 0.8, ASPECT * 0.8) : proj(m, 0.5, ASPECT / 2);
    ctx.textAlign = "center"; ctx.font = `italic 15px ${SERIF}`; ctx.fillStyle = C["--ink-2"];
    ctx.fillText(`${sh.name}: measuring now`, x, y + 5); ctx.textAlign = "left";
    ctx.restore();
    return;
  }
  // The plate's thickness: its two front edges dropped a few pixels.
  if (o.thick > 0.2) {
    const [a, b, c, d] = corners;
    const front = [b, c, d].map(([x, y]) => [x, y] as [number, number]);
    ctx.beginPath(); ctx.moveTo(front[0][0], front[0][1]); ctx.lineTo(front[1][0], front[1][1]); ctx.lineTo(front[2][0], front[2][1]);
    ctx.lineTo(front[2][0], front[2][1] + o.thick); ctx.lineTo(front[1][0], front[1][1] + o.thick); ctx.lineTo(front[0][0], front[0][1] + o.thick); ctx.closePath();
    ctx.fillStyle = C["--rule-strong"]; ctx.fill();
    void a;
  }
  path();
  ctx.fillStyle = C["--sheet"]; ctx.fill();
  if (o.flat > 0) { ctx.globalAlpha = o.alpha * o.flat; ctx.fillStyle = C["--sea"]; ctx.fill(); ctx.globalAlpha = o.alpha; }
  // The sheet's edge fades as it lies flat: the full map has no frame.
  ctx.globalAlpha = o.alpha * (1 - o.flat);
  ctx.lineWidth = o.hover ? 1.5 : 1; ctx.strokeStyle = o.hover ? C["--ink"] : C["--rule-strong"]; ctx.stroke();
  ctx.globalAlpha = o.alpha;
  ctx.save(); if (o.flat < 0.999) { path(); ctx.clip(); }

  const scale = Math.hypot(m.a, m.b); // pixels per sheet unit along u
  const pr = Math.max(1.1, Math.min(3.2, scale / 260));
  const dim = o.lit ? 0.45 : 1;
  if (sh.sprite && o.img?.complete && o.img.naturalWidth) {
    // Interface pages print onto the sheet as tiny screenshots, skewed with it.
    const { w: TW, h: TH, cols } = sh.sprite;
    const tw = 0.03, th = tw * 0.625;
    ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * (m.e - m.a * 0.5 - m.c * ASPECT / 2), dpr * (m.f - m.b * 0.5 - m.d * ASPECT / 2));
    ctx.globalAlpha = o.alpha * dim;
    for (const p of sh.points) {
      if (p.sprite === undefined) continue;
      ctx.drawImage(o.img, (p.sprite % cols) * TW, Math.floor(p.sprite / cols) * TH, TW, TH, p.u - tw / 2, p.v - th / 2, tw, th);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else {
    for (const p of sh.points) {
      const [x, y] = proj(m, p.u, p.v);
      ctx.globalAlpha = o.alpha * p.alpha * dim;
      ctx.beginPath(); ctx.arc(x, y, pr * (p.r / 0.0055), 0, 7); ctx.fillStyle = C[p.c] || C["--other"]; ctx.fill();
    }
  }
  ctx.globalAlpha = o.alpha;
  if (sh.origin) {
    const [x, y] = proj(m, sh.origin.u, sh.origin.v);
    ctx.strokeStyle = C["--ink"];
    for (const r of [3, 7]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.lineWidth = r === 3 ? 1.6 : 0.7; ctx.stroke(); }
    if (o.labels > 0.02) { ctx.globalAlpha = o.alpha * o.labels; label(ctx, C, sh.origin.label, x + 10, y + 4, `600 11.5px ${SANS}`, C["--ink"]); ctx.globalAlpha = o.alpha; }
  }
  // Release trails, then anchors.
  const fams = [...new Set(sh.anchors.map((a) => a.family))];
  for (const f of fams) {
    const seq = sh.anchors.filter((a) => a.family === f && a.released).sort((a, b) => a.released!.localeCompare(b.released!));
    if (seq.length < 2) continue;
    ctx.beginPath();
    seq.forEach((a, i) => { const [x, y] = proj(m, a.u, a.v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.globalAlpha = o.alpha * (o.lit ? 0.35 : 0.85);
    ctx.lineJoin = "round"; ctx.lineWidth = 3.5; ctx.strokeStyle = C["--halo"]; ctx.stroke();
    ctx.lineWidth = 1.4; ctx.strokeStyle = C[famVar(f)]; ctx.stroke();
  }
  ctx.globalAlpha = o.alpha;
  for (const a of sh.anchors) {
    const [x, y] = proj(m, a.u, a.v);
    const on = !!o.lit?.(a);
    ctx.globalAlpha = o.alpha * (o.lit && !on ? 0.45 : 1);
    ctx.beginPath(); ctx.arc(x, y, on ? 5 : 3.4, 0, 7);
    ctx.fillStyle = C[famVar(a.family)]; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = C["--sheet"]; ctx.stroke();
  }
  ctx.restore(); // labels may run past the sheet's edge
  ctx.save();
  ctx.globalAlpha = o.alpha * o.labels * (o.lit ? 0.5 : 1);
  if (o.labels > 0.02) {
    const boxes: number[][] = sh.origin ? [(() => { const [x, y] = proj(m, sh.origin.u, sh.origin.v); return [x - 8, y - 10, x + 52, y + 8]; })()] : [];
    for (const l of sh.labels) {
      const [x, y] = proj(m, l.u, l.v);
      ctx.font = l.serif ? `italic 12px ${SERIF}` : `500 11px ${SANS}`;
      const w = ctx.measureText(l.text).width;
      const spot = ([[x + 5, y + 4], [x - 5 - w, y + 4], [x - w / 2, y - 6], [x - w / 2, y + 15]] as Array<[number, number]>)
        .find(([a, b]) => a >= 2 && a + w <= ctx.canvas.width / dpr - 2 && !boxes.some(([x0, y0, x1, y1]) => a < x1 && a + w > x0 && b - 10 < y1 && b + 3 > y0));
      if (!spot) continue;
      boxes.push([spot[0] - 2, spot[1] - 11, spot[0] + w + 2, spot[1] + 4]);
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fillStyle = C["--ink-2"]; ctx.fill();
      label(ctx, C, l.text, spot[0], spot[1], ctx.font, C["--ink-2"]);
    }
  }
  ctx.restore();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, C: Colors, text: string, x: number, y: number, font: string, fill: string) {
  ctx.font = font; ctx.lineJoin = "round";
  ctx.lineWidth = 3; ctx.strokeStyle = C["--halo"]; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(COLORS.map((n) => [n, cs.getPropertyValue(n).trim()]));
}
function useSprite(sh: Sheet[]) {
  const src = sh.find((s) => s.sprite)?.sprite?.src;
  return useMemo(() => { if (!src) return null; const im = new Image(); im.src = BASE + src; return im; }, [src]);
}

// the stack
type Hit = { kind: "sheet"; i: number } | { kind: "model"; key: string; x: number; y: number };

export function LayerStack({ onOpen, from, header }: { onOpen: (l: LayerId) => void; from: LayerId | null; header: ReactNode }) {
  const all = useMemo(sheets, []);
  const ordered = useMemo(() => STACK.map((id) => all.find((s) => s.id === id)!), [all]);
  const shared = useMemo(() => sharedModels(ordered), [ordered]);
  const img = useSprite(ordered);
  const [hoverSheet, setHoverSheet] = useState<number | null>(null);
  const [hoverModel, setHoverModel] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ key: string; x: number; y: number } | null>(null);
  const [hoverFam, setHoverFam] = useState<string | null>(null);
  const [pinnedFam, setPinnedFam] = useState<string | null>(null);
  // The side text steps back while a sheet opens or folds away, so the sheet never slides under it.
  const [moving, setMoving] = useState(!!from && !reduced());
  useEffect(() => { if (!moving) return; const t = setTimeout(() => setMoving(false), 420); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lit = hoverModel ?? pinned;
  const litFam = lit ? null : hoverFam ?? pinnedFam;
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ open: (i: number) => void; redraw: () => void } | null>(null);
  const live = useRef({ hoverSheet, lit, litFam, onOpen });
  live.current = { hoverSheet, lit, litFam, onOpen };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let C = readColors();
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0;
    const still = reduced();
    const n = ordered.length;
    // Per sheet: lift (hover), enter (0 to 1 on load), flat (0 to 1 when opening), gone (others fade when one opens).
    const st = ordered.map(() => ({ lift: 0, spread: 0, enter: still ? 1 : 0, flat: 0, gone: 0 }));
    const t0 = performance.now();
    let opening: { i: number; start: number; dur: number; dir: 1 | -1 } | null = null;
    const fromIdx = from ? ordered.findIndex((s) => s.id === from) : -1;
    if (fromIdx >= 0 && !still) {
      // Back from a flat map: start with that sheet flat and fold it into the stack.
      st.forEach((s, i) => { s.enter = 1; s.flat = i === fromIdx ? 1 : 0; s.gone = i === fromIdx ? 0 : 1; });
      opening = { i: fromIdx, start: t0, dur: 620, dir: -1 };
    }

    const layout = () => {
      // Beside the title block when it floats over the map; below 900 px it sits above the canvas instead.
      const beside = !matchMedia("(max-width: 900px)").matches;
      const left = beside ? (W > 1000 ? 470 : 320) : 0, right = 32, top = beside ? 48 : 24, bottom = beside ? 56 : 24;
      // Gaps as a share of one sheet's height on screen. A measured sheet gets room to show past the one above it;
      // a dashed sheet needs little. The reduced-motion stack sits further apart, so nothing needs a hover to show.
      const ready = ordered.filter((x) => x.ready).length;
      const G = (ready <= 2 ? 0.86 : 0.64) * (still ? 1.2 : 1), Gs = 0.4;
      const gaps = ordered.slice(1).map((x) => (x.ready ? G : Gs));
      const m1 = mat({ cx: 0, cy: 0, k: 1, ...ISO });
      const cs = [proj(m1, 0, 0), proj(m1, 1, 0), proj(m1, 1, ASPECT), proj(m1, 0, ASPECT)];
      const w1 = Math.max(...cs.map((c) => c[0])) - Math.min(...cs.map((c) => c[0]));
      const h1 = Math.max(...cs.map((c) => c[1])) - Math.min(...cs.map((c) => c[1]));
      const aw = W - left - right - 150, ah = H - top - bottom;
      const sum = gaps.reduce((a, b) => a + b, 0);
      const k = Math.max(120, Math.min(aw / w1, ah / (h1 * (1 + sum))));
      const cx = left + 150 + aw / 2;
      const total = h1 * k * (1 + sum);
      const y0 = top + (ah - total) / 2 + (h1 * k) / 2;
      const ys = ordered.map((_, i) => y0 + gaps.slice(0, i).reduce((a, b) => a + b, 0) * h1 * k);
      return { k, ys, cx, h: h1 * k };
    };
    // Flat, a sheet lands where its full map will draw: same scale, same place, so the cross-fade only adds detail.
    const flatPose = (i: number): Pose => {
      const sh = ordered[i], ins = FLAT_INSETS[sh.id], B = sh.box, F = sh.frame;
      if (!B || !F) {
        const w = W - ins.left - ins.right, h = H - ins.top - ins.bottom;
        return { cx: ins.left + w / 2, cy: ins.top + h / 2, k: Math.min(w, h / ASPECT), th: 0, sq: 1 };
      }
      // The maps' own margins: 48 px around prose, 60 by 50 around the others.
      const [mx, my] = sh.id === "prose" ? [48, 48] : [60, 50];
      const w = W - ins.left - ins.right - mx, h = H - ins.top - ins.bottom - my;
      const K = Math.min(w / Math.max(B.x1 - B.x0, 1e-9), h / Math.max(B.y1 - B.y0, 1e-9));
      const bx = ins.left + mx / 2 + (w - K * (B.x1 - B.x0)) / 2 - K * B.x0;
      const top = ins.top + my / 2 + (h - K * (B.y1 - B.y0)) / 2;
      const cy = F.yUp ? top + K * B.y1 - K * F.cy : top - K * B.y0 + K * F.cy;
      return { cx: bx + K * F.cx, cy, k: K / F.k, th: 0, sq: 1 };
    };
    const poses = () => {
      const L = layout();
      return st.map((s, i) => {
        // Prose on top: the first sheet sits highest on screen.
        const iso: Pose = { cx: L.cx, cy: L.ys[i] - s.lift * 5 - s.spread * L.h * 0.1 - (1 - easeOut(s.enter)) * 70, k: L.k, ...ISO };
        if (s.flat <= 0) return iso;
        const f = flatPose(i), e = easeInOut(s.flat);
        return { cx: lerp(iso.cx, f.cx, e), cy: lerp(iso.cy, f.cy, e), k: lerp(iso.k, f.k, e), th: lerp(iso.th, f.th, e), sq: lerp(iso.sq, f.sq, e) };
      });
    };
    let mats: Array<ReturnType<typeof mat>> = [];

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C["--sea"]; ctx.fillRect(0, 0, W, H);
      const P = poses();
      mats = P.map(mat);
      const { lit, litFam } = live.current;
      const isLit: Lit = lit ? (a) => a.key === lit : litFam ? (a) => canon(a.family) === litFam : null;
      // Draw from the bottom sheet up, so upper sheets cover lower ones; an opening sheet goes last.
      const order = [...ordered.keys()].reverse();
      if (opening) order.push(...order.splice(order.indexOf(opening.i), 1));
      for (const i of order) {
        const s = st[i];
        const alpha = easeOut(s.enter) * (1 - s.gone);
        drawSheet(ctx, dpr, C, ordered[i], mats[i], { alpha, flat: easeInOut(s.flat), hover: live.current.hoverSheet === i && !opening, lit: isLit, img, thick: 5 * (1 - s.flat), labels: Math.max(0, 1 - s.flat * 2.5) });
      }
      // The names and threads fade out as a sheet starts to open, and back in as it folds away.
      const chrome = opening ? Math.max(0, 1 - 3 * st[opening.i].flat) : 1;
      if (chrome <= 0.01) return;
      // Sheet names, left of each sheet's left corner.
      ordered.forEach((sh, i) => {
        const s = st[i];
        const a = easeOut(s.enter) * chrome;
        const [x, y] = proj(mats[i], 0, ASPECT);
        const on = live.current.hoverSheet === i;
        ctx.globalAlpha = a;
        ctx.textAlign = "right";
        ctx.font = `${on ? 700 : 600} 16px ${SANS}`; ctx.fillStyle = C["--ink"]; ctx.fillText(sh.name, x - 18, y - 2);
        ctx.font = `12.5px ${SANS}`; ctx.fillStyle = C["--ink-2"]; ctx.fillText(sh.count, x - 18, y + 15);
        if (on) { ctx.fillStyle = C["--ink-3"]; ctx.fillText(sh.ready ? "Click to open its map" : "Open the layer", x - 18, y + 31); }
        ctx.beginPath(); ctx.moveTo(x - 12, y - 6); ctx.lineTo(x - 3, y - 6); ctx.strokeStyle = C["--rule-strong"]; ctx.lineWidth = 1; ctx.stroke();
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      });
      // Threads: one model's anchors on every sheet, joined top to bottom. Faint for all; strong for the lit one.
      const settled = Math.min(...st.map((s) => s.enter));
      if (settled < 0.6) return;
      ctx.globalAlpha = ((settled - 0.6) / 0.4) * chrome;
      for (const e of shared) {
        const pts = ordered.map((sh, i) => { const a = sh.anchors.find((x) => x.key === e.key); return a ? proj(mats[i], a.u, a.v) : null; }).filter((p): p is readonly [number, number] => !!p);
        const on = !!isLit?.(e);
        if (isLit && !on) continue;
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (on) {
          ctx.lineWidth = 5; ctx.strokeStyle = C["--halo"]; ctx.stroke();
          ctx.lineWidth = lit ? 2 : 1.5; ctx.strokeStyle = C[famVar(e.family)]; ctx.stroke();
          for (const [x, y] of pts) {
            ctx.beginPath(); ctx.arc(x, y, lit ? 6 : 4.5, 0, 7); ctx.fillStyle = C[famVar(e.family)]; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = C["--sheet"]; ctx.stroke();
            if (lit) { ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.lineWidth = 1.2; ctx.strokeStyle = C["--ink"]; ctx.stroke(); }
          }
          // One model: name it. A whole maker: the lines alone, or the names would pile up.
          if (lit) { const [x, y] = pts[0]; label(ctx, C, e.name, x + 15, y - 2, `600 14px ${SANS}`, C["--ink"]); }
        } else {
          ctx.lineWidth = 0.8; ctx.strokeStyle = C["--ink-3"]; ctx.globalAlpha *= 0.4; ctx.stroke(); ctx.globalAlpha /= 0.4;
        }
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      let busy = false;
      const k = still ? 1 : 1 - Math.exp(-dt / 90);
      st.forEach((s, i) => {
        if (s.enter < 1) { s.enter = Math.min(1, (now - t0 - (n - 1 - i) * 110) / 560); s.enter = Math.max(0, s.enter); busy = true; }
        const h = live.current.hoverSheet;
        const lift = h === i && !opening ? 1 : 0, spread = h !== null && i < h && !opening ? 1 : 0;
        s.lift += (lift - s.lift) * k; s.spread += (spread - s.spread) * k;
        if (Math.abs(lift - s.lift) > 0.003 || Math.abs(spread - s.spread) > 0.003) busy = true;
        else { s.lift = lift; s.spread = spread; }
      });
      if (opening) {
        const p = Math.min(1, (now - opening.start) / opening.dur);
        const { i, dir } = opening;
        st.forEach((s, j) => {
          const v = dir === 1 ? p : 1 - p;
          if (j === i) s.flat = v; else s.gone = v;
        });
        if (p >= 1) {
          const done = opening;
          opening = null;
          if (done.dir === 1) { live.current.onOpen(ordered[done.i].id); return; }
        } else busy = true;
      }
      draw();
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };
    api.current = {
      redraw: schedule,
      open: (i: number) => {
        if (opening) return;
        if (still) { live.current.onOpen(ordered[i].id); return; }
        setMoving(true);
        opening = { i, start: performance.now(), dur: 620, dir: 1 };
        schedule();
      },
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      draw();
    };
    const hit = (x: number, y: number): Hit | null => {
      if (!mats.length) return null;
      for (let i = 0; i < n; i++) for (const a of ordered[i].anchors) {
        const [ax, ay] = proj(mats[i], a.u, a.v);
        if (Math.hypot(ax - x, ay - y) <= 7 && shared.some((e) => e.key === a.key)) return { kind: "model", key: a.key, x, y };
      }
      for (let i = 0; i < n; i++) {
        const { u, v } = unproj(mats[i], x, y);
        if (u >= 0 && u <= 1 && v >= 0 && v <= ASPECT) return { kind: "sheet", i };
      }
      return null;
    };
    const pos = (ev: MouseEvent) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top] as const; };
    const onMove = (ev: MouseEvent) => {
      const [x, y] = pos(ev);
      const h = hit(x, y);
      canvas.style.cursor = h ? "pointer" : "default";
      setHoverSheet(h?.kind === "sheet" ? h.i : null);
      setHoverModel(h?.kind === "model" ? h.key : null);
      setTip(h?.kind === "model" ? { key: h.key, x, y } : null);
    };
    const onLeave = () => { setHoverSheet(null); setHoverModel(null); setTip(null); };
    const onClick = (ev: MouseEvent) => {
      const [x, y] = pos(ev);
      const h = hit(x, y);
      if (h?.kind === "model") setPinned((p) => (p === h.key ? null : h.key));
      else if (h?.kind === "sheet") api.current?.open(h.i);
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const mo = new MutationObserver(() => { C = readColors(); schedule(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    img?.addEventListener("load", schedule);
    document.fonts?.ready.then(schedule);
    schedule();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); canvas.removeEventListener("click", onClick); img?.removeEventListener("load", schedule); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { api.current?.redraw(); }, [hoverSheet, lit, litFam]);

  const tipModel = tip ? shared.find((e) => e.key === tip.key) : null;
  const makers = useMemo(() => [...new Set(shared.map((e) => canon(e.family)))].filter((f) => f !== "other").sort(byFamily), [shared]);
  return (
    <section className="atlas stack" data-moving={moving || undefined} aria-labelledby="atlas-h">
      <canvas ref={ref} role="img" aria-label={`${ordered.length} sheets stacked: ${ordered.map((s) => `${s.name}, ${s.count.toLowerCase()}`).join("; ")}. Lines join each model's place on every sheet it appears on. The links beside the stack open each layer.`} />
      <div className="cartouche stack-side">
        {header}
        <About ordered={ordered} onOpen={(i) => api.current?.open(i)} onPeek={setHoverSheet} peek={hoverSheet} />
        <ul className="makers" aria-label="Trace a maker's models through the stack">
          {makers.map((f) => (
            <li key={f}>
              <button type="button" aria-pressed={pinnedFam === f} title={`${famName(f)}: ${shared.filter((e) => canon(e.family) === f).length} models`} onClick={() => { setPinned(null); setPinnedFam((p) => (p === f ? null : f)); }} onMouseEnter={() => setHoverFam(f)} onMouseLeave={() => setHoverFam(null)} onFocus={() => setHoverFam(f)} onBlur={() => setHoverFam(null)}>
                <BrandIcon brand={famBrand(f)} size={13} />{famName(f)}
              </button>
            </li>
          ))}
          <li className="makers-more"><Link to="/models">All models</Link></li>
        </ul>
        <Install />
      </div>
      {tipModel && tip && (
        <div className="tip stack-tip" style={{ transform: `translate(${Math.min(tip.x + 16, window.innerWidth - 300)}px, ${tip.y + 16}px)` }} role="status">
          <strong>{tipModel.name}</strong>
          {month(tipModel.released) && <span>{month(tipModel.released)}</span>}
          <span>{tipModel.on.map((l) => LAYER_NAME[l]).join(", ")}</span>
        </div>
      )}
    </section>
  );
}

/** What shibbo is, in two sentences. The layer names open their maps, so the text is also the way in. */
function About({ ordered, onOpen, onPeek, peek }: { ordered: Sheet[]; onOpen: (i: number) => void; onPeek?: (i: number | null) => void; peek?: number | null }) {
  const keys = new Set(ordered.flatMap((s) => s.anchors.map((a) => a.key)));
  const fams = new Set(ordered.flatMap((s) => s.anchors.map((a) => canon(a.family))));
  const link = (i: number) => (
    <button type="button" className="about-layer" data-on={peek === i || undefined} onClick={() => onOpen(i)} onMouseEnter={() => onPeek?.(i)} onMouseLeave={() => onPeek?.(null)} onFocus={() => onPeek?.(i)} onBlur={() => onPeek?.(null)}>{ordered[i].name.toLowerCase()}</button>
  );
  return (
    <p className="about">
      Shibbo tracks the habits that mark a model’s work as machine-made, in three layers: <span className="nb">{link(0)},</span> {link(1)} and <span className="nb">{link(2)}.</span> It maps {keys.size} models from {fams.size} makers and lists <Link to="/tells">{data.tells.length} tells</Link> with their sources.
    </p>
  );
}

const INIT = "npm install -g shibbo";
/** The install command, with a copy button, and the way on to setting up an agent. */
function Install() {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(INIT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {}); };
  return (
    <div className="about-install">
      <h2>Install</h2>
      <div className="cmd">
        <code>{INIT}</code>
        <button type="button" onClick={copy} data-done={copied || undefined} aria-label={copied ? "Copied" : "Copy the command"} title={copied ? "Copied" : "Copy"}>
          <svg className="i-copy" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-1A1.5 1.5 0 0 0 9 3H4.5A1.5 1.5 0 0 0 3 4.5V9a1.5 1.5 0 0 0 1.5 1.5h1" /></svg>
          <svg className="i-ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
        </button>
        <span className="sr" role="status">{copied ? "Copied" : ""}</span>
      </div>
      <Link to="/docs/guide/quick-start">Set up your agent</Link>
    </div>
  );
}

// narrow screens: the layers as flat sections
export function LayerSections({ onOpen, header }: { onOpen: (l: LayerId) => void; header: ReactNode }) {
  const all = useMemo(sheets, []);
  const ordered = STACK.map((id) => all.find((s) => s.id === id)!);
  const img = useSprite(ordered);
  return (
    <section className="stack-sections" aria-labelledby="atlas-h">
      <div className="stack-intro">
        {header}
        <About ordered={ordered} onOpen={(i) => onOpen(ordered[i].id)} />
        <Install />
      </div>
      {ordered.map((s) => (
        <section key={s.id} className="stack-section" aria-labelledby={`sec-${s.id}`}>
          <div className="row">
            <h2 id={`sec-${s.id}`}>{s.name}</h2>
            <span className="count">{s.count}</span>
          </div>
          <MiniSheet sheet={s} img={img} />
          {s.ready ? <button type="button" className="btn" onClick={() => onOpen(s.id)}>Open the {s.name.toLowerCase()} map</button>
            : <p className="stack-note">Shibbo is measuring this layer now. Meanwhile, read the <Link to={`/tells?layer=${s.id}`}>{s.name.toLowerCase()} tells</Link>.</p>}
        </section>
      ))}
    </section>
  );
}

function MiniSheet({ sheet, img }: { sheet: Sheet; img: HTMLImageElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let C = readColors();
    const draw = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      const k = Math.min(r.width - 2, (r.height - 2) / ASPECT);
      drawSheet(ctx, dpr, C, sheet, mat({ cx: r.width / 2, cy: r.height / 2, k, th: 0, sq: 1 }), { alpha: 1, flat: 0, hover: false, lit: null, img, thick: 0, labels: 1 });
    };
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const mo = new MutationObserver(() => { C = readColors(); draw(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    img?.addEventListener("load", draw);
    return () => { ro.disconnect(); mo.disconnect(); img?.removeEventListener("load", draw); };
  }, [sheet, img]);
  return <canvas ref={ref} className="mini-sheet" role="img" aria-label={sheet.ready ? `${sheet.name} map, ${sheet.count.toLowerCase()}, at reduced detail.` : `${sheet.name}: measuring now.`} />;
}
