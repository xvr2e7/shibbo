import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { BrandIcon, brandOf } from "../components/BrandIcon";
import { famBrand, famColor, famName } from "../components/families";
import { Link, useSearchParams } from "react-router-dom";
import { AtlasMap, FAMS as MAP_FAMS, models as mapModels, phraseCounts, state, type Hover, type Layers } from "../components/AtlasMap";
import { Timeline, TIME, NOW } from "../components/Timeline";
import { data, tellById, ym, familyColor, label, type Habit } from "../data";
import { LayerStack, LayerSections } from "../components/LayerStack";
import { LayerAtlas, Measuring } from "../components/LayerAtlas";
import { STACK, LAYER_NAME, codeLayer, conductLayer } from "../components/layerData";
import { isLayer, type LayerId } from "../components/layers";
import "../styles/atlas-switch.css";

const loadInterface = () => import("../components/InterfaceAtlas");
const InterfaceAtlas = lazy(loadInterface);
type View = "stack" | LayerId;

/** The flat-view tabs: back to the stack, or straight to any one layer's map. Unmeasured layers open their "measuring now" state. */
function LayerSwitch({ layer, setLayer, onStack }: { layer: LayerId; setLayer: (l: LayerId) => void; onStack: () => void }) {
  const missing = STACK.filter((l) => (l === "code" && !codeLayer) || (l === "conduct" && !conductLayer));
  return (
    <div className="layer-switch" role="group" aria-label="Atlas layer">
      <button type="button" className="to-stack" onClick={onStack}>All layers</button>
      {STACK.map((l) => (
        <button key={l} type="button" aria-pressed={layer === l} onClick={() => setLayer(l)}>{LAYER_NAME[l]}</button>
      ))}
      {missing.length > 0 && <span className="later">{missing.map((l) => LAYER_NAME[l]).join(" and ")} {missing.length > 1 ? "are" : "is"} being measured now.</span>}
    </div>
  );
}

/** The layer a visitor last opened, so the way back folds that sheet into the stack. Not part of the URL. */
let lastFlat: LayerId | null = null;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Change the view with a cross-fade from the old screen to the new, where the browser can. */
function fade(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || reduced()) change();
  else doc.startViewTransition(() => flushSync(change));
}

function initialMonth() {
  const m = /t=(\d{4})-(\d{2})/.exec(location.hash);
  return m ? Math.min(NOW, Math.max(TIME.START, ym(`${m[1]}-${m[2]}`))) : NOW;
}
/** Playback speed in months per second: about 20 seconds from ChatGPT to today. */
const SPEED = 2.4;

export function AtlasPage() {
  const [params, setParams] = useSearchParams();
  // No layer in the URL: the stack. ?layer=…: that layer flat. Old prose links (?t=, ?focus=) still open the prose map.
  const asked = params.get("layer");
  const view: View = isLayer(asked) && STACK.includes(asked) ? asked : params.get("view") !== "stack" && (params.has("focus") || params.has("t")) ? "prose" : "stack";
  const layer: LayerId = view === "stack" ? "prose" : view;
  const setLayer = (l: LayerId) => fade(() => setParams((p) => { const n = new URLSearchParams(p); n.delete("view"); n.set("layer", l); if (l !== "prose") { n.delete("focus"); n.delete("t"); } return n; }, { replace: true }));
  const openLayer = (l: LayerId) => fade(() => setParams(new URLSearchParams({ layer: l })));
  const toStack = () => { lastFlat = layer; fade(() => setParams(new URLSearchParams({ view: "stack" }))); };
  // Fetch the interface map early, so opening it never shows an empty frame.
  useEffect(() => { void loadInterface(); }, []);
  const [narrow, setNarrow] = useState(window.innerWidth < 760);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 760);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  useEffect(() => { lastFlat = view === "stack" ? null : view; }, [view]);
  // t is continuous (fractional months) so playback glides; month is the whole month the notes and labels use.
  const [t, setT] = useState(initialMonth);
  const month = Math.floor(t);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [layers, setLayers] = useState<Layers>({ words: true, habits: true });
  const reset = 0;
  const [wide, setWide] = useState(window.innerWidth > 900);
  const raf = useRef(0);

  useEffect(() => {
    const on = () => setWide(window.innerWidth > 900);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let last = 0;
    const speed = reduced() ? 1 : SPEED;
    const tick = (now: number) => {
      const dt = last ? Math.min(100, now - last) / 1000 : 0;
      last = now;
      let done = false;
      setT((x) => {
        const n = x + dt * speed;
        if (n >= NOW) { done = true; return NOW; }
        return n;
      });
      if (done) setPlaying(false);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || !document.querySelector(".timeline")) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, button, a, [contenteditable]")) return;
      e.preventDefault();
      setPlaying((p) => { if (!p) setT((x) => (x >= NOW ? TIME.START : x)); return !p; });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const play = () => {
    if (!playing && t >= NOW) setT(TIME.START);
    setPlaying(!playing);
  };
  const scrub = (m: number) => { setPlaying(false); setT(m); };

  const insets = wide ? { left: 380, right: 360, top: 16, bottom: 330 } : { left: 4, right: 4, top: 4, bottom: 4 };

  const title = <h1 id="atlas-h">What gives a model away</h1>;
  const tabs = <LayerSwitch layer={layer} setLayer={setLayer} onStack={toStack} />;
  const flatHeader = <><h1 id="atlas-h">What gives a model away</h1>{tabs}</>;
  const timeline = <Timeline month={month} t={t} setMonth={scrub} playing={playing} onPlay={play} onReset={() => { setPlaying(false); setT(NOW); }} />;
  let atlas: ReactNode;
  if (view === "stack") {
    atlas = narrow ? <LayerSections onOpen={openLayer} header={title} /> : <LayerStack key="stack" onOpen={openLayer} from={lastFlat} header={title} />;
  } else if (view === "interface") {
    atlas = (
      <Suspense fallback={<section className="atlas" aria-busy="true" />}>
        <InterfaceAtlas header={flatHeader} month={month} footer={timeline} />
      </Suspense>
    );
  } else if (view === "code" || view === "conduct") {
    const L = view === "code" ? codeLayer : conductLayer;
    atlas = L ? <LayerAtlas key={view} layer={L} header={flatHeader} month={month} footer={timeline} /> : <Measuring layer={view} header={flatHeader} />;
  } else {
    atlas = (
      <section className="atlas atlas-prose" aria-labelledby="atlas-h">
        <AtlasMap focus={params.get("focus")} month={reduced() ? month : t} onHover={setHover} insets={insets} resetSignal={reset} layers={layers} />
        <div className="cartouche">
          {title}
          {tabs}
          <Legend layers={layers} setLayers={setLayers} />
        </div>
        <Closest month={month} />
        {hover?.d && <Tip hover={hover} month={month} />}
        {hover?.habit && <HabitTip habit={hover.habit} x={hover.x} y={hover.y} month={month} />}

        {timeline}
      </section>
    );
  }
  return <div key={view}>{atlas}</div>;
}

/** Layer switches double as the legend; the full key unfolds on hover or focus. */
function Legend({ layers, setLayers }: { layers: Layers; setLayers: (l: Layers) => void }) {
  return (
    <div className="legend">
      <div className="legend-row" role="group" aria-label="Map layers">
        <button type="button" className="layer" aria-pressed={layers.words} onClick={() => setLayers({ ...layers, words: !layers.words })}>
          <span className="swatch land" aria-hidden="true" />Words
        </button>
        <button type="button" className="layer" aria-pressed={layers.habits} onClick={() => setLayers({ ...layers, habits: !layers.habits })}>
          <span className="swatch habit" aria-hidden="true" />Habits
        </button>
      </div>
      <ul className="fams" aria-label="Model families">
        {MAP_FAMS.map((f) => (
          <li key={f}><span className="swatch" style={{ background: famColor(f) }} />{famBrand(f) ? <BrandIcon brand={famBrand(f)} size={12} /> : <span className="no-icon" />}{f === "meta" ? "Llama" : famName(f)}</li>
        ))}
      </ul>
      <div className="legend-more">
        <ul className="key" aria-label="Map key">
          <li><span className="swatch land" />Phrases current models use 4× or more as often as people</li>
          <li><span className="swatch shore" />Phrases people use 4× or more as often as current models</li>
          <li><span className="swatch habit" />Habits, such as em dashes or hedges</li>
          <li><span className="swatch fossil" />Dropped by a newer release</li>
        </ul>
      </div>
    </div>
  );
}

/** Tell density for each current release, beside human writers on the same topics. Rows reorder as the timeline moves. */
type Density = { model: number; human: number; source: string };
const per1k = ((data as unknown as { per1k?: Record<string, Density> }).per1k ?? {}) as Record<string, Density>;
const SCALE = Math.ceil(Math.max(10, ...Object.values(per1k).map((d) => d.model)) / 10) * 10; // fixed for the whole timeline
const ROW = 28;
const fmt1k = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());
function Closest({ month }: { month: number }) {
  const ranked = useMemo(() => {
    const { current } = state(month);
    return [...current.values()].filter((m) => per1k[m.id]).sort((a, b) => per1k[a.id].model - per1k[b.id].model);
  }, [month]);
  // Human baseline from the same source as the models shown (web articles for 2025–26, RAID texts for 2022–23).
  const humans = [...new Map(ranked.map((m) => [per1k[m.id].source, per1k[m.id].human])).entries()];
  const rows = humans.length;
  return (
    <aside className="plate closest" aria-labelledby="closest-h">
      <h2 id="closest-h">Tell points per 1,000 words</h2>
      {ranked.length ? (
        <ol style={{ height: (ranked.length + rows) * ROW }}>
          {humans.map(([src, h], i) => (
            <li key={src} className="human" data-in style={{ transform: `translateY(${i * ROW}px)` }}>
              <span className="who"><span className="people-mark" aria-hidden="true" /><span className="name" title={src === "raid" ? "People, the 2022–23 RAID texts" : src === "graphite" ? "People, Graphite's topics" : "People, the topics shibbo ran"}>{rows > 1 ? (src === "raid" ? "People, RAID" : src === "graphite" ? "People, Graphite" : "People, shibbo") : "Human writers"}</span></span>
              <span className="bar"><i style={{ width: `${(h / SCALE) * 100}%`, background: "var(--ink)" }} /></span>
              <span className="num">{fmt1k(h)}</span>
            </li>
          ))}
          {mapModels.map((m) => {
            const r = ranked.indexOf(m);
            const d = per1k[m.id];
            if (!d) return null;
            return (
              <li key={m.id} data-in={r >= 0 || undefined} aria-hidden={r < 0 || undefined} style={{ transform: `translateY(${(r < 0 ? ranked.length + rows : r + rows) * ROW}px)` }}>
                <Link className="who" to={`/models/${m.id}`} title={m.name} tabIndex={r < 0 ? -1 : undefined}><BrandIcon brand={brandOf(m.family)} size={13} /><span className="name">{m.name}</span></Link>
                <span className="bar"><i style={{ width: `${(d.model / SCALE) * 100}%`, background: familyColor(m.family) }} /></span>
                <span className="num">{fmt1k(d.model)}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">No measured model yet. The first arrives in late 2022.</p>
      )}
      <p className="note">Average per text, scored by shibbo’s checker. The 2022–23 rows use a phrase list built from 2025–26 models, so they run low.</p>
    </aside>
  );
}

function HabitTip({ habit, x, y, month }: { habit: Habit; x: number; y: number; month: number }) {
  const t = habit.tell ? tellById.get(habit.tell) : null;
  const rows = mapModels.filter((m) => habit.models[m.id]);
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
  return (
    <div className="tip" style={{ transform: `translate(${Math.min(x + 16, window.innerWidth - 340)}px, ${y + 16}px)` }} role="status">
      <span className="specimen">{habit.glyph} {habit.label}</span>
      {habit.what}. Humans average {fmt(habit.human)} {habit.unit}.
      <table>
        <tbody>
          {rows.map((m) => {
            const v = habit.models[m.id];
            const e = v.d * habit.sign;
            return (
              <tr key={m.id} className={ym(m.released) > month ? "later" : undefined}>
                <th>{m.name}</th>
                <td className="bar"><i style={{ width: `${Math.min(100, Math.abs(e) * 50)}%`, background: e > 0 ? familyColor(m.family) : "var(--ink-3)" }} /></td>
                <td>{fmt(v.mean)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small>Bars show effect size against human (Cohen’s d); grey means humans do more. Source: Graphite, AI Tells (2026).{t ? " Click for the related tell." : ""}</small>
    </div>
  );
}

function Tip({ hover, month }: { hover: Hover; month: number }) {
  const d = hover.d!;
  // Keep the whole table on screen: measure it, then clamp it inside the window.
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ h: 0, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setBox({ h: el.offsetHeight, top: (el.offsetParent as HTMLElement | null)?.getBoundingClientRect().top ?? 0 });
  }, [d]);
  const y = Math.max(8, Math.min(hover.y + 16, window.innerHeight - box.top - box.h - 8));
  const pos = { transform: `translate(${Math.min(hover.x + 16, window.innerWidth - 400)}px, ${y}px)` };
  const t = d.tell ? tellById.get(d.tell) : null;
  const fmt = (n: number) => n.toLocaleString("en");
  const times = (r: number) => (r >= 100 ? fmt(Math.round(r)) : r >= 10 ? r.toFixed(0) : r.toFixed(1));
  const g = mapModels.filter((m) => m.source === "graphite").length;
  const hc = phraseCounts(d, 0);
  return (
    <div ref={ref} className="tip wide" style={pos} role="status">
      <span className="specimen">“{d.term.replace(/ _ /g, " … ")}”</span>
      {d.under ? "People use this far more than current models do." : t ? `Part of the tell “${label(t)}”.` : "Measured phrase."}
      <table>
        <thead>
          <tr><th /><td className="bar" /><td>uses</td><td>articles</td><td>vs people</td></tr>
        </thead>
        <tbody>
          <tr className="people">
            <th>People</th>
            <td className="bar" />
            <td>{fmt(hc.human)}</td>
            <td>{fmt(hc.humanDocs!)}</td>
            <td />
          </tr>
          {mapModels.map((m, i) => {
            const v = d.v[i];
            const c = phraseCounts(d, i);
            const own = (d.own >> i) & 1;
            const rel = v === null ? "too few" : Math.abs(v) < 0.2 ? "≈" : v > 0 ? (c.human === 0 ? "people 0" : `${times(2 ** v)}×`) : c.model === 0 ? "never" : `÷${times(2 ** -v)}`;
            return (
              <tr key={m.id} className={[ym(m.released) > month ? "later" : "", own ? "" : "weak", i === g ? "split" : ""].join(" ").trim() || undefined}>
                <th>{m.name}</th>
                <td className="bar"><i style={{ width: `${v === null ? 0 : Math.min(100, (Math.abs(v) / 10) * 100)}%`, background: v !== null && v > 0 ? familyColor(m.family) : undefined }} /></td>
                <td>{fmt(c.model)}</td>
                <td>{c.modelDocs !== null ? fmt(c.modelDocs) : ""}</td>
                <td>{rel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small>
        Counted by shibbo against people writing on the same topics: Graphite’s articles for 2025–26 models, RAID for 2022–23 (people’s counts differ there). ÷ means people use it that many times more. Faded rows miss 4×, the significance test or 40 articles. {d.tell ? "Click for the full entry." : ""}
      </small>
    </div>
  );
}
