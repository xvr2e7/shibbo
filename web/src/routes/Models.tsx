import { Link, useParams } from "react-router-dom";
import { Cite } from "../components/Cite";
import { data, ordered, modelById, familyColor, monthName, ym, fmtRatio, chronology, labFamily } from "../data";
import { models as mapModels } from "../components/AtlasMap";

const dist = (id: string) => {
  const m = mapModels.find((x) => x.id === id)!;
  return Math.hypot(m.x, m.y);
};

export function ModelsPage() {
  const timeline = [...chronology.milestones].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return (
    <div className="page">
      <h1>Models</h1>
      <p className="lede" style={{ marginTop: "var(--s3)" }}>
        Nine models have measured tells. Distance shows how far each sits from people on the atlas, where 0 writes like the human articles and 100 is the farthest model.
      </p>
      <div className="table-scroll" style={{ marginTop: "var(--s6)" }}><table className="ledger">
        <thead><tr><th>Model</th><th>Released</th><th>Distance from people</th><th>Tells</th><th>Kept from previous release</th></tr></thead>
        <tbody>
          {ordered.map((m) => (
            <tr key={m.id}>
              <td className="name"><span className="swatch" style={{ background: familyColor(m.family), marginRight: 8 }} /><Link to={`/models/${m.id}`} style={{ fontFamily: "var(--sans)", fontStyle: "normal" }}>{m.name}</Link></td>
              <td>{monthName(ym(m.released), "short")}{m.verified ? "" : "*"}</td>
              <td><Bar v={dist(m.id)} color={familyColor(m.family)} /></td>
              <td>{m.tells.toLocaleString("en")}</td>
              <td>{m.shared === null ? <span className="muted">first measured</span> : `${Math.round(m.shared * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s3)" }}>Tells: phrases used at least {data.graphite.threshold.ratio}× as often as people, in at least {data.graphite.threshold.articles} articles. * release month not confirmed by an official source.</p>

      {timeline.length > 0 && (
        <section className="section" aria-labelledby="hist-h">
          <h2 id="hist-h">Release history</h2>
          <p className="lede" style={{ margin: "var(--s3) 0 var(--s5)" }}>Every system on the atlas timeline, with its source. Only the nine above have measured tells.</p>
          <div className="table-scroll"><table className="ledger">
            <thead><tr><th>Date</th><th>System</th><th>Lab</th><th>Weights</th><th>Note</th></tr></thead>
            <tbody>
              {timeline.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{m.date}</td>
                  <td><span className="swatch" style={{ background: familyColor(labFamily(m.lab ?? m.maker)), marginRight: 8 }} />{m.name}</td>
                  <td>{m.lab ?? m.maker}</td>
                  <td>{m.weights ?? ""}</td>
                  <td>{m.note} {m.source && <Cite title="" url={m.source.url} />}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 140, height: 8, background: "var(--neutral)", borderRadius: 2, position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", inset: 0, width: `${v}%`, background: color, borderRadius: "0 3px 3px 0" }} />
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(v)}</span>
    </span>
  );
}

export function ModelPage() {
  const { id = "" } = useParams();
  const m = modelById.get(id);
  if (!m) return <div className="page"><h1>No model called “{id}”</h1><p className="lede" style={{ marginTop: 12 }}><Link to="/models">See measured models</Link>.</p></div>;
  const prev = ordered.filter((x) => x.family === m.family && x.released < m.released).at(-1);
  const f = m.features;
  return (
    <div className="page">
      <header className="entry-head">
        <Link className="crumb" to="/models">Models</Link>
        <h1 style={{ fontFamily: "var(--sans)", fontStyle: "normal", fontWeight: 650 }}>{m.name}</h1>
        <p className="lede">
          {m.maker}, {monthName(ym(m.released))}{m.verified ? "" : " (month unconfirmed)"}. {m.tells.toLocaleString("en")} measured tells
          {prev && m.shared !== null ? `, ${Math.round(m.shared * 100)}% of them shared with ${prev.name}` : ""}. Distance from people on the atlas: {Math.round(dist(m.id))} of 100.
        </p>
      </header>
      <dl className="facts">
        <dt>Em dashes</dt><dd>{f["layer1__punct_emdash_per1k"].mean.toFixed(2)} per 1,000 words (people: {f["layer1__punct_emdash_per1k"].human.toFixed(2)})</dd>
        <dt>“Delve”</dt><dd>{f["layer5__llm_delve_per1k"].mean.toFixed(3)} per 1,000 words (people: {f["layer5__llm_delve_per1k"].human.toFixed(3)})</dd>
        <dt>Ending that mirrors the opening</dt><dd>{(f["layer5__selfref_last_mirrors_first"].mean * 100).toFixed(0)}% of articles (people: {(f["layer5__selfref_last_mirrors_first"].human * 100).toFixed(0)}%)</dd>
      </dl>
      <div className="two">
        <section>
          <h2 style={{ fontSize: "var(--t2)", marginBottom: "var(--s4)" }}>Phrases it over-uses</h2>
          <ul className="phrases" style={{ columns: 1 }}>
            {m.top.filter((e) => e.kind === "ngram").slice(0, 16).map((e) => (
              <li key={e.term}><span className="specimen">“{e.term}”</span><span className="n">{e.floor ? `${e.count} vs 0` : fmtRatio(e.ratio)}</span></li>
            ))}
          </ul>
        </section>
        <section>
          <h2 style={{ fontSize: "var(--t2)", marginBottom: "var(--s4)" }}>Phrases people use and it avoids</h2>
          <ul className="phrases" style={{ columns: 1 }}>
            {m.under.slice(0, 16).map((e) => (
              <li key={e.term}><span className="specimen">“{e.term}”</span><span className="n">{e.floor ? `0 vs ${e.count}` : fmtRatio(e.ratio)}</span></li>
            ))}
          </ul>
        </section>
      </div>
      <section className="section">
        <h2 style={{ fontSize: "var(--t2)" }}>Rules for prompts</h2>
        <p className="lede" style={{ margin: "var(--s3) 0 var(--s4)" }}>What <code>shibbo rules --model {m.id}</code> prints, ranked by this model’s measured rates.</p>
        <pre><code>{m.rules}</code></pre>
      </section>
      <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s5)" }}>“411 vs 0” counts raw uses in Graphite’s articles when one side never used the phrase. Data from <a href={data.graphite.url}>Graphite, AI Tells (2026)</a>.</p>
    </div>
  );
}
