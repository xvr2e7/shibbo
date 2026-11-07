// The atlas. Canvas map: phrases as terrain, model releases as routes, a time slider that replays 2025-26.
import { contourDensity } from "d3-contour";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { quadtree, type Quadtree } from "d3-quadtree";

type Model = { id: string; name: string; family: string; released: string; verified: boolean; x: number; y: number };
type Raw = [string, number, number, 0 | 1, string, number, ...number[]];
type Term = { term: string; x: number; y: number; under: boolean; tell: string; floor: number; v: number[]; strength: number };
type Data = { models: Model[]; terms: Raw[]; explained: number };

const data: Data = JSON.parse(document.getElementById("map-data")!.textContent!);
const models = data.models;
const terms: Term[] = data.terms.map((r) => {
  const v = (r.slice(6) as number[]).map((x) => x / 10);
  return { term: r[0], x: r[1], y: r[2], under: r[3] === 1, tell: r[4], floor: r[5], v, strength: Math.max(...v.map(Math.abs)) };
});
const FAMS = ["gpt", "claude", "gemini"];
const FAM_NAME: Record<string, string> = { gpt: "GPT", claude: "Claude", gemini: "Gemini" };

// Months from the first release to the last.
const ym = (s: string) => +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1;
const first = Math.min(...models.map((m) => ym(m.released)));
const last = Math.max(...models.map((m) => ym(m.released)));
const monthLabel = (i: number) => new Date(Date.UTC(Math.floor(i / 12), i % 12, 15)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });

const root = document.getElementById("atlas")!;
const canvas = root.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const slider = root.querySelector<HTMLInputElement>("#atlas-time")!;
const playBtn = root.querySelector<HTMLButtonElement>("#atlas-play")!;
const dateOut = root.querySelector<HTMLElement>("#atlas-date")!;
const tip = root.querySelector<HTMLElement>("#atlas-tip")!;
const resetBtn = root.querySelector<HTMLButtonElement>("#atlas-reset")!;
const stat = root.querySelector<HTMLElement>("#atlas-stat")!;
slider.min = String(first);
slider.max = String(last);
slider.value = String(last);

let W = 0, H = 0, dpr = 1;
let t: ZoomTransform = zoomIdentity;
let month = last;
let base = { k: 1, x: 0, y: 0 }; // world -> screen fit

const css = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
let C: Record<string, string> = {};
const readColors = () => {
  C = Object.fromEntries(["--sea", "--land-1", "--land-2", "--land-3", "--land-4", "--land-5", "--contour", "--shore", "--shore-line", "--ink", "--ink-2", "--muted", "--fossil", "--fam-gpt", "--fam-claude", "--fam-gemini", "--ring", "--halo"].map((n) => [n, css(n)]));
};

function fit() {
  const pad = 70;
  const xs = [...models.map((m) => m.x), ...terms.map((d) => d.x), 0];
  const ys = [...models.map((m) => m.y), ...terms.map((d) => d.y), 0];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const left = W > 980 ? 400 : 0; // title panel
  const top = W > 980 ? 0 : 150;
  const k = Math.min((W - left - pad * 2) / (x1 - x0), (H - top - pad * 2 - 60) / (y1 - y0));
  base = { k, x: left + (W - left - k * (x0 + x1)) / 2, y: top + (H - top - 60 - k * (y0 + y1)) / 2 };
}
const sx = (x: number) => t.applyX(base.x + x * base.k);
const sy = (y: number) => t.applyY(base.y + y * base.k);

/** Which model is current in each family at this month, and which came before. */
function state(m: number) {
  const current = new Map<string, Model>();
  const past = new Set<string>();
  for (const f of FAMS) {
    const seq = models.filter((x) => x.family === f && ym(x.released) <= m).sort((a, b) => ym(a.released) - ym(b.released));
    if (seq.length) current.set(f, seq.at(-1)!);
    for (const x of seq.slice(0, -1)) past.add(x.id);
  }
  return { current, past };
}

const idx = new Map(models.map((m, i) => [m.id, i]));
function termState(d: Term, current: Map<string, Model>, past: Set<string>): { alive: boolean; fossil: boolean; owner: string | null; level: number } {
  let level = 0, owner: string | null = null;
  for (const m of current.values()) {
    const v = d.v[idx.get(m.id)!];
    const s = d.under ? -v : v;
    if (s >= 2 && s > level) { level = s; owner = m.family; }
  }
  if (level) return { alive: true, fossil: false, owner, level };
  for (const id of past) { const v = d.v[idx.get(id)!]; if ((d.under ? -v : v) >= 2) return { alive: false, fossil: true, owner: null, level: 0 }; }
  return { alive: false, fossil: false, owner: null, level: 0 };
}

let qt: Quadtree<{ d: Term; px: number; py: number }> | null = null;

function ringPath(rings: number[][][]) {
  for (const ring of rings) {
    ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
}

function catmull(points: Array<[number, number]>) {
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

function draw() {
  const { current, past } = state(month);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C["--sea"];
  ctx.fillRect(0, 0, W, H);

  const states = terms.map((d) => ({ d, s: termState(d, current, past), px: sx(d.x), py: sy(d.y) }));
  const land = states.filter((e) => e.s.alive && !e.d.under);
  const shore = states.filter((e) => e.s.alive && e.d.under);
  const bw = Math.max(10, 13 * Math.sqrt(t.k));

  // Human shore: words people use and current models avoid.
  if (shore.length > 3) {
    const cs = contourDensity<typeof shore[number]>().x((e) => e.px).y((e) => e.py).weight((e) => e.s.level).size([W, H]).cellSize(4).bandwidth(bw).thresholds(4)(shore);
    cs.forEach((c, i) => { ctx.beginPath(); for (const poly of c.coordinates) ringPath(poly as number[][][]); ctx.fillStyle = C["--shore"]; ctx.globalAlpha = 0.35 + i * 0.15; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = C["--shore-line"]; ctx.lineWidth = 0.8; ctx.stroke(); });
  }
  // Land: phrases current models over-use. Height = how much strong over-use clusters there.
  if (land.length > 3) {
    const cs = contourDensity<typeof land[number]>().x((e) => e.px).y((e) => e.py).weight((e) => e.s.level).size([W, H]).cellSize(3).bandwidth(bw).thresholds(9)(land);
    const tints = ["--land-1", "--land-1", "--land-2", "--land-2", "--land-3", "--land-3", "--land-4", "--land-4", "--land-5", "--land-5"];
    cs.forEach((c, i) => {
      ctx.beginPath();
      for (const poly of c.coordinates) ringPath(poly as number[][][]);
      ctx.fillStyle = C[tints[Math.min(i, tints.length - 1)]];
      ctx.fill();
      ctx.strokeStyle = C["--contour"];
      ctx.lineWidth = i === 0 ? 1.2 : 0.6;
      ctx.stroke();
    });
  }

  // Fossils: phrases an earlier release used that the current ones dropped.
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = C["--fossil"];
  for (const e of states) if (e.s.fossil) { ctx.beginPath(); ctx.arc(e.px, e.py, 1.6, 0, 7); ctx.stroke(); }
  // Live phrases, colored by the family that over-uses them most.
  for (const e of states) {
    if (!e.s.alive) continue;
    ctx.beginPath();
    ctx.arc(e.px, e.py, 1 + Math.min(e.s.level, 10) * 0.22 * Math.sqrt(Math.min(t.k, 4)), 0, 7);
    ctx.fillStyle = e.d.under ? C["--shore-line"] : C[`--fam-${e.s.owner}`];
    ctx.globalAlpha = e.d.under ? 0.7 : 0.78;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // People: the origin.
  const ox = sx(0), oy = sy(0);
  ctx.strokeStyle = C["--ink-2"];
  for (const r of [6, 13, 22]) { ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7); ctx.lineWidth = r === 6 ? 2 : 0.7; ctx.stroke(); }
  ctx.font = "600 14px system-ui,-apple-system,'Segoe UI',sans-serif";
  ctx.textAlign = "left";
  ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.strokeText("People", ox + 28, oy + 5);
  ctx.fillStyle = C["--ink"]; ctx.fillText("People", ox + 28, oy + 5);
  ctx.font = "italic 12px system-ui,-apple-system,'Segoe UI',sans-serif";
  ctx.lineWidth = 3; ctx.strokeText("human writing, same topics", ox + 28, oy + 21);
  ctx.fillStyle = C["--ink-2"]; ctx.fillText("human writing, same topics", ox + 28, oy + 21);

  // Routes: each family's releases in order, up to now.
  for (const f of FAMS) {
    const seq = models.filter((m) => m.family === f && ym(m.released) <= month).sort((a, b) => ym(a.released) - ym(b.released));
    if (!seq.length) continue;
    const pts = seq.map((m) => [sx(m.x), sy(m.y)] as [number, number]);
    if (pts.length > 1) {
      ctx.beginPath(); catmull(pts);
      ctx.strokeStyle = C["--halo"]; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.stroke();
      ctx.beginPath(); catmull(pts);
      ctx.strokeStyle = C[`--fam-${f}`]; ctx.lineWidth = 2.5; ctx.stroke();
    }
    seq.forEach((m, i) => {
      const [x, y] = pts[i];
      const isCur = i === seq.length - 1;
      ctx.beginPath(); ctx.arc(x, y, isCur ? 8 : 5, 0, 7);
      ctx.fillStyle = C[`--fam-${f}`]; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C["--ring"]; ctx.stroke();
      if (isCur) { ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.strokeStyle = C[`--fam-${f}`]; ctx.lineWidth = 1; ctx.stroke(); }
    });
  }

  // Labels: models first, then the strongest live phrases that fit.
  const boxes: Array<[number, number, number, number]> = [];
  const fits = (x: number, y: number, w: number, h: number) => {
    const top = y - (h > 20 ? 14 : h), bottom = y + (h > 20 ? h - 12 : 3);
    if (x < 4 || top < 4 || x + w > W - 4 || bottom > H - 70) return false;
    for (const [a, b, c, d] of boxes) if (x < c && x + w > a && top < d && bottom > b) return false;
    boxes.push([x - 2, y - (h > 20 ? 14 : h) - 2, x + w + 2, y + (h > 20 ? h - 12 : 3)]);
    return true;
  };
  boxes.push([ox - 24, oy - 24, ox + 200, oy + 26]);
  ctx.textAlign = "left";
  for (const m of models) if (ym(m.released) <= month) boxes.push([sx(m.x) - 10, sy(m.y) - 10, sx(m.x) + 10, sy(m.y) + 10]);
  for (const f of FAMS) {
    const seq = models.filter((m) => m.family === f && ym(m.released) <= month);
    for (const m of seq) {
      const cur = current.get(f)?.id === m.id;
      const mx = sx(m.x), my = sy(m.y);
      ctx.font = `${cur ? 700 : 500} ${cur ? 14 : 12}px system-ui,-apple-system,'Segoe UI',sans-serif`;
      const label = m.name;
      const w = ctx.measureText(label).width;
      const sub = new Date(Date.UTC(Math.floor(ym(m.released) / 12), ym(m.released) % 12, 15)).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" }) + (m.verified ? "" : "*");
      const spots: Array<[number, number]> = [[mx + 13, my - 4], [mx - 13 - w, my - 4], [mx - w / 2, my - 16], [mx - w / 2, my + 30], [mx + 13, my + 14], [mx - 13 - w, my + 14]];
      const spot = spots.find(([x, y]) => fits(x, y, w, 28)) ?? spots[0];
      const [x, y] = spot;
      ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.strokeText(label, x, y);
      ctx.fillStyle = cur ? C["--ink"] : C["--ink-2"]; ctx.fillText(label, x, y);
      ctx.font = "11px system-ui,-apple-system,'Segoe UI',sans-serif";
      ctx.lineWidth = 3; ctx.strokeText(sub, x, y + 13);
      ctx.fillStyle = C["--muted"]; ctx.fillText(sub, x, y + 13);
    }
  }
  // Region names, set in italic like names on a relief map, wherever they fit near the family's centroid.
  ctx.font = "italic 500 24px system-ui,-apple-system,'Segoe UI',sans-serif";
  for (const f of FAMS) {
    const own = land.filter((e) => e.s.owner === f && e.s.level >= 4);
    if (own.length < 30) continue;
    const cx = own.reduce((a, e) => a + e.px, 0) / own.length, cy = own.reduce((a, e) => a + e.py, 0) / own.length;
    const text = `${FAM_NAME[f]} country`;
    const w = ctx.measureText(text).width;
    const offsets = [[0, 0], [0, -36], [0, 36], [-60, 0], [60, 0], [0, -72], [0, 72], [-90, -40], [90, 40], [-90, 40], [90, -40]];
    const spot = offsets.map(([dx, dy]) => [cx - w / 2 + dx, cy + dy]).find(([x, y]) => fits(x, y, w, 22));
    if (!spot) continue;
    ctx.lineWidth = 5; ctx.strokeStyle = C["--halo"]; ctx.strokeText(text, spot[0], spot[1]);
    ctx.fillStyle = C[`--fam-${f}`]; ctx.fillText(text, spot[0], spot[1]);
  }

  const budget = Math.round(28 * Math.min(t.k, 6) ** 1.3);
  const cands = states.filter((e) => e.s.alive && e.px > 0 && e.px < W && e.py > 0 && e.py < H).sort((a, b) => (b.d.tell ? 3 : 0) + b.s.level - ((a.d.tell ? 3 : 0) + a.s.level));
  let placed = 0;
  for (const e of cands) {
    if (placed >= budget) break;
    const size = Math.round(10.5 + Math.min(e.s.level, 10) * 0.35);
    ctx.font = `${e.d.under ? "italic " : ""}${e.d.tell ? 600 : 400} ${size}px system-ui,-apple-system,'Segoe UI',sans-serif`;
    const text = e.d.term.replace(/ _ /g, " … ").replace(/^_ | _$/g, "… ");
    const w = ctx.measureText(text).width;
    const x = e.px + 5, y = e.py + 4;
    if (!fits(x, y, w, size)) continue;
    ctx.lineWidth = 3; ctx.strokeStyle = C["--halo"]; ctx.strokeText(text, x, y);
    ctx.fillStyle = e.d.under ? C["--shore-line"] : C["--ink"];
    ctx.fillText(text, x, y);
    placed++;
  }

  qt = quadtree<{ d: Term; px: number; py: number }>().x((e) => e.px).y((e) => e.py).addAll(states.filter((e) => e.s.alive || e.s.fossil).map((e) => ({ d: e.d, px: e.px, py: e.py })));
  dateOut.textContent = monthLabel(month);
  const alive = states.filter((e) => e.s.alive && !e.d.under).length;
  const fossils = states.filter((e) => e.s.fossil).length;
  stat.textContent = `${alive.toLocaleString("en")} live tells, ${fossils.toLocaleString("en")} dropped`;
}

function resize() {
  const r = canvas.getBoundingClientRect();
  W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  fit();
  draw();
}

let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

const z = zoom<HTMLCanvasElement, unknown>().scaleExtent([0.6, 14]).on("zoom", (ev) => { t = ev.transform; schedule(); });
select(canvas).call(z).on("dblclick.zoom", null);
resetBtn.addEventListener("click", () => select(canvas).call(z.transform, zoomIdentity));

canvas.addEventListener("mousemove", (ev) => {
  const r = canvas.getBoundingClientRect();
  const mx = ev.clientX - r.left, my = ev.clientY - r.top;
  const hit = qt?.find(mx, my, 10);
  if (!hit) { tip.hidden = true; canvas.style.cursor = "grab"; return; }
  const d = hit.d;
  canvas.style.cursor = d.tell ? "pointer" : "default";
  const rows = models.map((m, i) => {
    const v = d.v[i];
    const r2 = Math.pow(2, Math.abs(v));
    const fl = (d.floor >> i) & 1;
    const n = r2 >= 100 ? Math.round(r2).toLocaleString("en") : r2.toFixed(1);
    const txt = v === 0 ? "–" : fl ? (v > 0 ? `${Math.round(r2 / 2)} vs 0` : `0 vs ${Math.round(r2 / 2)}`) : v > 0 ? `${n}×` : `people ${n}×`;
    const w = Math.min(100, (Math.abs(v) / 10) * 100);
    return `<tr${ym(m.released) > month ? ' class="later"' : ""}><th>${m.name}</th><td><span class="b ${v < 0 ? "under" : ""}" style="width:${w}%;${v > 0 ? `background:var(--fam-${m.family})` : ""}"></span></td><td>${txt}</td></tr>`;
  }).join("");
  const anyFloor = d.floor !== 0;
  tip.innerHTML = `<strong>${d.term.replace(/ _ /g, " … ")}</strong>${d.under ? "<em>people use this more</em>" : ""}<table>${rows}</table>${anyFloor ? "<small>“411 vs 0”: raw uses in Graphite’s articles, model vs. people.</small>" : ""}${d.tell ? "<small>Click for the full entry</small>" : ""}`;
  tip.hidden = false;
  const x = Math.min(mx + 16, W - tip.offsetWidth - 8), y = Math.min(my + 16, H - tip.offsetHeight - 8);
  tip.style.transform = `translate(${x}px, ${y}px)`;
});
canvas.addEventListener("mouseleave", () => { tip.hidden = true; });
canvas.addEventListener("click", (ev) => {
  const r = canvas.getBoundingClientRect();
  const hit = qt?.find(ev.clientX - r.left, ev.clientY - r.top, 10);
  if (hit?.d.tell) location.href = `tells/${hit.d.tell}.html`;
});

slider.addEventListener("input", () => { month = +slider.value; stop(); schedule(); });

let timer: number | null = null;
function stop() { if (timer !== null) { clearInterval(timer); timer = null; } playBtn.textContent = "Play"; playBtn.setAttribute("aria-pressed", "false"); }
function play() {
  if (month >= last) month = first;
  playBtn.textContent = "Pause"; playBtn.setAttribute("aria-pressed", "true");
  timer = window.setInterval(() => {
    month++;
    slider.value = String(month);
    schedule();
    if (month >= last) stop();
  }, 650);
}
playBtn.addEventListener("click", () => (timer === null ? play() : stop()));

new ResizeObserver(resize).observe(canvas);
readColors();
new MutationObserver(() => { readColors(); schedule(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); schedule(); });

// A link like #t=2025-08 opens on that month. Otherwise replay the timeline once, unless the reader prefers less motion.
const hashMonth = /t=(\d{4})-(\d{2})/.exec(location.hash);
if (hashMonth) {
  month = Math.max(first, Math.min(last, +hashMonth[1] * 12 + +hashMonth[2] - 1));
  slider.value = String(month);
} else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  month = first; slider.value = String(first);
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(play, 500); } });
  io.observe(canvas);
}
