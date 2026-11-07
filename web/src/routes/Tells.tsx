import { useMemo, useState } from "react";
import { Cite } from "../components/Cite";
import { Link, useParams } from "react-router-dom";
import { Strip } from "../components/Strip";
import { data, ordered, tellById, label, describe, familyColor, monthName, ym, chronology } from "../data";

const DOMAINS = ["all", "prose", "chat", "code", "ui"] as const;
const STATUSES = ["all", "rising", "peaking", "steady", "fading", "retired"] as const;

export function TellsPage() {
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [measuredOnly, setMeasuredOnly] = useState(false);
  const rows = useMemo(
    () =>
      data.tells
        .filter((t) => domain === "all" || t.domain === domain)
        .filter((t) => status === "all" || t.status === status)
        .filter((t) => !measuredOnly || Object.values(t.perModel).some(Boolean))
        .filter((t) => !q || `${t.name} ${t.what} ${t.id}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (b.strength ?? 0) * b.severity - (a.strength ?? 0) * a.severity),
    [q, domain, status, measuredOnly],
  );
  return (
    <div className="page">
      <h1>Tells</h1>
      <p className="lede" style={{ marginTop: "var(--s3)" }}>
        {data.tells.length} patterns, each with a fix. The strip shows how every measured model uses it next to people; empty strips have not been measured yet.
      </p>
      <div className="toolbar" role="search">
        <input type="search" placeholder="Search tells" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tells" />
        <select value={domain} onChange={(e) => setDomain(e.target.value as typeof domain)} aria-label="Domain">
          {DOMAINS.map((d) => <option key={d} value={d}>{d === "all" ? "Every domain" : d === "ui" ? "UI" : d[0].toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "Any status" : s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <button className="btn" type="button" aria-pressed={measuredOnly} onClick={() => setMeasuredOnly(!measuredOnly)}>Measured only</button>
        <span className="count">{rows.length} shown</span>
      </div>
      {rows.length ? (
        <div className="table-scroll"><table className="ledger">
          <thead>
            <tr><th>Tell</th><th>Where</th><th>Status</th><th className="strip-cell">Models next to people</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="name"><Link to={`/tells/${t.id}`}>{label(t)}</Link><div className="muted" style={{ fontSize: "var(--t-1)" }}>{t.what}</div></td>
                <td>{t.domain === "ui" ? "UI" : t.domain}</td>
                <td><span className={`status ${t.status}`}>{t.status}</span></td>
                <td className="strip-cell">{Object.values(t.perModel).some(Boolean) ? <Strip tell={t} labels={false} /> : <span className="muted">not measured</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <p className="lede">Nothing matches. Clear the search or pick “Every domain”.</p>
      )}
    </div>
  );
}

export function TellPage() {
  const { id = "" } = useParams();
  const t = tellById.get(id);
  if (!t) {
    return (
      <div className="page">
        <h1>No tell called “{id}”</h1>
        <p className="lede" style={{ marginTop: "var(--s3)" }}>It may have been renamed. <Link to="/tells">Browse every tell</Link>.</p>
      </div>
    );
  }
  const measured = ordered.filter((m) => t.perModel[m.id]);
  const srcs = t.sources.map((s) => data.sources[s]).filter(Boolean);
  const history = chronology.tells.filter((h) => h.tell.toLowerCase().includes(label(t).toLowerCase()) || (h.example ?? "").toLowerCase().includes(label(t).toLowerCase()));
  return (
    <div className="page">
      <header className="entry-head">
        <Link className="crumb" to="/tells">Tells</Link>
        <h1>{t.name}</h1>
        <p className="lede">{t.what}</p>
      </header>
      <dl className="facts">
        <dt>Where</dt><dd>{t.domain === "ui" ? "UI" : t.domain}, {t.kind}</dd>
        <dt>Status</dt><dd>{t.status}{t.era?.first_seen ? `, first seen ${t.era.first_seen}` : ""}</dd>
        <dt>Confidence</dt><dd>{t.confidence}</dd>
        {t.fix && <><dt>Fix</dt><dd>{t.fix}</dd></>}
        {t.substitutes?.length ? <><dt>Turns into</dt><dd>{t.substitutes.map((s, i) => <span key={s}>{i ? ", " : ""}{tellById.has(s) ? <Link to={`/tells/${s}`}>{label(tellById.get(s)!)}</Link> : s.replace(/["“”]/g, "")}</span>)}</dd></> : null}
        {t.false_positives && <><dt>Careful</dt><dd>{t.false_positives}</dd></>}
      </dl>
      {t.examples?.bad && (
        <div className="pair">
          <figure className="bad"><figcaption>The tell</figcaption><blockquote>{t.examples.bad}</blockquote></figure>
          <figure className="good"><figcaption>Plain</figcaption><blockquote>{t.examples.good}</blockquote></figure>
        </div>
      )}
      {measured.length > 0 && (
        <section className="section" style={{ paddingTop: "var(--s5)" }}>
          <h2>Measured</h2>
          <div style={{ maxWidth: 520, margin: "var(--s4) 0" }}><Strip tell={t} width={520} /></div>
          <div className="table-scroll"><table className="ledger" style={{ maxWidth: 820 }}>
            <thead><tr><th>Model</th><th>Released</th><th>Reading</th><th>Phrase</th></tr></thead>
            <tbody>
              {ordered.map((m) => {
                const v = t.perModel[m.id];
                return (
                  <tr key={m.id}>
                    <td><span className="swatch" style={{ background: familyColor(m.family), marginRight: 8 }} />{m.name}</td>
                    <td>{monthName(ym(m.released), "short")}{m.verified ? "" : "*"}</td>
                    <td>{v ? describe(v, m) : <span className="muted">under Graphite’s cutoff</span>}</td>
                    <td className="specimen">{v?.term ? `“${v.term.replace(/ _ /g, " … ")}”` : v?.via === "feature" ? "rate per 1,000 words" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s3)" }}>* release month not confirmed by an official source.</p>
        </section>
      )}
      {history.length > 0 && (
        <section className="section" style={{ paddingTop: "var(--s5)" }}>
          <h2>Earlier record</h2>
          <ul className="phrases" style={{ columns: 1 }}>
            {history.map((h) => <li key={h.id}><span>{h.evidence} <Cite title={h.source.title} url={h.source.url} /></span><span className="n">{String(h.era_start)}</span></li>)}
          </ul>
        </section>
      )}
      <section className="section" style={{ paddingTop: "var(--s5)" }}>
        <h2>Detection</h2>
        <p style={{ margin: "var(--s3) 0" }}>{t.detect.method === "regex" ? "A pattern match on prose, with code and links removed." : t.detect.method === "stat" ? `Statistical check (${t.detect.fn}).` : "Needs a reader’s judgment."}</p>
        {t.detect.pattern && <pre><code>{t.detect.pattern}</code></pre>}
        {t.detect.judge && <p className="muted" style={{ marginTop: "var(--s3)" }}>Question for a reader: {t.detect.judge}</p>}
      </section>
      <section className="section" style={{ paddingTop: "var(--s5)" }}>
        <h2>Sources</h2>
        <ul>{srcs.map((s) => <li key={s.title}><Cite title={s.title} url={s.url} /></li>)}</ul>
      </section>
    </div>
  );
}
