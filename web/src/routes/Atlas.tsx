import { useEffect, useMemo, useRef, useState } from "react";
import { Cite } from "../components/Cite";
import { BrandIcon, brandOf } from "../components/BrandIcon";
import { Link } from "react-router-dom";
import { AtlasMap, models as mapModels, state, type Hover, type Layers } from "../components/AtlasMap";
import { Timeline, TIME, NOW } from "../components/Timeline";
import { Strip } from "../components/Strip";
import { data, tellById, ym, familyColor, label, type Habit } from "../data";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function initialMonth() {
  const m = /t=(\d{4})-(\d{2})/.exec(location.hash);
  return m ? Math.min(NOW, Math.max(TIME.START, ym(`${m[1]}-${m[2]}`))) : NOW;
}
/** Playback speed in months per second: about 20 seconds from ChatGPT to today. */
const SPEED = 2.4;

export function AtlasPage() {
  // t is continuous (fractional months) so playback glides; month is the whole month the notes and labels use.
  const [t, setT] = useState(initialMonth);
  const month = Math.floor(t);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [layers, setLayers] = useState<Layers>({ words: true, habits: true });
  // Easter egg: clicking the title opens a note on the dialect atlases this map descends from.
  const [note, setNote] = useState<number | null>(null);
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
      if (e.code !== "Space" || e.repeat) return;
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

  return (
    <>
      <section className="atlas" aria-labelledby="atlas-h">
        <AtlasMap focus={new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus")} month={reduced() ? month : t} onHover={setHover} insets={insets} resetSignal={reset} layers={layers} />
        <div className="cartouche">
          <h1 id="atlas-h">
            <button type="button" className="title-egg" aria-expanded={note !== null} onClick={() => setNote((n) => (n === null ? 0 : (n + 1) % NOTES.length))}>What gives a model away</button>
            <SourcesMark />
          </h1>
          <Legend layers={layers} setLayers={setLayers} />
          {note !== null && <Lineage i={note} setI={setNote} onClose={() => setNote(null)} />}
        </div>
        <Closest month={month} />
        {hover?.d && <Tip hover={hover} month={month} />}
        {hover?.habit && <HabitTip habit={hover.habit} x={hover.x} y={hover.y} month={month} />}

        <Timeline month={month} t={t} setMonth={scrub} playing={playing} onPlay={play} onReset={() => { setPlaying(false); setT(NOW); }} />
      </section>

      <div className="page">
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="spec-h">
          <h2 id="spec-h">Five specimens</h2>
          <p className="lede">Each row places one tell for every measured model, on either side of the human rate.</p>
          <Specimens />
        </section>

        <section className="section" aria-labelledby="use-h">
          <h2 id="use-h">Check your own writing</h2>
          <div className="install">
            <p className="lede">The same records drive a checker. It scores a draft, names each tell with its fix, and ranks the rules by what your model over-uses.</p>
            <div>
              <pre><code>{`npx shibbo check README.md --model claude-opus-5
npx shibbo rules --model gpt-6`}</code></pre>
              <p style={{ marginTop: "var(--s4)" }}>
                <Link className="btn primary" to="/docs/guide/quick-start">Read the docs</Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

const FAMILY_KEY: Array<[string, string, string]> = [["gpt", "openai", "OpenAI"], ["claude", "anthropic", "Claude"], ["gemini", "google", "Gemini"], ["meta", "meta", "Llama"], ["mistral", "mistral", "Mistral"], ["mosaic", "", "MPT"], ["cohere", "cohere", "Cohere"]];

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
        <span className="fam-dots" aria-hidden="true">
          {FAMILY_KEY.map(([f]) => <i key={f} style={{ background: `var(--${f})` }} />)}
        </span>
      </div>
      <div className="legend-more">
        <ul className="key" aria-label="Map key">
          <li><span className="swatch land" />Phrases current models over-use</li>
          <li><span className="swatch shore" />Phrases humans use and models avoid</li>
          <li><span className="swatch habit" />Habits, such as em dashes or hedges</li>
          <li><span className="swatch fossil" />Dropped by a newer release</li>
          <li className="fams">
            {FAMILY_KEY.map(([f, b, n]) => (
              <span key={f} className="fam"><span className="swatch" style={{ background: `var(--${f})` }} />{b && <BrandIcon brand={b} size={11} />}{n}</span>
            ))}
          </li>
        </ul>
      </div>
    </div>
  );
}

/** Where the map comes from: dialect atlases and authorship studies. One note at a time; the reader steps through. */
const NOTES: Array<{ text: React.ReactNode; cite: { title: string; url: string } }> = [
  {
    text: <>In 1876, Georg Wenker sent forty sentences to schoolteachers across Germany and asked them to write each one in the local dialect. Mapping the answers gave the first dialect atlas. This map runs the same test on machines: humans and models write on the same topics, and the phrases that split them become the land.</>,
    cite: { title: "Georg Wenker, Sprachatlas des Deutschen Reichs", url: "https://en.wikipedia.org/wiki/Georg_Wenker" },
  },
  {
    text: <>Dialect maps draw isoglosses, the lines where one word gives way to another. August Bielenstein coined the term in 1892. The hatched shore here marks one such line: past it lie the phrases humans keep and models drop.</>,
    cite: { title: "Isogloss", url: "https://en.wikipedia.org/wiki/Isogloss" },
  },
  {
    text: <>For the Atlas linguistique de la France, Edmond Edmont spent four years travelling to 639 places and writing down how each one spoke. The data behind this map comes from 9,984 topics instead, each written once by a human and once by each model.</>,
    cite: { title: "Atlas linguistique de la France (1902–1910)", url: "https://en.wikipedia.org/wiki/Atlas_linguistique_de_la_France" },
  },
  {
    text: <>In 1964, Frederick Mosteller and David Wallace settled who wrote twelve disputed Federalist Papers by counting small words. Hamilton wrote “upon” about three times per thousand words; Madison almost never did. Shibbo counts tells the same way.</>,
    cite: { title: "Mosteller and Wallace, Inference and Disputed Authorship: The Federalist (1964)", url: "https://en.wikipedia.org/wiki/The_Federalist_Papers#Authorship" },
  },
];
function Lineage({ i, setI, onClose }: { i: number; setI: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const el = e.target as Element;
      if (!ref.current?.contains(el) && !el.closest(".title-egg")) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [onClose]);
  const n = NOTES[i];
  return (
    <figure ref={ref} className="lineage" role="note" aria-label="A note on dialect atlases">
      <blockquote key={i}>
        <p>{n.text}</p>
      </blockquote>
      <figcaption>
        <a href={n.cite.url}>{n.cite.title}</a>
        <button type="button" className="next-note" onClick={() => setI((i + 1) % NOTES.length)} aria-label={`Next note, ${((i + 1) % NOTES.length) + 1} of ${NOTES.length}`}>
          {i + 1} of {NOTES.length}
        </button>
      </figcaption>
    </figure>
  );
}

/** A dagger after the title: the sources, on hover, focus or tap. */
function SourcesMark() {
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 120); };
  return (
    <span className="sources" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
      <button type="button" className="dagger" aria-expanded={open} aria-controls="sources-pop" onClick={() => setOpen(!open)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
        †<span className="sr">Sources</span>
      </button>
      <span id="sources-pop" className="pop" data-open={open || undefined} role="note">
        Phrase rates for 2025–26 models come from <a href={data.graphite.url}>Graphite’s AI Tells</a> (CC BY 4.0); 2022–23 models were measured by shibbo on <a href="https://github.com/liamdugan/raid">RAID</a> (MIT). Older models sit on 2025–26 axes, so they look closer to human than they were.{" "}
        <Link to="/docs/concepts/sources">Every source</Link>
      </span>
    </span>
  );
}

/** Current releases ranked by distance from human on the map. Rows slide as the timeline moves. */
const dist = new Map(mapModels.map((m) => [m.id, Math.hypot(m.x, m.y)]));
const maxDist = Math.max(...dist.values());
const ROW = 26;
function Closest({ month }: { month: number }) {
  const ranked = useMemo(() => {
    const { current } = state(month);
    return [...current.values()].sort((a, b) => dist.get(a.id)! - dist.get(b.id)!);
  }, [month]);
  return (
    <aside className="plate closest" aria-labelledby="closest-h">
      <h2 id="closest-h">Closest to human</h2>
      {ranked.length ? (
        <ol style={{ height: (ranked.length + 1) * ROW }}>
          <li className="people" style={{ transform: "translateY(0)" }}>
            <span className="who"><span className="people-mark" aria-hidden="true" />Human</span>
            <span className="track"><i style={{ left: 0, background: "var(--ink)" }} /></span>
          </li>
          {mapModels.map((m) => {
            const r = ranked.indexOf(m);
            return (
              <li key={m.id} data-in={r >= 0 || undefined} aria-hidden={r < 0 || undefined} style={{ transform: `translateY(${(r < 0 ? ranked.length : r + 1) * ROW}px)` }}>
                <Link className="who" to={`/models/${m.id}`} tabIndex={r < 0 ? -1 : undefined}><BrandIcon brand={brandOf(m.family)} size={13} />{m.name}</Link>
                <span className="track"><i style={{ left: `${(dist.get(m.id)! / maxDist) * 100}%`, background: familyColor(m.family) }} /></span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">No measured model yet. The first arrives in late 2022.</p>
      )}
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
  const pos = { transform: `translate(${Math.min(hover.x + 16, window.innerWidth - 340)}px, ${hover.y + 16}px)` };
  const t = d.tell ? tellById.get(d.tell) : null;
  return (
    <div className="tip" style={pos} role="status">
      <span className="specimen">“{d.term.replace(/ _ /g, " … ")}”</span>
      {d.under ? "Humans use this; current models avoid it." : t ? `Part of the tell “${label(t)}”.` : "Measured phrase."}
      <table>
        <tbody>
          {mapModels.map((m, i) => {
            const v = d.v[i];
            const r = 2 ** Math.abs(v);
            const fl = (d.floor >> i) & 1;
            const txt = v === 0 ? "within cutoff" : fl ? (v > 0 ? `${Math.round(r / 2)} uses, human 0` : `human ${Math.round(r / 2)}, model 0`) : v > 0 ? `${r >= 100 ? Math.round(r) : r.toFixed(1)}×` : `human ${r >= 100 ? Math.round(r) : r.toFixed(1)}×`;
            return (
              <tr key={m.id} className={ym(m.released) > month ? "later" : undefined}>
                <th>{m.name}</th>
                <td className="bar"><i style={{ width: `${Math.min(100, (Math.abs(v) / 10) * 100)}%`, background: v > 0 ? familyColor(m.family) : undefined }} /></td>
                <td>{txt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small>Source: Graphite, AI Tells (2026). {d.tell ? "Click for the full entry." : ""}</small>
    </div>
  );
}

function Specimens() {
  const kobak = data.eras[0];
  const rows: Array<{ id: string; word: string; fact: string; cite: { title: string; url: string } }> = [
    { id: "delve", word: "delve", fact: `“Delves” ran ${kobak.words[0].ratio}× its expected rate in 2024 PubMed abstracts. By 2026, most models use “delve” near the human rate.`, cite: { title: "Kobak et al., Science Advances (2025)", url: "https://arxiv.org/abs/2406.07016" } },
    { id: "em-dash-density", word: "the em dash", fact: "GPT-4.1 and GPT-5 used about 2.2× the human rate. GPT-6 Astra uses 0.12×.", cite: { title: "Graphite, AI Tells (2026)", url: data.graphite.url } },
    { id: "genuinely", word: "genuinely useful", fact: "Claude Opus 5 wrote it 411 times across Graphite’s articles. Human writers on the same topics never did.", cite: { title: "Graphite, AI Tells (2026)", url: data.graphite.url } },
    { id: "corrective-rather-than", word: "rather than treating", fact: "GPT-6 Astra wrote it 1,473 times. Human writers never wrote it once.", cite: { title: "Graphite, AI Tells (2026)", url: data.graphite.url } },
    { id: "contraction-avoidance", word: "it’s", fact: "Human writers wrote it 14,540 times, and Claude Opus 4.6 wrote it 7 times. This tell is an absence.", cite: { title: "Graphite, AI Tells (2026)", url: data.graphite.url } },
  ];
  return (
    <ul className="specimens">
      {rows.map((r) => {
        const t = tellById.get(r.id)!;
        return (
          <li key={r.id}>
            <span className="word specimen"><Link to={`/tells/${r.id}`}>{r.word}</Link></span>
            <Strip tell={t} />
            <p className="fact">
              {r.fact}
              <cite><Cite title={r.cite.title} url={r.cite.url} /></cite>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
