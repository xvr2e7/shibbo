import { useEffect, useMemo, useState } from "react";
import { Cite } from "../components/Cite";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Strip } from "../components/Strip";
import { Specimen, hasSpecimen } from "../components/Specimen";
import { TellGrid } from "../components/TellGrid";
import { groupAnchor } from "../components/tellAnchors";
import { LAYERS, groupName, groupOf, isLayer, layerById, layerOf, layerOfDomain, tellsOfLayer, type LayerId } from "../components/layers";
import { data, ordered, tellById, label, describe, familyColor, monthName, ym, chronology, type Tell } from "../data";
import "../styles/tells.css";

const DOMAIN_NAME: Record<string, string> = { ui: "Interfaces and type", code: "Code", agent: "Agents", prose: "Prose", chat: "Chat replies" };
const domainName = (d: string) => DOMAIN_NAME[d] ?? d;

type View = LayerId | "all";
const DEFAULT: LayerId = "interface";
const NARROW = 760;
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW);
  useEffect(() => {
    const mq = matchMedia(`(max-width: ${NARROW - 1}px)`);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** The layer named in the URL. Old links name a domain (?d=ui, ?domain=ui); map those to their layer. */
function layerFromParams(p: URLSearchParams): View | null {
  const l = p.get("layer");
  if (l === "all" || isLayer(l)) return l;
  const d = p.get("domain") ?? p.get("d");
  if (d === "all") return "all";
  return d ? layerOfDomain(d) : null;
}

const matches = (t: Tell, q: string) => `${t.name} ${label(t)} ${t.what} ${t.id} ${t.examples?.bad ?? ""}`.toLowerCase().includes(q);

export function TellsPage() {
  const [params, setParams] = useSearchParams();
  const narrow = useNarrow();
  const q = params.get("q") ?? "";
  const named = layerFromParams(params);
  // A bare ?q= (an old search link) looks across every layer.
  const view: View = named ?? (q ? "all" : DEFAULT);
  const index = params.get("view") === "index";
  const rising = params.get("rising") === "1";

  const set = (changes: Record<string, string>) => {
    const n = new URLSearchParams(params);
    n.delete("d"); n.delete("domain"); n.delete("g"); n.delete("thread"); n.delete("root");
    if (!n.has("layer")) n.set("layer", view);
    for (const [k, v] of Object.entries(changes)) if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  // Rewrite old ?d= / ?domain= links to ?layer= so the address matches what shows.
  useEffect(() => {
    if (!params.has("d") && !params.has("domain")) return;
    const n = new URLSearchParams(params);
    n.delete("d"); n.delete("domain");
    n.set("layer", view);
    setParams(n, { replace: true });
  }, [params, view, setParams]);

  // Old links could name a group (?g=layout); bring that group into view once.
  const oldGroup = params.get("g");
  useEffect(() => {
    if (!oldGroup || view === "all") return;
    const t = window.setTimeout(() => document.getElementById(groupAnchor(view, oldGroup))?.scrollIntoView({ block: "start" }), 80);
    return () => clearTimeout(t);
  }, [oldGroup, view]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const keep = (t: Tell) => (!rising || t.status === "rising") && (!needle || matches(t, needle));
    return Object.fromEntries(LAYERS.map((l) => [l.id, tellsOfLayer[l.id].filter(keep)])) as Record<LayerId, Tell[]>;
  }, [needle, rising]);
  const filtering = !!needle || rising;
  const count = (v: View) => (v === "all" ? LAYERS.reduce((n, l) => n + shown[l.id].length, 0) : shown[v].length);
  const layersHere = view === "all" ? LAYERS : [layerById.get(view)!];
  const total = count(view);
  const elsewhere = LAYERS.filter((l) => view !== "all" && l.id !== view && shown[l.id].length > 0);

  return (
    <div className="page tells-page">
      <h1>A field guide to tells</h1>

      <div className="shelves" role="group" aria-label="Layer">
        {[...LAYERS.map((l) => ({ id: l.id as View, name: l.name })), { id: "all" as View, name: "All" }].map((l) => (
          <button key={l.id} type="button" className="shelf" aria-pressed={view === l.id} onClick={() => set({ layer: l.id })}>
            {l.name} <span className="n">{count(l.id)}</span>
          </button>
        ))}
      </div>

      <div className="tells-tools" role="search">
        <input type="search" placeholder="Search tells" value={q} onChange={(e) => set({ q: e.target.value })} aria-label="Search tells" />
        <label className="check">
          <input type="checkbox" checked={rising} onChange={(e) => set({ rising: e.target.checked ? "1" : "" })} /> Rising only
        </label>
        <span className="view-switch" role="group" aria-label="Show as">
          <button type="button" aria-pressed={!index} onClick={() => set({ view: "" })}>By year</button>
          <button type="button" aria-pressed={index} onClick={() => set({ view: "index" })}>A to Z</button>
        </span>
      </div>

      <p className="sr" role="status">{filtering ? `${total} tells match.` : ""}</p>

      {total === 0 && (
        <div className="tells-empty">
          <p>
            No {view === "all" ? "" : `${layerById.get(view)!.name.toLowerCase()} `}tells match{needle ? ` “${q.trim()}”` : ""}{rising ? " among rising tells" : ""}.
            {elsewhere.length > 0 ? " Try another layer:" : " Clear the search to see them all."}
          </p>
          {elsewhere.length > 0 && (
            <ul>
              {elsewhere.map((l) => (
                <li key={l.id}><button type="button" onClick={() => set({ layer: l.id })}>{l.name} <span className="n">{shown[l.id].length}</span></button></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {index && total > 0 && <TellIndex rows={layersHere.flatMap((l) => shown[l.id])} showLayer={view === "all"} />}
      {!index &&
        layersHere.map((l) =>
          shown[l.id].length === 0 ? null : view === "all" ? (
            <section key={l.id} className="tells-layer" aria-labelledby={`layer-${l.id}`}>
              <h2 id={`layer-${l.id}`}>{l.name}</h2>
              <TellGrid layer={l.id} tells={shown[l.id]} compact={narrow} />
            </section>
          ) : (
            <TellGrid key={l.id} layer={l.id} tells={shown[l.id]} compact={narrow} />
          ),
        )}
    </div>
  );
}

/** A dense A to Z list, for reading the whole dictionary at once. */
function TellIndex({ rows, showLayer }: { rows: Tell[]; showLayer: boolean }) {
  const letters = new Map<string, Tell[]>();
  const bare = (t: Tell) => label(t).replace(/^[^A-Za-z0-9]+/, "");
  for (const t of [...rows].sort((a, b) => bare(a).localeCompare(bare(b)))) {
    const k = bare(t)[0]?.toUpperCase() ?? "#";
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
                {showLayer && <span className="muted"> {layerById.get(layerOf(t))!.name.toLowerCase()}</span>}
                <span className={`status-dot ${t.status}`} title={t.status} />
              </li>
            ))}
          </ul>
        </section>
      ))}
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
        <Link className="crumb" to={`/tells?layer=${layerOf(t)}`}>Tells, {domainName(t.domain).toLowerCase()}</Link>
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
        {t.advisory && <><dt>Advisory</dt><dd>{t.advisory}</dd></>}
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
                    <td>{v ? describe(v, m) : <span className="muted">{m.source === "shibbo-api" ? `no clear gap in its ${m.docs} articles` : "too few uses to measure"}</span>}{(v as { counted?: boolean } | null)?.counted ? <sup title="Counted by shibbo in the same articles; Graphite’s table leaves this cell out.">†</sup> : null}{v?.own ? <sup title={`shibbo’s own run: ${v.own} articles against the human articles on the same topics.`}>‡</sup> : null}</td>
                    <td className="specimen">{v?.term ? `“${v.term.replace(/ _ /g, " … ")}”` : v?.via === "feature" ? "rate per 1,000 words" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s3)" }}>* release month not confirmed by an official source. † counted by shibbo in Graphite’s articles, where Graphite’s own table leaves the cell out.{ordered.some((m) => m.source === "shibbo-api" && t.perModel[m.id]) ? " ‡ shibbo’s own run through the model’s API, a few hundred articles against people on the same topics; shown only when a paired sign test backs it." : ""}</p>
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
