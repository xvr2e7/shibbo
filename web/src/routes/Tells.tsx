import { useMemo, useState, type ReactNode } from "react";
import { Cite } from "../components/Cite";
import { Link, useParams } from "react-router-dom";
import { Strip } from "../components/Strip";
import { UiSpecimen, hasUiSpecimen } from "../components/UiSpecimens";
import { BrandIcon, brandOf } from "../components/BrandIcon";
import { data, ordered, tellById, label, describe, familyColor, monthName, ym, chronology, type Tell } from "../data";

const DOMAINS = [
  { key: "all", name: "Everything" },
  { key: "prose", name: "Prose" },
  { key: "chat", name: "Chat replies" },
  { key: "code", name: "Code" },
  { key: "ui", name: "Interfaces" },
] as const;
const SORTS = [
  { key: "strength", name: "Strongest in current models" },
  { key: "newest", name: "Newest first" },
  { key: "az", name: "A to Z" },
] as const;
const firstSeen = (t: Tell) => Number(String(t.era?.first_seen ?? "0").slice(0, 4)) || 0;
const newestStrength = (t: Tell) => {
  const newest = ["gpt", "claude", "gemini"].map((f) => ordered.filter((m) => m.family === f).at(-1)!);
  return Math.max(0, ...newest.map((m) => Math.log2(t.perModel[m.id]?.ratio ?? 1) * (t.measure?.graphite_absent ? -1 : 1)));
};

export function TellsPage() {
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]["key"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("strength");
  const [rising, setRising] = useState(false);
  const rows = useMemo(() => {
    const list = data.tells
      .filter((t) => domain === "all" || t.domain === domain || (domain === "ui" && t.id === "title-case-headings"))
      .filter((t) => !rising || t.status === "rising")
      .filter((t) => !q || `${t.name} ${t.what} ${t.id}`.toLowerCase().includes(q.toLowerCase()));
    if (sort === "strength") list.sort((a, b) => newestStrength(b) * b.severity - newestStrength(a) * a.severity || b.severity - a.severity);
    if (sort === "newest") list.sort((a, b) => firstSeen(b) - firstSeen(a));
    if (sort === "az") list.sort((a, b) => label(a).localeCompare(label(b)));
    return list;
  }, [q, domain, sort, rising]);
  const count = (k: string) => (k === "all" ? data.tells.length : data.tells.filter((t) => t.domain === k).length);
  return (
    <div className="page">
      <h1>A field guide to tells</h1>
      <p className="lede" style={{ marginTop: "var(--s3)" }}>
        {data.tells.length} patterns readers now spot as machine-made. Each specimen shows the tell itself; open one for its evidence, fix and detection rule.
      </p>
      <div className="toolbar" role="search">
        <div className="chips" role="group" aria-label="Kind of writing">
          {DOMAINS.map((d) => (
            <button key={d.key} type="button" className="chip" aria-pressed={domain === d.key} onClick={() => setDomain(d.key)}>
              {d.name} <span className="n">{count(d.key)}</span>
            </button>
          ))}
        </div>
        <button className="chip" type="button" aria-pressed={rising} onClick={() => setRising(!rising)}>Rising only</button>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tells" />
      </div>
      {rows.length ? (
        <div className="guide">
          {rows.map((t) => <SpecimenCard key={t.id} t={t} />)}
        </div>
      ) : (
        <p className="lede">Nothing matches. Clear the search or choose “Everything”.</p>
      )}
    </div>
  );
}

/** Wrap the part of an example that the tell's own pattern matches. */
function Highlighted({ text, t }: { text: string; t: Tell }) {
  if (!t.detect.pattern) return <>{text}</>;
  let re: RegExp;
  try { re = new RegExp(t.detect.pattern, (t.detect.flags ?? "i").replace("g", "") + "g"); } catch { return <>{text}</>; }
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    parts.push(text.slice(last, m.index));
    parts.push(<mark key={m.index}>{m[0]}</mark>);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function topPhrases(t: Tell) {
  return ordered
    .map((m) => ({ m, v: t.perModel[m.id] }))
    .filter((e) => e.v && e.v.term)
    .sort((a, b) => (b.v!.ratio ?? 0) - (a.v!.ratio ?? 0))
    .filter((e, i, arr) => arr.findIndex((o) => o.v!.term === e.v!.term) === i)
    .slice(0, 3);
}

export function SpecimenCard({ t }: { t: Tell }) {
  const measured = Object.values(t.perModel).some(Boolean);
  const ui = hasUiSpecimen(t.id);
  const phrases = topPhrases(t);
  return (
    <Link to={`/tells/${t.id}`} className={`specimen-card kind-${t.domain}`}>
      <span className="card-head">
        <span className={`status ${t.status}`}>{t.status}</span>
        <span className="muted">{t.domain === "ui" ? "interface" : t.domain}</span>
      </span>
      {ui ? (
        <UiSpecimen id={t.id} />
      ) : (
        <span className="big specimen">{label(t)}</span>
      )}
      <span className="card-name">{ui ? label(t) : t.what}</span>
      {t.examples?.bad && !ui && (
        <span className="example">
          <Highlighted text={t.examples.bad} t={t} />
        </span>
      )}
      {!t.examples?.bad && phrases.length > 0 && (
        <span className="phrase-list">
          {phrases.map((e) => (
            <span key={e.m.id}>
              <BrandIcon brand={brandOf(e.m.family)} size={12} /> <i className="specimen">“{e.v!.term!.replace(/ _ /g, " … ")}”</i>{" "}
              <span className="muted">{e.m.name}</span>
            </span>
          ))}
        </span>
      )}
      {measured && <Strip tell={t} labels={false} />}
      {t.fix && <span className="fix">{t.fix}</span>}
    </Link>
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
      {hasUiSpecimen(t.id) && <div className="entry-specimen"><UiSpecimen id={t.id} /></div>}
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
