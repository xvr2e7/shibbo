// A flat map for any layer in the ui-map shape (code-map.json, conduct-map.json): points (one per reply or
// transcript), the tokens that place them, and the models that made them, joined in release order. The panel holds
// the same models and points as buttons, so everything on the map can be reached from the keyboard.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import "d3-transition";
import { contourDensity } from "d3-contour";
import { BrandIcon } from "./BrandIcon";
import { famVar, famColor, famName, famBrand, byFamily, FAM_VARS } from "./families";
import type { GLayer, GModel, GPoint } from "./layerData";
import { LAYER_NAME } from "./layerData";
import type { LayerId } from "./layers";
import { ym } from "../data";
import "../styles/interface-atlas.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (d: string | null) => (d ? `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : "date unknown");
const pct = (v: number) => `${Math.round(v * 100)}%`;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Where the map fits: clear of the title and legend on the left. The details panel opens over the right edge. */
const FIT = { left: 260, right: 32, top: 60, bottom: 330 };
const PANEL = 400;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
type Hover = { kind: "point" | "model" | "token"; i: number; x: number; y: number };

/** The layer isn't measured yet: say so, and point to what exists. */
export function Measuring({ layer, header }: { layer: LayerId; header: ReactNode }) {
  return (
    <section className="atlas layer-measuring" aria-labelledby="atlas-h">
      <div className="cartouche">{header}</div>
      <div className="measuring-sheet" role="status">
        <p className="measuring-h">{LAYER_NAME[layer]}: measuring now</p>
        <p>Shibbo is running the same tasks through each model and placing every {layer === "code" ? "reply" : "transcript"} among the habits it shows. This map appears when the first runs land.</p>
        <p>Meanwhile, read the <Link to={`/tells?layer=${layer}`}>{LAYER_NAME[layer].toLowerCase()} tells</Link> shibbo already tracks.</p>
      </div>
    </section>
  );
}

export function LayerAtlas({ layer, header, month: now, footer }: { layer: GLayer; header: ReactNode; month: number; footer: ReactNode }) {
  const L = layer;
  const view = useMemo(() => {
    const main = (m: GModel) => !L.primary || !m.route || m.route === L.primary;
    const fams = [...new Set(L.models.filter(main).map((m) => m.family))].sort(byFamily);
    const byRelease = L.models.map((m, i) => ({ m, i })).filter((e) => main(e.m)).sort((a, b) => fams.indexOf(a.m.family) - fams.indexOf(b.m.family) || (a.m.released ?? "9").localeCompare(b.m.released ?? "9"));
    const tokIdx = new Map(L.tokens.map((t, i) => [t.id, i]));
    return { main, fams, byRelease, tokIdx, points: L.points.map((p, i) => ({ p, i })).filter((e) => main(L.models[e.p.model])) };
  }, [L]);
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [tok, setTok] = useState<number | null>(null);
  const [fam, setFam] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [wide, setWide] = useState(window.innerWidth > 900);
  useEffect(() => { const on = () => setWide(window.innerWidth > 900); addEventListener("resize", on); return () => removeEventListener("resize", on); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (open !== null) setOpen(null); else if (tok !== null) setTok(null); else if (sel !== null) setSel(null); else if (fam !== null) setFam(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, tok, sel, fam]);
  const panel = open !== null || sel !== null || tok !== null || fam !== null;
  const insets = wide ? { ...FIT, right: panel ? PANEL + 44 : FIT.right } : { left: 8, right: 8, top: 8, bottom: 8 };
  const pickModel = (i: number | null) => { setSel(i); setOpen(null); if (i !== null) setFam(L.models[i].family); };
  const pickToken = (i: number | null) => setTok((t) => (t === i ? null : i));
  const many = L.unit[1];

  return (
    <section className="atlas ui-atlas layer-atlas" aria-labelledby="atlas-h">
      <GMap L={L} view={view} now={now} sel={sel} open={open} tok={tok} fam={fam} insets={insets} shift={wide && panel ? PANEL / 2 : 0} onHover={setHover} onPoint={(i) => { setOpen(i); setHover(null); }} onModel={pickModel} onToken={pickToken} />
      <div className="cartouche">
        {header}
        <div className="legend">
          <ul className="fams fam-pick" aria-label="Makers">
            {view.fams.map((f) => (
              <li key={f}>
                <button type="button" aria-pressed={fam === f} onClick={() => { setSel(null); setOpen(null); setFam((x) => (x === f ? null : f)); }}>
                  <span className="swatch" style={{ background: famColor(f) }} />{famBrand(f) ? <BrandIcon brand={famBrand(f)} size={12} /> : <span className="no-icon" />}{famName(f)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {panel && (
        <aside className="plate ui-panel" aria-label={`${LAYER_NAME[L.id]} atlas details`}>
          {tok !== null && (
            <div className="ui-tokbar" role="status">
              <span>Lit: {many} with <strong>{L.tokens[tok].label}</strong></span>
              <button type="button" className="ui-link" onClick={() => setTok(null)}>Clear</button>
            </div>
          )}
          {open !== null ? <PointDetail L={L} i={open} onClose={() => setOpen(null)} onModel={pickModel} onToken={pickToken} />
            : sel !== null ? <ModelDetail L={L} i={sel} tok={tok} onBack={() => setSel(null)} onPoint={setOpen} onToken={pickToken} tokIdx={view.tokIdx} />
            : fam !== null ? (
              <>
                <button type="button" className="ui-link ui-back" onClick={() => setFam(null)}>Close</button>
                <h2 className="ui-model-h"><BrandIcon brand={famBrand(fam)} size={16} />{famName(fam)}</h2>
                <ol className="ui-models" aria-label={`${famName(fam)} models, by release`}>
                  {view.byRelease.filter((e) => e.m.family === fam).map(({ m, i }) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => pickModel(i)}>
                        <BrandIcon brand={famBrand(m.family)} size={13} />
                        <span className="name">{m.name}</span>
                        <span className="when">{month(m.released)}</span>
                        <span className="n" title={`${m.n} ${many}`}>{m.n}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
        </aside>
      )}
      {footer}
      {hover && <Tip L={L} h={hover} />}
    </section>
  );
}

function ModelDetail({ L, i, tok, onBack, onPoint, onToken, tokIdx }: { L: GLayer; i: number; tok: number | null; onBack: () => void; onPoint: (i: number) => void; onToken: (i: number) => void; tokIdx: Map<string, number> }) {
  const m = L.models[i];
  const mine = L.points.map((p, k) => ({ p, k })).filter((e) => e.p.model === i);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, [i]);
  return (
    <>
      <button ref={back} type="button" className="ui-link ui-back" onClick={onBack}>All {famName(m.family)} models</button>
      <h2 className="ui-model-h"><BrandIcon brand={famBrand(m.family)} size={16} />{m.name}</h2>
      <p className="ui-meta">Released {month(m.released)}{m.date_url ? <> (<a href={m.date_url}>source</a>)</> : null}. {m.n} {L.unit[m.n === 1 ? 0 : 1]} measured.</p>
      <h3>Shows far more than the other models</h3>
      {m.owns.length ? (
        <table className="ui-owns">
          <thead><tr><th /><td>{m.name}</td><td>Others</td></tr></thead>
          <tbody>
            {m.owns.slice(0, 10).map((o) => {
              const ti = tokIdx.get(o.token);
              const k = o.points ?? o.pages ?? 0;
              return (
                <tr key={o.token} className={tok === ti ? "on" : undefined}>
                  <th>{ti !== undefined ? <button type="button" className="ui-link tok" aria-pressed={tok === ti} onClick={() => onToken(ti)}>{L.tokens[ti].label}</button> : o.token}</th>
                  <td className="bars"><span className="bar"><i style={{ width: pct(k / Math.max(o.of, 1)), background: famColor(m.family) }} /></span><span className="num">{k}/{o.of}</span></td>
                  <td className="num">{pct(o.others)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="note">No habit stands out yet.</p>}
      <h3>Its {L.unit[1]}</h3>
      <ul className="ui-pages layer-points">
        {mine.map(({ p, k }) => (
          <li key={k}><button type="button" className={`ui-link${tok !== null && p.t?.includes(tok) ? " lit" : ""}`} onClick={() => onPoint(k)}>{clip(p.title || p.text || `${L.unit[0]} ${k + 1}`, 60)}</button></li>
        ))}
      </ul>
    </>
  );
}

function PointDetail({ L, i, onClose, onModel, onToken }: { L: GLayer; i: number; onClose: () => void; onModel: (i: number) => void; onToken: (i: number) => void }) {
  const p = L.points[i];
  const m = L.models[p.model];
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, [i]);
  return (
    <>
      <button ref={close} type="button" className="ui-link ui-back" onClick={onClose}>Close {L.unit[0]}</button>
      {p.title && <h2 className="ui-page-h">{p.title}</h2>}
      <p className="ui-meta">By <button type="button" className="ui-link" onClick={() => onModel(p.model)}>{m.name}</button>, {month(m.released)}.</p>
      {p.text && (
        <figure className="layer-excerpt-fig">
          {p.file && <figcaption className="note">{p.file}{p.lang ? `, ${p.lang}` : ""}</figcaption>}
          <pre className="layer-excerpt"><code>{p.text}</code></pre>
        </figure>
      )}
      {p.t?.length ? (
        <>
          <h3>Habits it shows</h3>
          <p className="ui-tokens-flat">
            {p.t.map((k, j) => (
              <span key={k}><span className="nowrap"><button type="button" className="ui-link tok" onClick={() => onToken(k)}>{L.tokens[k]?.label ?? k}</button>{j < p.t!.length - 1 ? "," : ""}</span>{j < p.t!.length - 1 ? " " : ""}</span>
            ))}
          </p>
        </>
      ) : null}
    </>
  );
}

function Tip({ L, h }: { L: GLayer; h: Hover }) {
  const style = { transform: `translate(${Math.min(h.x + 16, window.innerWidth - 340)}px, ${h.y + 16}px)` };
  if (h.kind === "point") {
    const p = L.points[h.i], m = L.models[p.model];
    return (
      <div className="tip ui-tip" style={style} role="status">
        <strong>{p.title ?? m.name}</strong>
        {p.text && <span className="layer-tip-text">{clip(p.text, 220)}</span>}
        <span className="ui-tip-sub">{m.name}, {month(m.released)}. Click to open.</span>
      </div>
    );
  }
  if (h.kind === "model") {
    const m = L.models[h.i];
    return <div className="tip ui-tip" style={style} role="status"><strong>{m.name}</strong><span className="ui-tip-sub">The average of its {m.n} {L.unit[1]}. Click to light them.</span></div>;
  }
  const t = L.tokens[h.i];
  return <div className="tip ui-tip" style={style} role="status"><strong>{t.label}</strong><span className="ui-tip-sub">In {t.n} {L.unit[1]}. Click to light them.</span></div>;
}

// the map
type View = { main: (m: GModel) => boolean; fams: string[]; byRelease: Array<{ m: GModel; i: number }>; points: Array<{ p: GPoint; i: number }> };
type MapProps = { L: GLayer; view: View; now: number; sel: number | null; open: number | null; tok: number | null; fam: string | null; shift: number; insets: { left: number; right: number; top: number; bottom: number }; onHover: (h: Hover | null) => void; onPoint: (i: number) => void; onModel: (i: number) => void; onToken: (i: number) => void };

function GMap(props: MapProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ t: zoomIdentity as ZoomTransform, W: 0, H: 0, dpr: 1, base: { k: 1, x: 0, y: 0 }, C: {} as Record<string, string>, raf: 0, props, z: null as ZoomBehavior<HTMLCanvasElement, unknown> | null,
    dots: [] as Array<{ i: number; x: number; y: number }>, anchors: [] as Array<{ i: number; x: number; y: number }>, labels: [] as Array<{ i: number; x0: number; y0: number; x1: number; y1: number }>, hoverPoint: -1 });
  st.current.props = props;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      s.C = Object.fromEntries(["--sea", "--land-1", "--land-2", "--land-3", "--land-4", "--land-5", "--contour", "--ink", "--ink-2", "--ink-3", "--halo", "--sheet", "--rule-strong", ...FAM_VARS].map((n) => [n, cs.getPropertyValue(n).trim()]));
    };
    const sx = (x: number) => s.t.applyX(s.base.x + x * s.base.k);
    const sy = (y: number) => s.t.applyY(s.base.y - y * s.base.k);
    const col = (f: string) => s.C[famVar(f)];
    const fit = () => {
      const { L, view } = s.props;
      const insets = s.W > 900 ? FIT : { left: 8, right: 8, top: 8, bottom: 8 };
      const q = (a: number[], f: number) => { const v = [...a].sort((m, n) => m - n); return v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))] ?? 0; };
      const mm = view.byRelease.map((e) => e.m);
      const xs = view.points.map((e) => e.p.x), ys = view.points.map((e) => e.p.y);
      const [x0, x1, y0, y1] = [Math.min(q(xs, 0.04), ...mm.map((m) => m.x)), Math.max(q(xs, 0.96), ...mm.map((m) => m.x)), Math.min(q(ys, 0.04), ...mm.map((m) => m.y)), Math.max(q(ys, 0.96), ...mm.map((m) => m.y))];
      const w = s.W - insets.left - insets.right - 60, h = s.H - insets.top - insets.bottom - 50;
      const k = Math.min(w / Math.max(x1 - x0, 1e-9), h / Math.max(y1 - y0, 1e-9));
      s.base = { k, x: insets.left + 30 + (w - k * (x1 - x0)) / 2 - k * x0, y: insets.top + 25 + (h - k * (y1 - y0)) / 2 + k * y1 };
      void L;
    };
    const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const SERIF = "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif";
    const draw = () => {
      const { L, view, sel, open, tok, fam, insets, now } = s.props;
      // The timeline: a model and its points appear from its release month on. An undated model always shows.
      const out = (m: GModel) => !!m.released && ym(m.released) > now;
      const C = s.C;
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.fillStyle = C["--sea"]; ctx.fillRect(0, 0, s.W, s.H);
      const k = s.t.k;
      const inFam = (m: GModel) => fam === null || m.family === fam;
      const lit = (p: GPoint, i: number) => ((sel === null ? inFam(L.models[p.model]) : p.model === sel) && (tok === null || !!p.t?.includes(tok))) || i === open;
      const any = sel !== null || tok !== null || fam !== null;
      // Land, as on the prose map: where the points gather, in tinted bands.
      {
        const pts = view.points.filter((e) => !out(L.models[e.p.model])).map((e) => [sx(e.p.x), sy(e.p.y)] as [number, number]);
        const bw = (pts.length > 400 ? 24 : 34) * Math.sqrt(k);
        // Bands at fixed shares of the peak, so a tight cluster still leaves land under the points around it.
        type Band = { coordinates: number[][][][] };
        const density = contourDensity<[number, number]>().x((d) => d[0]).y((d) => d[1]).size([s.W, s.H]).cellSize(4).bandwidth(bw) as unknown as { contours: (d: Array<[number, number]>) => ((v: number) => Band) & { max: number } };
        const at = density.contours(pts);
        const cs = [0.025, 0.06, 0.12, 0.22, 0.36, 0.54, 0.76].map((f) => at(f * at.max));
        const tints = ["--land-1", "--land-1", "--land-2", "--land-2", "--land-3", "--land-4", "--land-5"];
        cs.forEach((c, i) => {
          ctx.beginPath();
          for (const poly of c.coordinates) for (const ring of poly) { ring.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
          ctx.fillStyle = C[tints[Math.min(i, tints.length - 1)]]; ctx.fill("evenodd");
          ctx.strokeStyle = C["--contour"]; ctx.lineWidth = i === 0 ? 1.2 : 0.6; ctx.stroke();
        });
      }
      // Trails.
      const vis = view.byRelease.filter((e) => (e.m.n >= 6 || sel === e.i) && !out(e.m));
      for (const f of view.fams) {
        const pts = vis.filter((e) => e.m.family === f && e.m.released).map((e) => [sx(e.m.x), sy(e.m.y)] as const);
        if (pts.length < 2) continue;
        ctx.globalAlpha = fam !== null && fam !== f ? 0.25 : sel !== null || tok !== null ? 0.45 : 1; ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineWidth = 6; ctx.strokeStyle = C["--halo"]; ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = col(f); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Points: faded first, lit over them.
      const r = Math.max(3, Math.min(7, 3.4 * Math.sqrt(k)));
      s.dots = [];
      const order = view.points.filter((e) => !out(L.models[e.p.model])).map((e) => ({ ...e, on: lit(e.p, e.i) })).sort((a, b) => Number(a.on) - Number(b.on));
      for (const { p, i, on } of order) {
        const x = sx(p.x), y = sy(p.y);
        if (x < -10 || y < -10 || x > s.W + 10 || y > s.H + 10) continue;
        ctx.globalAlpha = on ? (any ? 1 : 0.8) : 0.14;
        ctx.beginPath(); ctx.arc(x, y, i === open || i === s.hoverPoint ? r + 2.5 : r, 0, 7);
        ctx.fillStyle = col(L.models[p.model].family); ctx.fill();
        if (i === open || i === s.hoverPoint) { ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = C["--ink"]; ctx.stroke(); }
        s.dots.push({ i, x, y });
      }
      ctx.globalAlpha = 1;
      // Labels without collisions: models, then tokens by how sharply they split models.
      const boxes: Array<[number, number, number, number]> = [];
      const fits = (x: number, y: number, w: number, above: number, below: number) => {
        const t = y - above, b = y + below;
        if (x < insets.left + 4 || t < insets.top + 4 || x + w > s.W - insets.right - 4 || b > s.H - insets.bottom - 4) return false;
        for (const [a, bb, c, d] of boxes) if (x < c && x + w > a && t < d && b > bb) return false;
        boxes.push([x - 2, t - 2, x + w + 2, b + 2]);
        return true;
      };
      s.anchors = [];
      // The newest release in each family carries a ring, as on the prose map.
      const newest = new Set(view.fams.map((f) => vis.filter((e) => e.m.family === f && e.m.released).at(-1)?.i));
      const shownModel = (m: GModel, i: number) => (sel === null ? inFam(m) : sel === i);
      for (const { m, i } of vis) {
        const x = sx(m.x), y = sy(m.y);
        const cur = newest.has(i);
        ctx.globalAlpha = shownModel(m, i) ? 1 : 0.3;
        ctx.beginPath(); ctx.arc(x, y, sel === i || cur ? 8 : 5, 0, 7); ctx.fillStyle = col(m.family); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C["--sheet"]; ctx.stroke();
        if (sel === i) { ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.strokeStyle = C["--ink"]; ctx.lineWidth = 1.5; ctx.stroke(); }
        else if (cur) { ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.strokeStyle = col(m.family); ctx.lineWidth = 1; ctx.stroke(); }
        s.anchors.push({ i, x, y }); boxes.push([x - 9, y - 9, x + 9, y + 9]);
      }
      for (const { m, i } of vis) {
        const x = sx(m.x), y = sy(m.y);
        if (!shownModel(m, i) && any) continue;
        ctx.font = `${sel === i || newest.has(i) ? 600 : 400} ${sel === i || newest.has(i) ? 14 : 12}px ${SANS}`;
        const w = Math.max(ctx.measureText(m.name).width, 60);
        const spots: Array<[number, number]> = [[x + 12, y - 2], [x - 12 - w, y - 2], [x - w / 2, y - 16], [x - w / 2, y + 26], [x + 12, y + 18], [x - 12 - w, y + 18]];
        const spot = spots.find(([a, b]) => fits(a, b, w, 12, 15));
        if (!spot) continue;
        ctx.globalAlpha = sel === null || sel === i ? 1 : 0.45;
        ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.lineJoin = "round"; ctx.strokeText(m.name, spot[0], spot[1]); ctx.fillStyle = sel === i || newest.has(i) ? C["--ink"] : C["--ink-2"]; ctx.fillText(m.name, spot[0], spot[1]);
        ctx.font = `11px ${SANS}`; ctx.lineWidth = 3; ctx.strokeText(month(m.released), spot[0], spot[1] + 13); ctx.fillStyle = C["--ink-2"]; ctx.fillText(month(m.released), spot[0], spot[1] + 13);
        ctx.globalAlpha = 1;
      }
      const mainIdx = view.byRelease.map((e) => e.i);
      const spread = (share: number[]) => { const v = mainIdx.map((i) => share[i] ?? 0); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
      const owned = new Set(sel !== null ? L.models[sel].owns.map((o) => L.tokens.findIndex((t) => t.id === o.token)) : []);
      const cands = L.tokens.map((t, i) => ({ t, i })).filter((e) => e.t.x !== null).sort((a, b) => (b.i === tok ? 100 : 0) + (owned.has(b.i) ? 50 : 0) + spread(b.t.share) * 4 - ((a.i === tok ? 100 : 0) + (owned.has(a.i) ? 50 : 0) + spread(a.t.share) * 4));
      const budget = Math.round(12 * Math.min(1, s.W / 1000) * Math.min(k, 6) ** 1.4);
      s.labels = [];
      let n = 0;
      for (const e of cands) {
        const must = e.i === tok || owned.has(e.i);
        if (n >= budget && !must) continue;
        const px = sx(e.t.x!), py = sy(e.t.y!);
        ctx.font = must ? `700 13.5px ${SANS}` : `italic 13px ${SERIF}`;
        const w = ctx.measureText(e.t.label).width;
        const spot = ([[px + 6, py + 4], [px - 6 - w, py + 4], [px - w / 2, py - 6], [px - w / 2, py + 16]] as Array<[number, number]>).find(([a, b]) => fits(a, b, w, 11, 3));
        if (!spot) continue;
        ctx.globalAlpha = sel !== null && !must ? 0.45 : 1;
        ctx.beginPath(); ctx.arc(px, py, must ? 3 : 2, 0, 7); ctx.fillStyle = must ? C["--ink"] : C["--ink-2"]; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = C["--halo"]; ctx.strokeText(e.t.label, spot[0], spot[1]);
        ctx.fillStyle = must ? C["--ink"] : C["--ink-2"]; ctx.fillText(e.t.label, spot[0], spot[1]);
        ctx.globalAlpha = 1;
        s.labels.push({ i: e.i, x0: Math.min(spot[0], px - 4), y0: spot[1] - 12, x1: spot[0] + w, y1: spot[1] + 4 });
        n++;
      }
    };
    const schedule = () => { if (!s.raf) s.raf = requestAnimationFrame(() => { s.raf = 0; draw(); }); };
    (canvas as HTMLCanvasElement & { __draw?: () => void; __refit?: () => void }).__draw = schedule;
    (canvas as HTMLCanvasElement & { __draw?: () => void; __refit?: () => void }).__refit = () => { fit(); schedule(); };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      s.W = r.width; s.H = r.height; s.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(s.W * s.dpr); canvas.height = Math.round(s.H * s.dpr);
      fit(); draw();
    };
    readColors();
    const z = zoom<HTMLCanvasElement, unknown>().scaleExtent([0.6, 12]).on("zoom", (ev) => { s.t = ev.transform; schedule(); });
    s.z = z;
    select(canvas).call(z).on("dblclick.zoom", null);
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const mo = new MutationObserver(() => { readColors(); schedule(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const hit = (mx: number, my: number): Hover | null => {
      for (const a of s.anchors) if (Math.hypot(a.x - mx, a.y - my) <= 10) return { kind: "model", i: a.i, x: mx, y: my };
      let best: (typeof s.dots)[number] | null = null, bd = 9;
      for (const d of s.dots) { const dd = Math.hypot(d.x - mx, d.y - my); if (dd < bd) { bd = dd; best = d; } }
      if (best) return { kind: "point", i: best.i, x: mx, y: my };
      for (const l of s.labels) if (mx >= l.x0 && mx <= l.x1 && my >= l.y0 && my <= l.y1) return { kind: "token", i: l.i, x: mx, y: my };
      return null;
    };
    const pos = (ev: MouseEvent) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const onMove = (ev: MouseEvent) => {
      const [mx, my] = pos(ev);
      const h = hit(mx, my);
      canvas.style.cursor = h ? "pointer" : "grab";
      const hp = h?.kind === "point" ? h.i : -1;
      if (hp !== s.hoverPoint) { s.hoverPoint = hp; schedule(); }
      s.props.onHover(h);
    };
    const onLeave = () => { s.props.onHover(null); if (s.hoverPoint !== -1) { s.hoverPoint = -1; schedule(); } };
    const onClick = (ev: MouseEvent) => {
      const [mx, my] = pos(ev);
      const h = hit(mx, my);
      if (!h) return;
      if (h.kind === "point") s.props.onPoint(h.i); else if (h.kind === "model") s.props.onModel(h.i); else s.props.onToken(h.i);
    };
    canvas.addEventListener("mousemove", onMove); canvas.addEventListener("mouseleave", onLeave); canvas.addEventListener("click", onClick);
    document.fonts?.ready.then(schedule);
    return () => { ro.disconnect(); mo.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); canvas.removeEventListener("click", onClick); cancelAnimationFrame(s.raf); s.raf = 0; select(canvas).on(".zoom", null); };
  }, []);
  useEffect(() => { (ref.current as HTMLCanvasElement & { __draw?: () => void })?.__draw?.(); }, [props.sel, props.open, props.tok, props.fam, props.insets.right, props.now]);
  useEffect(() => { (ref.current as HTMLCanvasElement & { __refit?: () => void })?.__refit?.(); }, [props.L]);
  // The details panel covers the right edge: slide the map left by half its width while it is open.
  const shifted = useRef(0);
  useEffect(() => {
    const c = ref.current, z = st.current.z;
    const dx = shifted.current - props.shift;
    shifted.current = props.shift;
    if (c && z && dx) select(c).transition().duration(reduced() ? 0 : 320).call(z.translateBy, dx / st.current.t.k, 0);
  }, [props.shift]);

  const zoomBy = (f: number) => { const c = ref.current, z = st.current.z; if (c && z) select(c).transition().duration(reduced() ? 0 : 220).call(z.scaleBy, f); };
  const fitView = () => { const c = ref.current, z = st.current.z; if (c && z) select(c).transition().duration(reduced() ? 0 : 220).call(z.transform, zoomIdentity.translate(-shifted.current, 0)); };
  const { L, view } = props;
  return (
    <>
      <canvas ref={ref} role="img" aria-label={`Map of ${view.points.length} ${L.unit[1]}, each placed among the habits it shows, with the models that made them: ${view.byRelease.map((e) => e.m.name).join(", ")}. The panel lists the same models and their ${L.unit[1]}.`} />
      <div className="zoom-controls ui-zoom" role="group" aria-label="Map zoom">
        <button className="btn icon" type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in" title="Zoom in">+</button>
        <button className="btn icon" type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" title="Zoom out">−</button>
        <button className="btn icon" type="button" onClick={fitView} aria-label="Fit the whole map" title="Fit the whole map">⤢</button>
      </div>
    </>
  );
}
