import { useMemo, useState, type ReactNode } from "react";
import { Cite } from "../components/Cite";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Strip } from "../components/Strip";
import { Specimen, hasSpecimen } from "../components/Specimen";
import { BrandIcon, brandOf } from "../components/BrandIcon";
import { data, ordered, tellById, label, describe, familyColor, monthName, ym, chronology, type Tell } from "../data";

// Things you see come first: the atlas sends visitors here for interface, type and code tells.
const DOMAINS = [
  { key: "ui", name: "Interfaces and type" },
  { key: "code", name: "Code" },
  { key: "agent", name: "Agents" },
  { key: "prose", name: "Prose" },
  { key: "chat", name: "Chat replies" },
  { key: "all", name: "Everything" },
] as const;
type DomainKey = (typeof DOMAINS)[number]["key"];
const GROUP_NAME: Record<string, string> = {
  typography: "Type", color: "Color", layout: "Layout", components: "Components", motion: "Motion", iconography: "Icons", copy: "Interface copy", imagery: "Imagery", dataviz: "Charts",
  comments: "Comments", errors: "Error handling", structure: "Structure", naming: "Naming", tests: "Tests", docs: "Docs and READMEs", git: "Commits and PRs", deps: "Dependencies", output: "Logs and output",
  claims: "Claims", scope: "Scope", files: "Files", tone: "Tone", process: "Process", safety: "Safety",
  vocabulary: "Vocabulary", phrasing: "Phrasing", punctuation: "Punctuation", formatting: "Formatting", fiction: "Fiction", openers: "Openers", closers: "Closers", disclaimers: "Disclaimers",
  lexical: "Words", other: "Other",
};
const groupOf = (t: Tell) => t.group ?? (t.domain === "prose" || t.domain === "chat" ? (t.kind === "lexical" ? "lexical" : "structure") : "other");
const groupName = (g: string) => GROUP_NAME[g] ?? g[0].toUpperCase() + g.slice(1);
const SORTS = [
  { key: "strength", name: "Strongest first" },
  { key: "newest", name: "Newest first" },
  { key: "az", name: "A to Z" },
] as const;
const firstSeen = (t: Tell) => Number(String(t.era?.first_seen ?? "0").slice(0, 4)) || 0;
const newestStrength = (t: Tell) => {
  const newest = ["gpt", "claude", "gemini"].map((f) => ordered.filter((m) => m.family === f).at(-1)!);
  return Math.max(0, ...newest.map((m) => Math.log2(t.perModel[m.id]?.ratio ?? 1) * (t.measure?.graphite_absent ? -1 : 1)));
};
const domainName = (d: string) => DOMAINS.find((x) => x.key === d)?.name ?? d;

export function TellsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const domain = (params.get("d") ?? "ui") as DomainKey;
  const group = params.get("g") ?? "";
  const view = params.get("view") === "index" ? "index" : "gallery";
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("strength");
  const [rising, setRising] = useState(false);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    if (k === "d") n.delete("g");
    setParams(n, { replace: true });
  };
  const inDomain = useMemo(() => data.tells.filter((t) => domain === "all" || t.domain === domain), [domain]);
  const groups = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of inDomain) c.set(groupOf(t), (c.get(groupOf(t)) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [inDomain]);
  const rows = useMemo(() => {
    // A search looks across every shelf.
    const list = (q ? data.tells : inDomain)
      .filter((t) => q || !group || groupOf(t) === group)
      .filter((t) => !rising || t.status === "rising")
      .filter((t) => !q || `${t.name} ${t.what} ${t.id} ${t.examples?.bad ?? ""}`.toLowerCase().includes(q.toLowerCase()));
    if (sort === "strength") list.sort((a, b) => newestStrength(b) * b.severity - newestStrength(a) * a.severity || b.severity - a.severity || label(a).localeCompare(label(b)));
    if (sort === "newest") list.sort((a, b) => firstSeen(b) - firstSeen(a));
    if (sort === "az" || view === "index") list.sort((a, b) => label(a).localeCompare(label(b)));
    return list;
  }, [q, inDomain, group, sort, rising, view]);
  const sections = useMemo(() => {
    if (q || group || domain === "all" || view === "index") return [{ key: "", rows }];
    return groups.map(([g]) => ({ key: g, rows: rows.filter((t) => groupOf(t) === g) })).filter((s) => s.rows.length);
  }, [rows, groups, q, group, domain, view]);
  const count = (k: string) => (k === "all" ? data.tells.length : data.tells.filter((t) => t.domain === k).length);
  return (
    <div className="page">
      <h1>A field guide to tells</h1>
      <p className="lede" style={{ marginTop: "var(--s3)" }}>
        {data.tells.length} patterns readers now spot as machine-made, from interface habits to stock phrases. Each card shows the tell itself; open one for its evidence, fix and detection rule.
      </p>
      <div className="shelves" role="group" aria-label="Kind of output">
        {DOMAINS.map((d) => (
          <button key={d.key} type="button" className="shelf" aria-pressed={!q && domain === d.key} onClick={() => { set("q", ""); set("d", d.key); }}>
            {d.name} <span className="n">{count(d.key)}</span>
          </button>
        ))}
      </div>
      <div className="toolbar" role="search">
        {!q && groups.length > 1 && domain !== "all" && (
          <div className="chips" role="group" aria-label="Group">
            <button type="button" className="chip" aria-pressed={!group} onClick={() => set("g", "")}>All</button>
            {groups.map(([g, n]) => (
              <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => set("g", group === g ? "" : g)}>
                {groupName(g)} <span className="n">{n}</span>
              </button>
            ))}
          </div>
        )}
        <span className="toolbar-end">
          <button className="chip" type="button" aria-pressed={rising} onClick={() => setRising(!rising)}>Rising only</button>
          <span className="seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "gallery"} onClick={() => set("view", "")}>Cards</button>
            <button type="button" aria-pressed={view === "index"} onClick={() => set("view", "index")}>Index</button>
          </span>
          {view === "gallery" && (
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          )}
          <input type="search" placeholder="Search every tell" value={q} onChange={(e) => set("q", e.target.value)} aria-label="Search tells" />
        </span>
      </div>
      {!rows.length && <p className="lede">Nothing matches. Clear the search or pick another shelf.</p>}
      {view === "index" && rows.length > 0 && <TellIndex rows={rows} showDomain={!!q || domain === "all"} />}
      {view === "gallery" &&
        sections.map((s) => (
          <section key={s.key || "all"} className="guide-section" aria-label={s.key ? groupName(s.key) : undefined}>
            {s.key && <h2 className="guide-h">{groupName(s.key)} <span className="n">{s.rows.length}</span></h2>}
            <div className="guide">
              {s.rows.map((t) => <SpecimenCard key={t.id} t={t} showDomain={!!q || domain === "all"} />)}
            </div>
          </section>
        ))}
    </div>
  );
}

/** A dense A to Z list, for reading the whole dictionary at once. */
function TellIndex({ rows, showDomain }: { rows: Tell[]; showDomain: boolean }) {
  const letters = new Map<string, Tell[]>();
  for (const t of rows) {
    const k = label(t).replace(/^[^A-Za-z0-9]+/, "")[0]?.toUpperCase() ?? "#";
    const key = /[A-Z]/.test(k) ? k : "#";
    letters.set(key, [...(letters.get(key) ?? []), t]);
  }
  return (
    <div className="tell-index">
      {[...letters.entries()].map(([k, list]) => (
        <section key={k}>
          <h2>{k}</h2>
          <ul>
            {list.map((t) => (
              <li key={t.id}>
                <Link to={`/tells/${t.id}`}>{label(t)}</Link>
                {showDomain && <span className="muted"> {domainName(t.domain).toLowerCase()}</span>}
                <span className={`status-dot ${t.status}`} title={t.status} />
              </li>
            ))}
          </ul>
        </section>
      ))}
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

export function SpecimenCard({ t, showDomain = false }: { t: Tell; showDomain?: boolean }) {
  const measured = Object.values(t.perModel).some(Boolean);
  const ui = hasSpecimen(t);
  const phrases = topPhrases(t);
  return (
    <Link to={`/tells/${t.id}`} className={`specimen-card kind-${t.domain}`}>
      <span className="card-head">
        <span className={`status ${t.status}`}>{t.status}</span>
        <span className="muted">{showDomain ? `${domainName(t.domain)}, ` : ""}{groupName(groupOf(t)).toLowerCase()}</span>
      </span>
      {ui ? (
        <Specimen t={t} />
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
        <Link className="crumb" to={`/tells?d=${t.domain}`}>Tells, {domainName(t.domain).toLowerCase()}</Link>
        <h1>{t.name}</h1>
        <p className="lede">{t.what}</p>
      </header>
      <dl className="facts">
        <dt>Where</dt><dd>{domainName(t.domain)}, {groupName(groupOf(t)).toLowerCase()}</dd>
        {t.models?.length ? <><dt>Seen in</dt><dd>{t.models.join(", ")}</dd></> : null}
        <dt>Status</dt><dd>{t.status}{t.era?.first_seen ? `, first seen ${t.era.first_seen}` : ""}</dd>
        <dt>Confidence</dt><dd>{t.confidence}</dd>
        {t.fix && <><dt>Fix</dt><dd>{t.fix}</dd></>}
        {t.substitutes?.length ? <><dt>Turns into</dt><dd>{t.substitutes.map((s, i) => <span key={s}>{i ? ", " : ""}{tellById.has(s) ? <Link to={`/tells/${s}`}>{label(tellById.get(s)!)}</Link> : s.replace(/["“”]/g, "")}</span>)}</dd></> : null}
        {t.false_positives && <><dt>Careful</dt><dd>{t.false_positives}</dd></>}
      </dl>
      {hasSpecimen(t) && <div className={`entry-specimen kind-${t.domain}`}><Specimen t={t} /></div>}
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
        <p style={{ margin: "var(--s3) 0" }}>{t.detect.method === "regex" ? (t.domain === "ui" || t.domain === "code" ? "A pattern match on the source file." : "A pattern match on prose, with code and links removed.") : t.detect.method === "stat" ? `Statistical check (${t.detect.fn}).` : "Needs a reader’s judgment."}</p>
        {t.detect.pattern && <pre><code>{t.detect.pattern}</code></pre>}
        {t.detect.judge && <p className="muted" style={{ marginTop: "var(--s3)" }}>Question for a reader: {t.detect.judge}</p>}
      </section>
      <section className="section" style={{ paddingTop: "var(--s5)" }}>
        <h2>Sources</h2>
        <ul>{srcs.map((s) => <li key={s.title}><Cite title={s.title + (s.author ? `, ${s.author}` : "") + (s.date ? ` (${String(s.date).slice(0, 4)})` : "")} url={s.url} /></li>)}</ul>
      </section>
    </div>
  );
}
