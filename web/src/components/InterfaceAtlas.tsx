// The interface atlas: one-shot pages, the design tokens they use, and the models that made them, in one plane.
// Built by measure/ui-features.mjs and scripts/ui_map.py. Each page is drawn as its own screenshot tile.
// Two routes stay apart: bare API requests (the main set) and Claude through Claude Code (a comparison layer).
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import "d3-transition";
import raw from "../data/ui-map.json";
import { BrandIcon, brandOf } from "./BrandIcon";
import { famVar, famColor, famName, famBrand, byFamily, FAM_VARS } from "./families";
import { ym } from "../data";
import "../styles/interface-atlas.css";

type Route = "api" | "cli";
type Owned = { token: string; pages: number; of: number; others: number; p: number };
type UiModel = { id: string; route: Route; name: string; family: string; runs: number; failed: number; released: string | null; date_source: string | null; date_url: string | null; x: number; y: number; pages: number; complete: boolean; active?: boolean; owns: Owned[] };
type UiToken = { id: string; label: string; group: string; pages: number; x: number | null; y: number | null; share: number[] };
type UiPage = { model: number; brief: string; kind: string; h1: string | null; ground: string | null; x: number; y: number; sprite: number; t: number[]; view: string };
type Drift = { token: string; early: number; late: number; rho: number };
type Moved = { token: string; api: number; cli: number };
type Pair = { model: string; api: number; cli: number; briefs: number; distance: number; mean_change: number; moved: Moved[] };
type Wrapper = { models: number; pairs: Pair[]; mean_distance: number; mean_distance_between_api_models: number | null; mean_change: number; tokens: Array<Moved & { same_way: number }> };
const D = raw as unknown as {
  primary: Route; routes: Record<Route, { name: string; models: number; pages: number }>; explained: number[]; limits: string[]; briefs: Record<string, { kind: string; brief: string }>;
  models: UiModel[]; tokens: UiToken[]; pages: UiPage[]; sprite: { src: string; w: number; h: number; cols: number }; drift: Record<string, { early: string[]; late: string[]; tokens: Drift[] }>; wrapper: Wrapper | null;
};
const models = D.models, tokens = D.tokens, pages = D.pages;
const PRIMARY = D.primary ?? "cli";
const SECOND: Route = PRIMARY === "api" ? "cli" : "api";
const hasSecond = models.some((m) => m.route === SECOND);
const ROUTE_LABEL: Record<Route, string> = { api: "API, no system prompt", cli: "via Claude Code" };
const tokIdx = new Map(tokens.map((t, i) => [t.id, i]));
const placed = tokens.map((t, i) => ({ t, i })).filter((e) => e.t.x !== null);
const BASE = import.meta.env.BASE_URL;

const GROUPS: Array<[string, string]> = [["type", "Type"], ["colour", "Colour"], ["shape", "Shape"], ["layout", "Layout"], ["motion", "Motion"], ["tell", "Tells"]];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (d: string | null) => (d ? `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : "date unknown");
const day = (d: string | null) => (d ? `${+d.slice(8, 10) || ""} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`.trim() : "date unknown");
const pct = (v: number) => `${Math.round(v * 100)}%`;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Where the map fits: clear of the title and legend on the left. The details panel opens over the right edge. */
const FIT = { left: 260, right: 32, top: 60, bottom: 330 };
const PANEL = 400;
const primaryFams = [...new Set(models.filter((m) => m.route === PRIMARY && m.active !== false).map((m) => m.family))].sort(byFamily);
// Families with the most models first; within each, release order.
const famOrder = [...new Set(models.map((m) => m.family))].sort((a, b) => models.filter((m) => m.family === b).length - models.filter((m) => m.family === a).length);
const byRelease = models.map((m, i) => ({ m, i })).sort((a, b) => famOrder.indexOf(a.m.family) - famOrder.indexOf(b.m.family) || (a.m.released ?? "9").localeCompare(b.m.released ?? "9"));
const short = (m: UiModel) => (primaryFams.length === 1 && m.family === "claude" ? m.name.replace(/^Claude /, "") : m.name);
const twin = (i: number) => models.findIndex((m) => m.id === models[i].id && m.route !== models[i].route);
const shown = (i: number, cmp: boolean) => models[i].route === PRIMARY || cmp;

type Hover = { kind: "page" | "token" | "model"; i: number; x: number; y: number };

export default function InterfaceAtlas({ header, month: now, footer }: { header: ReactNode; month: number; footer: ReactNode }) {
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [tok, setTok] = useState<number | null>(null);
  const [cmp, setCmp] = useState(false);
  const [groups, setGroups] = useState<Set<string>>(() => new Set(GROUPS.map((g) => g[0])));
  const [fam, setFam] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [wide, setWide] = useState(window.innerWidth > 900);
  useEffect(() => {
    const on = () => setWide(window.innerWidth > 900);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (open !== null) setOpen(null);
      else if (tok !== null) setTok(null);
      else if (sel !== null) setSel(null);
      else if (fam !== null) setFam(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, tok, sel, fam]);

  const pickPage = (i: number) => { setOpen(i); setHover(null); if (!shown(pages[i].model, cmp)) setCmp(true); };
  const pickModel = (i: number | null) => { setSel(i); setOpen(null); if (i !== null) setFam(models[i].family); if (i !== null && !shown(i, cmp)) setCmp(true); };
  const pickToken = (i: number | null) => setTok((t) => (t === i ? null : i));
  const toggleCmp = () => { if (cmp && sel !== null && models[sel].route !== PRIMARY) { setSel(null); setOpen(null); } setCmp(!cmp); };
  const panel = open !== null || sel !== null || tok !== null || fam !== null || cmp;
  const insets = wide ? { ...FIT, right: panel ? PANEL + 44 : FIT.right } : { left: 8, right: 8, top: 8, bottom: 8 };

  return (
    <section className="atlas ui-atlas" aria-labelledby="atlas-h">
      <UiMap now={now} sel={sel} open={open} tok={tok} cmp={cmp} fam={fam} shift={wide && panel ? PANEL / 2 : 0} groups={groups} insets={insets} onHover={setHover} onPage={pickPage} onToken={pickToken} onModel={pickModel} />
      <div className="cartouche">
        {header}
        <div className="legend ui-legend">
          <div className="legend-row ui-groups" role="group" aria-label="Token labels">
            {GROUPS.map(([g, n]) => (
              <button key={g} type="button" className="layer" aria-pressed={groups.has(g)} onClick={() => setGroups((s) => { const c = new Set(s); if (c.has(g)) c.delete(g); else c.add(g); return c; })}>
                <span className={`swatch tok-${g}`} aria-hidden="true" />{n}
              </button>
            ))}
          </div>
          <ul className="fams fam-pick" aria-label="Makers">
            {primaryFams.map((f) => (
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
        <aside className="plate ui-panel" aria-label="Interface atlas details">
          {tok !== null && <TokenBar i={tok} sel={sel} cmp={cmp} onClear={() => setTok(null)} />}
          {open !== null ? <PageDetail i={open} onClose={() => setOpen(null)} onModel={pickModel} onToken={pickToken} tok={tok} />
            : sel !== null ? <ModelDetail i={sel} onBack={() => setSel(null)} onPage={pickPage} onToken={pickToken} onModel={pickModel} tok={tok} />
            : <Overview fam={fam} onClose={() => setFam(null)} onModel={pickModel} onToken={pickToken} cmp={cmp} />}
        </aside>
      )}
      {footer}
      {hover && <Tip h={hover} cmp={cmp} />}
    </section>
  );
}

/** The token that filters the map, with a way out. */
function TokenBar({ i, sel, cmp, onClear }: { i: number; sel: number | null; cmp: boolean; onClear: () => void }) {
  const t = tokens[i];
  const pool = pages.filter((p) => (sel === null ? shown(p.model, cmp) : p.model === sel));
  const n = pool.filter((p) => p.t.includes(i)).length;
  return (
    <div className="ui-tokbar" role="status">
      <span>Lit: pages with <strong>{t.label}</strong>, {n} of {pool.length}{sel !== null ? ` by ${short(models[sel])}` : ""}</span>
      <button type="button" className="ui-link" onClick={onClear}>Clear</button>
    </div>
  );
}

function ModelList({ route, fam, onModel }: { route: Route; fam: string | null; onModel: (i: number) => void }) {
  const rows = byRelease.filter((e) => e.m.route === route && (fam === null || e.m.family === fam));
  const fams = [...new Set(rows.map((e) => e.m.family))];
  return (
    <>
      {fams.map((f) => (
        <ol key={f} className="ui-models" aria-label={famName(f)}>
          {rows.filter((e) => e.m.family === f).map(({ m, i }) => (
            <li key={m.id}>
              <button type="button" onClick={() => onModel(i)}>
                <BrandIcon brand={brandOf(m.id.startsWith("gemma") ? "gemma" : m.family)} size={13} />
                <span className="name">{m.name}</span>
                <span className="when">{month(m.released)}</span>
                <span className="n">{m.pages}{m.complete ? "" : "*"}</span>
              </button>
            </li>
          ))}
        </ol>
      ))}
    </>
  );
}

/** The panel with no model or page chosen: one maker's models and how its pages moved, and what Claude Code changes when that set is on. */
function Overview({ fam, onClose, onModel, onToken, cmp }: { fam: string | null; onClose: () => void; onModel: (i: number) => void; onToken: (i: number) => void; cmp: boolean }) {
  const dr = fam ? D.drift?.[fam] : undefined;
  const yr = (id?: string) => models.find((m) => m.id === id && m.route === PRIMARY)?.released?.slice(0, 4);
  const W = D.wrapper;
  const inFam = (m: UiModel) => fam === null || m.family === fam;
  const missing = models.filter((m) => m.failed && inFam(m) && (m.route === PRIMARY || cmp));
  return (
    <>
      {fam !== null && (
        <>
          <button type="button" className="ui-link ui-back" onClick={onClose}>Close</button>
          <h2 className="ui-model-h"><BrandIcon brand={famBrand(fam)} size={16} />{famName(fam)}</h2>
          <ModelList route={PRIMARY} fam={fam} onModel={onModel} />
        </>
      )}
      {cmp && hasSecond && (fam === null || models.some((m) => m.route === SECOND && m.family === fam)) && (
        <>
          <h3>Pages {ROUTE_LABEL[SECOND]}</h3>
          <ModelList route={SECOND} fam={fam} onModel={onModel} />
        </>
      )}
      {missing.length > 0 && <p className="note">{missing.map((m) => `${m.name}${hasSecond ? ` (${m.route === "api" ? "API" : "Claude Code"})` : ""} missed ${m.failed}`).join("; ")}: the reply held no page, was cut off at the token limit, or came from another model.</p>}
      {dr && (
        <>
          <h2 className="ui-h2-gap">How {famName(fam)} pages moved, {yr(dr.early[0])} to {yr(dr.late.at(-1))}</h2>
          <p className="note ui-note-top">Share of pages: first {dr.early.length} releases (open ring), last {dr.late.length} (filled).</p>
          <DumbList rows={dr.tokens.slice(0, 8).map((d) => ({ token: d.token, a: d.early, b: d.late }))} onToken={onToken} />
        </>
      )}
      {cmp && W && (
        <>
          <h2 className="ui-h2-gap">What Claude Code changes</h2>
          <p className="note ui-note-top">
            The same {W.models} models and briefs. Through Claude Code a model’s pages move {W.mean_distance.toFixed(0)} map units from its API pages{W.mean_distance_between_api_models ? `; two different models sit ${W.mean_distance_between_api_models.toFixed(0)} apart` : ""}. API (open ring), Claude Code (filled):
          </p>
          <DumbList rows={W.tokens.slice(0, 6).map((d) => ({ token: d.token, a: d.api, b: d.cli }))} onToken={onToken} />
        </>
      )}
    </>
  );
}

function DumbList({ rows, onToken }: { rows: Array<{ token: string; a: number; b: number }>; onToken: (i: number) => void }) {
  return (
    <ul className="ui-drift">
      {rows.map((d) => {
        const i = tokIdx.get(d.token)!;
        return (
          <li key={d.token}>
            <button type="button" className="ui-link tok" onClick={() => onToken(i)} title={tokens[i].label}>{tokens[i].label}</button>
            <Dumbbell a={d.a} b={d.b} />
            <span className="num">{pct(d.a)} → {pct(d.b)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Dumbbell({ a, b }: { a: number; b: number }) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return (
    <svg className="dumbbell" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="100" y1="6" y2="6" className="track" />
      <line x1={lo * 100} x2={hi * 100} y1="6" y2="6" className="span" />
      <circle cx={a * 100} cy="6" r="3.5" className="early" />
      <circle cx={b * 100} cy="6" r="3.5" className="late" />
    </svg>
  );
}

function ModelDetail({ i, onBack, onPage, onToken, onModel, tok }: { i: number; onBack: () => void; onPage: (i: number) => void; onToken: (i: number) => void; onModel: (i: number) => void; tok: number | null }) {
  const m = models[i];
  const tw = twin(i);
  const pair = D.wrapper?.pairs.find((p) => p.model === m.id);
  const mine = pages.map((p, k) => ({ p, k })).filter((e) => e.p.model === i).sort((a, b) => a.p.brief.localeCompare(b.p.brief));
  return (
    <>
      <button type="button" className="ui-link ui-back" onClick={onBack}>All {famName(m.family)} models</button>
      <h2 className="ui-model-h"><BrandIcon brand={brandOf(m.id.startsWith("gemma") ? "gemma" : m.family)} size={16} />{m.name}</h2>
      <p className="ui-meta">
        Released {day(m.released)}{m.date_url ? <> (<a href={m.date_url}>source</a>)</> : null}. {m.pages} pages {hasSecond ? ROUTE_LABEL[m.route] : "measured"}{m.complete ? "" : ", more on the way"}.
        {tw >= 0 ? <> <button type="button" className="ui-link" onClick={() => onModel(tw)}>See its pages {ROUTE_LABEL[models[tw].route]}</button>.</> : null}
      </p>
      {pair && (
        <>
          <h3>Through Claude Code</h3>
          <p className="note ui-note-top">On the {pair.briefs} briefs both routes answered, token shares shift {Math.round(pair.mean_change * 100)} points on average. API (open ring) against Claude Code (filled):</p>
          <DumbList rows={pair.moved.slice(0, 5).map((d) => ({ token: d.token, a: d.api, b: d.cli }))} onToken={onToken} />
        </>
      )}
      <h3>{m.route === PRIMARY ? "Uses far more than the other models" : `Uses far more than the other models (${ROUTE_LABEL[m.route]})`}</h3>
      {m.owns.length ? (
        <table className="ui-owns">
          <thead><tr><th /><td>{short(m)}</td><td>Others</td></tr></thead>
          <tbody>
            {m.owns.slice(0, 10).map((o) => {
              const ti = tokIdx.get(o.token)!;
              return (
                <tr key={o.token} className={tok === ti ? "on" : undefined}>
                  <th><button type="button" className="ui-link tok" onClick={() => onToken(ti)} aria-pressed={tok === ti}>{tokens[ti].label}</button></th>
                  <td className="bars">
                    <span className="bar"><i style={{ width: pct(o.pages / o.of), background: famColor(m.family) }} /></span>
                    <span className="num">{o.pages}/{o.of}</span>
                  </td>
                  <td className="num">{pct(o.others)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="note">No token stands out yet{m.complete ? "" : " (too few pages so far)"}.</p>}
      <h3>Its pages</h3>
      <ul className="ui-pages">
        {mine.map(({ p, k }) => (
          <li key={k}><button type="button" className={`ui-link${tok !== null && p.t.includes(tok) ? " lit" : ""}`} onClick={() => onPage(k)}>{p.brief.replace(/-/g, " ")}</button></li>
        ))}
      </ul>
    </>
  );
}

function PageDetail({ i, onClose, onModel, onToken, tok }: { i: number; onClose: () => void; onModel: (i: number) => void; onToken: (i: number) => void; tok: number | null }) {
  const p = pages[i];
  const m = models[p.model];
  const brief = D.briefs[p.brief];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, [i]);
  const byGroup = [...GROUPS, ["mobile", "Phone"] as [string, string]].map(([g, n]) => ({ g, n, ts: p.t.map((k) => ({ k, t: tokens[k] })).filter((e) => e.t.group === g) })).filter((e) => e.ts.length);
  return (
    <>
      <button ref={closeRef} type="button" className="ui-link ui-back" onClick={onClose}>Close page</button>
      <figure className="ui-shot">
        <img src={BASE + p.view} width={720} height={450} alt={`First screen of the page ${m.name} built for: ${brief?.brief ?? p.brief}`} />
      </figure>
      <h2 className="ui-page-h">{brief?.brief ?? p.brief}</h2>
      <p className="ui-meta">
        Built by <button type="button" className="ui-link" onClick={() => onModel(p.model)}>{m.name}</button>{m.route === "cli" ? " through Claude Code" : " through the API"}, one try, no style hints.
        {p.h1 ? <> Its headline: “{p.h1}”</> : null}
      </p>
      <dl className="ui-tokens">
        {byGroup.map(({ g, n, ts }) => (
          <div key={g}>
            <dt>{n}</dt>
            <dd>
              {ts.map(({ k, t }, j) => (
                <Fragment key={k}>
                  <span className="tk">
                    {g === "tell" ? <Link to={`/tells/${t.id.slice(5)}`}>{t.label}</Link>
                      : <button type="button" className={`ui-link tok${tok === k ? " on" : ""}`} aria-pressed={tok === k} onClick={() => onToken(k)}>{t.label}</button>}
                    {j < ts.length - 1 ? "," : ""}
                  </span>
                  {j < ts.length - 1 ? " " : ""}
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function Tip({ h, cmp }: { h: Hover; cmp: boolean }) {
  const style = { transform: `translate(${Math.min(h.x + 16, window.innerWidth - 340)}px, ${h.y + 16}px)` };
  if (h.kind === "page") {
    const p = pages[h.i], m = models[p.model];
    return (
      <div className="tip ui-tip" style={style} role="status">
        <strong>{D.briefs[p.brief]?.brief ?? p.brief}</strong>
        <span className="ui-tip-sub">{m.name}, {month(m.released)}{hasSecond ? `, ${ROUTE_LABEL[m.route]}` : ""}. Click to open.</span>
      </div>
    );
  }
  if (h.kind === "model") {
    const m = models[h.i];
    return (
      <div className="tip ui-tip" style={style} role="status">
        <strong>{m.name}</strong>
        <span className="ui-tip-sub">Released {day(m.released)}. The average of its {m.pages} pages{hasSecond ? ` ${ROUTE_LABEL[m.route]}` : ""}. Click to light them.</span>
      </div>
    );
  }
  const t = tokens[h.i];
  return (
    <div className="tip ui-tip" style={style} role="status">
      <strong>{t.label}</strong>
      <span className="ui-tip-sub">In {t.pages} of {D.routes?.[PRIMARY]?.pages ?? pages.length} pages. Share of each model’s pages:</span>
      <table>
        <tbody>
          {byRelease.filter((e) => shown(e.i, cmp)).map(({ m, i }) => (
            <tr key={`${m.route}${m.id}`} className={m.route !== PRIMARY ? "weak" : undefined}>
              <th>{short(m)}{m.route !== PRIMARY ? (m.route === "cli" ? ", Claude Code" : ", API") : ""}</th>
              <td className="bar"><i style={{ width: pct(t.share[i]), background: famColor(m.family) }} /></td>
              <td>{pct(t.share[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>{t.group === "tell" ? "A tell shibbo’s checker finds in the page source." : `Token ${t.id}.`} Click to light its pages.</small>
    </div>
  );
}

// the map
type MapProps = { now: number; sel: number | null; open: number | null; tok: number | null; cmp: boolean; fam: string | null; shift: number; groups: Set<string>; insets: { left: number; right: number; top: number; bottom: number }; onHover: (h: Hover | null) => void; onPage: (i: number) => void; onToken: (i: number) => void; onModel: (i: number) => void };

function UiMap(props: MapProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({
    t: zoomIdentity as ZoomTransform, W: 0, H: 0, dpr: 1, base: { k: 1, x: 0, y: 0 }, C: {} as Record<string, string>, raf: 0,
    props, z: null as ZoomBehavior<HTMLCanvasElement, unknown> | null, sprite: null as HTMLImageElement | null, views: new Map<number, HTMLImageElement>(),
    tiles: [] as Array<{ i: number; x: number; y: number; w: number; h: number }>, labels: [] as Array<{ i: number; x0: number; y0: number; x1: number; y1: number }>, anchors: [] as Array<{ i: number; x: number; y: number }>,
    hoverPage: -1,
  });
  st.current.props = props;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      s.C = Object.fromEntries(["--sea", "--ink", "--ink-2", "--ink-3", "--halo", "--sheet", "--rule", "--rule-strong", "--focus", ...FAM_VARS].map((n) => [n, cs.getPropertyValue(n).trim()]));
    };
    const sx = (x: number) => s.t.applyX(s.base.x + x * s.base.k);
    const sy = (y: number) => s.t.applyY(s.base.y - y * s.base.k);
    const fit = () => {
      const { left, right, top, bottom } = s.W > 900 ? FIT : { left: 8, right: 8, top: 8, bottom: 8 };
      // Fit the middle 90% of pages and tokens, plus every model; a few outlying pages may sit past the edge.
      const q = (a: number[], f: number) => { const v = [...a].sort((m, n) => m - n); return v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))]; };
      const main = pages.filter((p) => models[p.model].route === PRIMARY), mm = models.filter((m) => m.route === PRIMARY && m.active !== false);
      const xs = [...main.map((p) => p.x), ...placed.map((e) => e.t.x!)];
      const ys = [...main.map((p) => p.y), ...placed.map((e) => e.t.y!)];
      const mx = mm.map((m) => m.x), my = mm.map((m) => m.y);
      const [x0, x1, y0, y1] = [Math.min(q(xs, 0.05), ...mx), Math.max(q(xs, 0.95), ...mx), Math.min(q(ys, 0.05), ...my), Math.max(q(ys, 0.95), ...my)];
      const w = s.W - left - right - 60, h = s.H - top - bottom - 50;
      const k = Math.min(w / (x1 - x0), h / (y1 - y0));
      s.base = { k, x: left + 30 + (w - k * (x1 - x0)) / 2 - k * x0, y: top + 25 + (h - k * (y1 - y0)) / 2 + k * y1 };
    };
    const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const SERIF = "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif";
    const col = (f: string) => s.C[famVar(f)];
    const curve = (pts: Array<[number, number]>) => {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
      }
    };

    const draw = () => {
      const { sel, open, tok, cmp, fam, groups, insets, now } = s.props;
      // The timeline: a model and its pages appear from its release month on. An undated model always shows.
      const out = (m: UiModel) => !!m.released && ym(m.released) > now;
      const C = s.C;
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.fillStyle = C["--sea"];
      ctx.fillRect(0, 0, s.W, s.H);
      const k = s.t.k;
      // Tiles grow as you zoom in; past ~90 px wide they swap the sprite for the page's own sharper view.
      const tw = Math.min(260, Math.max(22, Math.min(44, s.W * 0.028)) * Math.min(k, 8) ** 0.8), th = tw * 0.625;
      const lit = (p: UiPage, i: number) => (sel === null ? fam === null || models[p.model].family === fam : p.model === sel) && (tok === null || p.t.includes(tok)) || i === open;
      const anyFilter = sel !== null || tok !== null || fam !== null;

      // Trails: each family's model averages in release order; the comparison route's trail is dashed.
      s.anchors = [];
      // A model with only a few pages so far gets no point of its own: its average would mislead.
      const vis = byRelease.filter((e) => shown(e.i, cmp) && (e.m.pages >= 6 || sel === e.i) && !out(e.m));
      for (const route of [SECOND, PRIMARY]) for (const f of famOrder) {
        const seq = vis.filter((e) => e.m.family === f && e.m.route === route && e.m.released);
        const pts = seq.map((e) => [sx(e.m.x), sy(e.m.y)] as [number, number]);
        if (pts.length > 1) {
          ctx.lineCap = "round";
          ctx.globalAlpha = fam !== null && fam !== f ? 0.25 : sel !== null || tok !== null ? 0.45 : route === PRIMARY ? 1 : 0.7;
          ctx.beginPath(); curve(pts); ctx.strokeStyle = C["--halo"]; ctx.lineWidth = 6; ctx.stroke();
          if (route !== PRIMARY) ctx.setLineDash([5, 5]);
          ctx.beginPath(); curve(pts); ctx.strokeStyle = col(f); ctx.lineWidth = route === PRIMARY ? 2 : 1.5; ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
      // With the comparison route on, a thin line joins each model's two points: the shift the wrapper causes.
      if (cmp) for (const e of vis) {
        if (e.m.route !== SECOND) continue;
        const j = twin(e.i);
        if (j < 0) continue;
        ctx.beginPath(); ctx.moveTo(sx(e.m.x), sy(e.m.y)); ctx.lineTo(sx(models[j].x), sy(models[j].y));
        ctx.strokeStyle = C["--ink-2"]; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
      }

      // Pages: faded ones first, lit ones over them, the hovered and opened ones last.
      const order = pages.map((p, i) => ({ p, i, on: lit(p, i) })).filter((e) => (shown(e.p.model, cmp) && !out(models[e.p.model])) || e.i === open).sort((a, b) => Number(a.on) - Number(b.on));
      s.tiles = [];
      const sp = s.sprite;
      for (const { p, i, on } of order) {
        if (i === s.hoverPage || i === open) continue;
        const x = sx(p.x) - tw / 2, y = sy(p.y) - th / 2;
        if (x > s.W || y > s.H || x + tw < 0 || y + th < 0) continue;
        ctx.globalAlpha = on ? 1 : anyFilter ? 0.12 : 1;
        drawTile(p, i, x, y, tw, th, sp, on && anyFilter, models[p.model].route !== PRIMARY);
        s.tiles.push({ i, x, y, w: tw, h: th });
      }
      ctx.globalAlpha = 1;
      // Keep the title block readable: veil the tiles that stray under it.
      const cart = canvas.parentElement?.querySelector<HTMLElement>(".cartouche");
      if (cart && getComputedStyle(cart).position === "absolute") {
        const r = cart.getBoundingClientRect(), c = canvas.getBoundingClientRect();
        // The veil thins out to the right and below, so it has no edge.
        const x0 = r.left - c.left - 12, y0 = r.top - c.top - 12, w = r.width + 80, h = r.height + 70;
        const sea = C["--sea"];
        // clear is clear black and would smear grey; fade to the sea's own colour at zero alpha.
        const hex = /^#([0-9a-f]{6})$/i.exec(sea)?.[1];
        const clear = hex ? `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, 0)` : sea;
        const gx = ctx.createLinearGradient(x0, 0, x0 + w, 0);
        gx.addColorStop(0, sea); gx.addColorStop(0.55, sea); gx.addColorStop(1, clear);
        ctx.save();
        ctx.globalAlpha = 0.9; ctx.fillStyle = gx; ctx.fillRect(x0, y0, w, h - 70);
        const gy = ctx.createLinearGradient(0, y0 + h - 70, 0, y0 + h);
        gy.addColorStop(0, sea); gy.addColorStop(1, clear);
        ctx.beginPath(); ctx.rect(x0, y0 + h - 70, w * 0.6, 70); ctx.fillStyle = gy; ctx.fill();
        ctx.restore();
      }

      // Labels, placed without collisions: models first, then tokens by how sharply they split the models.
      const boxes: Array<[number, number, number, number]> = [];
      const fits = (x: number, y: number, w: number, above: number, below: number, force = false) => {
        const t = y - above, b = y + below;
        // Forced labels may overlap others but never leave the map.
        if (x < insets.left + 4 || t < (force ? 4 : insets.top + 4) || x + w > s.W - insets.right - 4 || b > s.H - insets.bottom - 4) return false;
        if (!force) for (const [a, bb, c, d] of boxes) if (x < c && x + w > a && t < d && b > bb) return false;
        boxes.push([x - 2, t - 2, x + w + 2, b + 2]);
        return true;
      };
      for (const { m, i } of vis) {
        const x = sx(m.x), y = sy(m.y), on = sel === null || sel === i;
        ctx.globalAlpha = on ? 1 : 0.4;
        ctx.beginPath(); ctx.arc(x, y, sel === i ? 8 : 6, 0, 7);
        if (m.route === PRIMARY) { ctx.fillStyle = col(m.family); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C["--sheet"]; ctx.stroke(); }
        else { ctx.fillStyle = C["--sheet"]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col(m.family); ctx.stroke(); }
        if (sel === i) { ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.strokeStyle = C["--ink"]; ctx.lineWidth = 1.5; ctx.stroke(); }
        s.anchors.push({ i, x, y });
        boxes.push([x - 9, y - 9, x + 9, y + 9]);
        ctx.globalAlpha = 1;
      }
      // Names for the main route; the comparison route's hollow points get a name only when chosen.
      for (const { m, i } of vis) {
        if (m.route !== PRIMARY && sel !== i) continue;
        const x = sx(m.x), y = sy(m.y), on = sel === null ? fam === null || m.family === fam : sel === i;
        if (!on && fam !== null) continue;
        const name = short(m), sub = m.route === PRIMARY ? month(m.released) : ROUTE_LABEL[m.route];
        ctx.font = `${sel === i ? 700 : 600} 13.5px ${SANS}`;
        const w = Math.max(ctx.measureText(name).width, 60);
        const spots: Array<[number, number]> = [[x + 12, y - 2], [x - 12 - w, y - 2], [x - w / 2, y - 16], [x - w / 2, y + 26], [x + 12, y + 18], [x - 12 - w, y + 18], [x + 12, y - 22], [x - 12 - w, y - 22]];
        let spot = spots.find(([a, b]) => fits(a, b, w, 12, 15));
        // Crowded: move off the dot, tied by a leader; failing that, leave the name to hover and the list (unless chosen).
        if (!spot) for (const d of [34, 52, 74, 98]) {
          for (let a = 0; a < 12 && !spot; a++) {
            const ang = (a / 12) * Math.PI * 2, lx = x + Math.cos(ang) * d, ly = y + Math.sin(ang) * d * 0.75;
            const cand: [number, number] = [Math.cos(ang) < 0 ? lx - w : lx, ly];
            if (fits(cand[0], cand[1], w, 12, 15)) spot = cand;
          }
          if (spot) {
            const ex = Math.min(Math.max(x, spot[0]), spot[0] + w), ey = spot[1] - 4;
            ctx.globalAlpha = on ? 0.7 : 0.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey);
            ctx.strokeStyle = C["--ink-3"]; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
            break;
          }
        }
        if (!spot) {
          if (sel !== i) continue;
          fits(spots[0][0], spots[0][1], w, 12, 15, true); spot = spots[0];
        }
        ctx.globalAlpha = on ? 1 : 0.45;
        ctx.lineWidth = 4; ctx.strokeStyle = C["--halo"]; ctx.lineJoin = "round";
        ctx.strokeText(name, spot[0], spot[1]); ctx.fillStyle = C["--ink"]; ctx.fillText(name, spot[0], spot[1]);
        ctx.font = `11px ${SANS}`;
        ctx.lineWidth = 3; ctx.strokeText(sub, spot[0], spot[1] + 13); ctx.fillStyle = C["--ink-2"]; ctx.fillText(sub, spot[0], spot[1] + 13);
        ctx.globalAlpha = 1;
      }
      const owned = new Set(sel !== null ? models[sel].owns.map((o) => tokIdx.get(o.token)!) : []);
      const mainIdx = models.map((m, i) => (m.route === PRIMARY ? i : -1)).filter((i) => i >= 0);
      const spread = (t: UiToken) => Math.max(...mainIdx.map((i) => t.share[i])) - Math.min(...mainIdx.map((i) => t.share[i]));
      const rank = (e: (typeof placed)[number]) => (e.i === tok ? 100 : 0) + (owned.has(e.i) ? 50 : 0) + spread(e.t) * 4 + Math.log2(e.t.pages);
      const budget = Math.round(10 * Math.min(1, s.W / 1000) * Math.min(k, 6) ** 1.6);
      const cands = placed.filter((e) => groups.has(e.t.group) || e.i === tok || owned.has(e.i)).sort((a, b) => rank(b) - rank(a));
      s.labels = [];
      let n = 0;
      for (const e of cands) {
        const must = e.i === tok || owned.has(e.i);
        if (n >= budget && !must) continue;
        const px = sx(e.t.x!), py = sy(e.t.y!);
        const tell = e.t.group === "tell";
        const size = must ? 14 : Math.round(11.5 + Math.min(spread(e.t), 0.8) * 4);
        ctx.font = tell ? `italic ${must ? 600 : 400} ${size + 1}px ${SERIF}` : `${must ? 700 : 500} ${size}px ${SANS}`;
        const w = ctx.measureText(e.t.label).width;
        const spots: Array<[number, number]> = [[px + 6, py + 4], [px - 6 - w, py + 4], [px - w / 2, py - 6], [px - w / 2, py + size + 4]];
        // Labels that must show (the lit token, the chosen model's own) may move off their dot, tied by a leader.
        if (must) for (const d of [18, 32, 48, 66]) for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2, ox = Math.cos(ang) * d, oy = Math.sin(ang) * d * 0.8;
          spots.push([px + ox - (ox < 0 ? w : 0), py + oy + 4]);
        }
        const spot = spots.find(([a, b]) => fits(a, b, w, size - 2, 3)) ?? (must && fits(spots[0][0], spots[0][1], w, size - 2, 3, true) ? spots[0] : null);
        if (!spot) continue;
        if (Math.hypot(spot[0] - px, spot[1] - 4 - py) > 14 && Math.hypot(spot[0] + w - px, spot[1] - 4 - py) > 14) {
          const ex = Math.max(spot[0], Math.min(px, spot[0] + w)), ey = spot[1] - size / 2 + 1;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.strokeStyle = C["--ink-3"]; ctx.lineWidth = 1; ctx.stroke();
        }
        const dim = sel !== null && !must ? 0.45 : 1;
        ctx.globalAlpha = dim;
        ctx.beginPath(); ctx.arc(px, py, must ? 3 : 2, 0, 7); ctx.fillStyle = must ? C["--ink"] : C["--ink-2"]; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = C["--halo"]; ctx.lineJoin = "round";
        ctx.strokeText(e.t.label, spot[0], spot[1]);
        ctx.fillStyle = must ? C["--ink"] : C["--ink-2"]; ctx.fillText(e.t.label, spot[0], spot[1]);
        if (e.i === tok) { ctx.fillRect(spot[0], spot[1] + 3, w, 1.5); }
        ctx.globalAlpha = 1;
        s.labels.push({ i: e.i, x0: Math.min(spot[0], px - 4), y0: spot[1] - size, x1: spot[0] + w, y1: spot[1] + 4 });
        n++;
      }
      // The opened and hovered pages sit on top of everything, at a size you can read.
      for (const i of [open, s.hoverPage]) {
        if (i === null || i < 0) continue;
        const p = pages[i];
        const w = Math.max(tw, 168), h = w * 0.625;
        const x = Math.min(s.W - w - 4, Math.max(4, sx(p.x) - w / 2)), y = Math.min(s.H - h - 4, Math.max(4, sy(p.y) - h / 2));
        ctx.fillStyle = C["--sheet"]; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
        drawTile(p, i, x, y, w, h, s.sprite, true);
        ctx.strokeStyle = C["--ink"]; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
        s.tiles.push({ i, x, y, w, h });
      }
    };
    const drawTile = (p: UiPage, i: number, x: number, y: number, w: number, h: number, sp: HTMLImageElement | null, ring: boolean, dashed = false) => {
      const C = s.C;
      const view = w > 90 ? s.views.get(i) : undefined;
      if (w > 90 && !s.views.has(i)) {
        const im = new Image();
        s.views.set(i, im);
        im.onload = () => schedule();
        im.src = BASE + p.view;
      }
      if (view && view.complete && view.naturalWidth) ctx.drawImage(view, x, y, w, h);
      else if (sp && sp.complete && sp.naturalWidth) {
        const { w: TW, h: TH, cols } = D.sprite;
        ctx.drawImage(sp, (p.sprite % cols) * TW, Math.floor(p.sprite / cols) * TH, TW, TH, x, y, w, h);
      } else { ctx.fillStyle = p.ground ?? C["--sheet"]; ctx.fillRect(x, y, w, h); }
      ctx.lineWidth = ring ? 1.5 : 1;
      ctx.strokeStyle = ring ? C["--ink"] : dashed ? C["--ink-2"] : C["--rule-strong"];
      if (dashed) ctx.setLineDash([3, 2]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
    };
    const schedule = () => { if (!s.raf) s.raf = requestAnimationFrame(() => { s.raf = 0; draw(); }); };
    (canvas as HTMLCanvasElement & { __draw?: () => void }).__draw = schedule;
    (canvas as HTMLCanvasElement & { __refit?: () => void }).__refit = () => { fit(); schedule(); };

    const sprite = new Image();
    sprite.onload = schedule;
    sprite.src = BASE + D.sprite.src;
    s.sprite = sprite;

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
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const mo = new MutationObserver(() => { readColors(); schedule(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const hit = (mx: number, my: number): Hover | null => {
      for (const a of s.anchors) if (Math.hypot(a.x - mx, a.y - my) <= 10) return { kind: "model", i: a.i, x: mx, y: my };
      for (let j = s.tiles.length - 1; j >= 0; j--) {
        const t = s.tiles[j];
        if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) {
          const { sel, tok, open } = s.props;
          const p = pages[t.i];
          const on = (sel === null || p.model === sel) && (tok === null || p.t.includes(tok)) || t.i === open;
          if (on || (sel === null && tok === null)) return { kind: "page", i: t.i, x: mx, y: my };
        }
      }
      for (const l of s.labels) if (mx >= l.x0 && mx <= l.x1 && my >= l.y0 && my <= l.y1) return { kind: "token", i: l.i, x: mx, y: my };
      return null;
    };
    const pos = (ev: MouseEvent) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const onMove = (ev: MouseEvent) => {
      const [mx, my] = pos(ev);
      const h = hit(mx, my);
      canvas.style.cursor = h ? "pointer" : "grab";
      const hp = h?.kind === "page" ? h.i : -1;
      if (hp !== s.hoverPage) { s.hoverPage = hp; schedule(); }
      s.props.onHover(h);
    };
    const onLeave = () => { s.props.onHover(null); if (s.hoverPage !== -1) { s.hoverPage = -1; schedule(); } };
    const onClick = (ev: MouseEvent) => {
      const [mx, my] = pos(ev);
      const h = hit(mx, my);
      if (!h) return;
      if (h.kind === "page") s.props.onPage(h.i);
      else if (h.kind === "model") s.props.onModel(h.i);
      else s.props.onToken(h.i);
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    document.fonts?.ready.then(schedule);
    return () => { ro.disconnect(); mo.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); canvas.removeEventListener("click", onClick); cancelAnimationFrame(s.raf); s.raf = 0; select(canvas).on(".zoom", null); };
  }, []);

  useEffect(() => { (ref.current as HTMLCanvasElement & { __draw?: () => void })?.__draw?.(); }, [props.sel, props.open, props.tok, props.cmp, props.fam, props.groups, props.insets.right, props.now]);
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
  const summary = useMemo(() => byRelease.map(({ m }) => `${m.name} (${month(m.released)})`).join(", "), []);
  return (
    <>
      <canvas ref={ref} role="img" aria-label={`Map of ${pages.length} one-shot web pages, each placed among the design choices it makes, with the models that built them: ${summary}. The panel lists the same models, their pages and the choices each favours.`} />
      <div className="zoom-controls ui-zoom" role="group" aria-label="Map zoom">
        <button className="btn icon" type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in" title="Zoom in (or scroll up over the map)">+</button>
        <button className="btn icon" type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" title="Zoom out (or scroll down over the map)">−</button>
        <button className="btn icon" type="button" onClick={fitView} aria-label="Fit the whole map" title="Fit the whole map">⤢</button>
      </div>
    </>
  );
}
