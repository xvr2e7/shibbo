import { useEffect, useMemo, useRef, useState } from "react";
import { Cite } from "../components/Cite";
import { BrandIcon } from "../components/BrandIcon";
import { Link } from "react-router-dom";
import { AtlasMap, models as mapModels, phrases, state, firstMeasured, explained, type Hover, type Layers } from "../components/AtlasMap";
import { Timeline, TIME, nextMonth } from "../components/Timeline";
import { Strip } from "../components/Strip";
import { chronology, data, tellById, ym, monthName, familyColor, label, habits, type HistTell, type Habit } from "../data";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const idx = new Map(mapModels.map((m, i) => [m.id, i]));

function initialMonth() {
  const m = /t=(\d{4})-(\d{2})/.exec(location.hash);
  return m ? Math.min(TIME.END, Math.max(TIME.START, ym(`${m[1]}-${m[2]}`))) : ym("2026-09");
}

export function AtlasPage() {
  const [month, setMonth] = useState(initialMonth);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [layers, setLayers] = useState<Layers>({ words: true, habits: true });
  const reset = 0;
  const [wide, setWide] = useState(window.innerWidth > 900);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const on = () => setWide(window.innerWidth > 900);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setMonth((m) => {
        const n = nextMonth(m);
        if (n >= ym("2026-09")) { setPlaying(false); return ym("2026-09"); }
        return n;
      });
    }, reduced() ? 900 : 360);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);

  const play = () => {
    if (!playing && month >= ym("2026-09")) setMonth(TIME.START);
    setPlaying(!playing);
  };
  const scrub = (m: number) => { setPlaying(false); setMonth(m); };

  const insets = wide ? { left: 380, right: 360, top: 16, bottom: 300 } : { left: 4, right: 4, top: 4, bottom: 4 };

  return (
    <>
      <section className="atlas" aria-labelledby="atlas-h">
        <AtlasMap month={month} onHover={setHover} insets={insets} resetSignal={reset} layers={layers} />
        <div className="plate plate-title">
          <h1 id="atlas-h">What gives a model away</h1>
          <p>A dialect atlas of machine writing, release by release.</p>
          <div className="layer-toggle" role="group" aria-label="Map layers">
            <button type="button" className="chip" aria-pressed={layers.words} onClick={() => setLayers({ ...layers, words: !layers.words })}>Words</button>
            <button type="button" className="chip" aria-pressed={layers.habits} onClick={() => setLayers({ ...layers, habits: !layers.habits })}>Habits</button>
            <Link className="chip" to="/tells">Interfaces and code</Link>
          </div>
          <p className="layer-note">
            {layers.habits ? "Badges are habits such as em dashes or echo endings, placed with the models that over-use them. " : ""}
            Interface and code tells aren’t measured per model yet; they live in the field guide.
          </p>
          <ul className="key" aria-label="Map key">
            <li className="fam-row">
              {[["gpt", "openai", "OpenAI"], ["claude", "anthropic", "Claude"], ["gemini", "google", "Gemini"], ["meta", "meta", "Llama"], ["mistral", "mistral", "Mistral"], ["mosaic", "", "MPT"], ["cohere", "cohere", "Cohere"]].map(([f, b, n]) => (
                <span key={f} className="fam"><span className="swatch" style={{ background: `var(--${f})` }} />{b && <BrandIcon brand={b} size={11} />}{n}</span>
              ))}
            </li>
            <li><span className="swatch land" />Phrases current models over-use</li>
            <li><span className="swatch shore" />Phrases people use and models avoid</li>
            <li><span className="swatch fossil" />Dropped by a newer release</li>
          </ul>
          <p className="credit">
            Data: <a href={data.graphite.url}>Graphite</a> for 2025–26 (CC BY 4.0) and <a href="https://github.com/liamdugan/raid">RAID</a> for 2022–23 (MIT, measured by shibbo). Older models are placed on 2025–26 axes, so they look closer to people than they were. <a href="docs/concepts/sources.html">Every source</a>
          </p>
        </div>
        <FieldNotes month={month} />
        {hover?.d && <Tip hover={hover} month={month} />}
        {hover?.habit && <HabitTip habit={hover.habit} x={hover.x} y={hover.y} month={month} />}

        <Timeline month={month} setMonth={scrub} playing={playing} onPlay={play} />
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
                <a className="btn primary" href="docs/guide/quick-start.html">Read the docs</a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function FieldNotes({ month }: { month: number }) {
  const notes = useMemo(() => {
    const inEra = (t: HistTell) => ym(String(t.era_start)) <= month && (t.era_end === null || t.era_end === undefined || ym(String(t.era_end)) >= month - 6);
    const hist = chronology.tells.filter(inEra).sort((a, b) => ym(String(b.era_start)) - ym(String(a.era_start))).slice(0, month >= firstMeasured ? 1 : 3);
    const releases = [
      ...chronology.milestones.map((m) => ({ name: m.name, at: ym(String(m.date).slice(0, 7)) })),
      ...mapModels.map((m) => ({ name: m.name, at: ym(m.released) })),
    ].filter((r) => r.at <= month).sort((a, b) => a.at - b.at);
    const recent = releases.at(-1);
    let measured: Array<{ term: string; model: string; fam: string; ratio: number; floor: boolean; source: string }> = [];
    if (month >= firstMeasured) {
      const { current } = state(month);
      const newest = [...current.values()].sort((a, b) => ym(b.released) - ym(a.released))[0];
      const prev = mapModels.filter((m) => m.family === newest.family && ym(m.released) < ym(newest.released)).sort((a, b) => ym(b.released) - ym(a.released))[0];
      const i = idx.get(newest.id)!, p = prev ? idx.get(prev.id)! : -1;
      measured = phrases
        .filter((d) => !d.under && d.v[i] >= 5 && (p < 0 || d.v[p] < 2) && d.term.includes(" "))
        .sort((a, b) => b.v[i] - a.v[i])
        .filter((d, k, arr) => !arr.slice(0, k).some((o) => o.term.includes(d.term) || d.term.includes(o.term)))
        .slice(0, 3)
        .map((d) => ({ term: d.term, model: newest.name, fam: newest.family, ratio: 2 ** d.v[i], floor: !!((d.floor >> i) & 1), source: newest.source ?? "graphite" }));
    }
    return { hist, recent, measured };
  }, [month]);

  return (
    <aside className="plate notes" aria-label="Field notes">
      <h2>Field notes</h2>
      <p className="when">{monthName(month)}{notes.recent ? `, after ${notes.recent.name}` : ""}</p>
      <ol>
        {notes.measured.length > 0 && (
          <li>
            New with <span style={{ color: "var(--ink)" }}>{notes.measured[0].model}</span>, against the previous release:
            {notes.measured.map((n) => (
              <span key={n.term} className="specimen" style={{ marginTop: "var(--s2)" }}>
                “{n.term.replace(/ _ /g, " … ")}” <span className="muted" style={{ fontFamily: "var(--sans)", fontStyle: "normal", fontSize: "var(--t-1)" }}>{n.floor ? "people, never" : `${Math.round(n.ratio).toLocaleString("en")}× people`}</span>
              </span>
            ))}
            <cite>{notes.measured[0].source === "raid" ? <Cite title="Measured by shibbo on RAID (Dugan et al., 2024), matched human texts" url="https://github.com/liamdugan/raid" /> : <Cite title="Graphite, AI Tells (2026)" url={data.graphite.url} />}</cite>
          </li>
        )}
        {notes.hist.map((t) => (
          <li key={t.id}>
            <span className="specimen">{t.example && t.example.replace(/^["“]|["”]$/g, "").length > 2 ? `“${t.example.replace(/^["“]|["”]$/g, "")}”` : t.tell}</span>
            {t.evidence}
            <cite><Cite title={t.source.title} url={t.source.url} year={t.source.year} /></cite>
          </li>
        ))}
        {!notes.measured.length && !notes.hist.length && (
          <li>No documented tells for this period yet. The record starts with the first cited observation; drag forward or press play.</li>
        )}
      </ol>
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
      {habit.what}. People average {fmt(habit.human)} {habit.unit}.
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
      <small>Bars show effect size against people (Cohen’s d); grey means people do more. Source: Graphite, AI Tells (2026).{t ? " Click for the related tell." : ""}</small>
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
      {d.under ? "People use this; current models avoid it." : t ? `Part of the tell “${label(t)}”.` : "Measured phrase."}
      <table>
        <tbody>
          {mapModels.map((m, i) => {
            const v = d.v[i];
            const r = 2 ** Math.abs(v);
            const fl = (d.floor >> i) & 1;
            const txt = v === 0 ? "within cutoff" : fl ? (v > 0 ? `${Math.round(r / 2)} uses, people 0` : `people ${Math.round(r / 2)}, model 0`) : v > 0 ? `${r >= 100 ? Math.round(r) : r.toFixed(1)}×` : `people ${r >= 100 ? Math.round(r) : r.toFixed(1)}×`;
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
    { id: "genuinely", word: "genuinely useful", fact: "Claude Opus 5 wrote it 411 times across Graphite’s articles. The people writing on the same topics never did.", cite: { title: "Graphite, AI Tells (2026)", url: data.graphite.url } },
    { id: "corrective-rather-than", word: "rather than treating", fact: "GPT-6 Astra wrote it 1,473 times. People never wrote it once.", cite: { title: "Graphite, AI Tells (2026)", url: data.graphite.url } },
    { id: "contraction-avoidance", word: "it’s", fact: "People wrote it 14,540 times, and Claude Opus 4.6 wrote it 7 times. This tell is an absence.", cite: { title: "Graphite, AI Tells (2026)", url: data.graphite.url } },
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
