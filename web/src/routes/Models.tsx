import { Link, useParams } from "react-router-dom";
import { data, ordered, modelById, familyColor, monthName, ym, fmtRatio, chronology } from "../data";
import { models as mapModels } from "../components/AtlasMap";
import { BrandIcon, brandOf } from "../components/BrandIcon";
import { Cite } from "../components/Cite";

type ArenaPlayer = { id: string; rating: number; low: number; high: number; battles: number; wins: number; median_per1k: number; clean_share: number };
type Arena = { topics: number; method: string; players: ArenaPlayer[]; winrate: { order: string[]; matrix: Array<Array<number | null>> } };
type Bench = { source: { title: string; url: string; license: string; page?: string }; metric: { name: string; description: string; direction: string }; models: Array<{ name: string; lab: string; weights: string; value: number; note?: string }> };

const arena = (data as unknown as { arena: Arena | null }).arena;
const benchmarks = (data as unknown as { benchmarks: { benchmarks: Bench[] } | null }).benchmarks?.benchmarks ?? [];

const dist = (id: string) => {
  const m = mapModels.find((x) => x.id === id);
  return m ? Math.hypot(m.x, m.y) : null;
};
const nameOf = (id: string) => (id === "people" ? "Human" : modelById.get(id)?.name ?? id);
const brandOfId = (id: string) => (id === "people" ? "" : brandOf(modelById.get(id)?.family ?? ""));

export function ModelsPage() {
  const history = [...chronology.milestones].filter((m) => String(m.date) >= "2022-11").sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return (
    <div className="page">
      <h1>Models</h1>
      <p className="lede" style={{ marginTop: "var(--s3)" }}>
        Who writes most like a human? An arena of matched articles, every model shibbo has measured, and outside boards that cover more open and closed models.
      </p>

      {/* Newest releases (mostly unmeasured) are held back until more of them are measured; see Newest below. */}

      {arena && <ArenaSection a={arena} />}

      <section className="section" aria-labelledby="all-h">
        <h2 id="all-h">Every measured model</h2>
        <p className="lede" style={{ margin: "var(--s3) 0 var(--s5)" }}>
          2025–26 models come from Graphite’s matched articles; 2022–23 chat models were measured by shibbo on RAID against the human texts each was prompted from. Distance is each model’s place on the atlas, where 0 is human.
        </p>
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th>Model</th><th>Released</th><th>Measured on</th><th>Distance from human</th><th>Phrases over 2×</th></tr></thead>
            <tbody>
              {[...ordered].sort((a, b) => b.released.localeCompare(a.released)).map((m) => {
                const d = dist(m.id);
                return (
                  <tr key={m.id}>
                    <td className="name"><Link to={`/models/${m.id}`} className="model-link"><BrandIcon brand={brandOf(m.family)} size={16} />{m.name}</Link></td>
                    <td>{monthName(ym(m.released), "short")}</td>
                    <td>{m.source === "raid" ? <Cite title="RAID, 7 genres" url="https://github.com/liamdugan/raid" /> : <Cite title="Graphite, web articles" url={data.graphite.url} />}</td>
                    <td>{d === null ? "–" : <Bar v={d} color={familyColor(m.family)} />}</td>
                    <td>{m.tells.toLocaleString("en")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s3)" }}>
          The atlas axes come from 2025–26 vocabulary, so 2022–23 models sit closer to human than their own tells would put them. Phrase counts depend on how much text was measured and aren’t comparable across sources.
        </p>
      </section>

      {benchmarks.length > 0 && (
        <section className="section" aria-labelledby="other-h">
          <h2 id="other-h">Other boards</h2>
          <p className="lede" style={{ margin: "var(--s3) 0 var(--s5)" }}>
            Published measurements that cover more models, open and closed. Each uses its own prompts and scale, so read each board on its own.
          </p>
          <div className="boards">
            {benchmarks.map((b) => <Board key={b.source.title} b={b} />)}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="hist-h">
        <h2 id="hist-h">Release history since ChatGPT</h2>
        <details>
          <summary>{history.length} releases, newest first, each with its source</summary>
          <div className="table-scroll">
            <table className="ledger">
              <thead><tr><th>Date</th><th>System</th><th>Lab</th><th>Weights</th><th>Note</th></tr></thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{m.date}</td>
                    <td><span className="model-link"><BrandIcon brand={brandOf(m.lab ?? m.maker)} size={14} />{m.name}</span></td>
                    <td>{m.lab ?? m.maker}</td>
                    <td>{m.weights ?? <span className="muted">unconfirmed</span>}</td>
                    <td>{m.note} {m.source && <Cite title="" url={m.source.url} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}

function ArenaSection({ a }: { a: Arena }) {
  const lo = 780, hi = 1660;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <section className="section" aria-labelledby="arena-h">
      <h2 id="arena-h">The tell arena</h2>
      <p className="lede" style={{ margin: "var(--s3) 0 var(--s5)" }}>
        On each of {a.topics.toLocaleString("en")} held-out topics, every pair of writers meets once: the article with fewer tells per 1,000 words wins. Humans play too. Ratings use the Bradley–Terry model behind arena-style Elo; bars show 95% intervals.
      </p>
      <ol className="arena">
        {a.players.map((p, i) => (
          <li key={p.id} className={p.id === "people" ? "people" : undefined}>
            <span className="rank">{i + 1}</span>
            <span className="who">
              {p.id === "people" ? <span className="people-mark" aria-hidden="true" /> : <BrandIcon brand={brandOfId(p.id)} size={18} />}
              {p.id === "people" ? <b>Human</b> : <Link to={`/models/${p.id}`}>{nameOf(p.id)}</Link>}
            </span>
            <span className="rating-bar" aria-label={`rating ${p.rating}, 95% interval ${p.low} to ${p.high}`}>
              <i className="ci" style={{ left: `${x(p.low)}%`, width: `${Math.max(0.6, x(p.high) - x(p.low))}%` }} />
              <i className="pt" style={{ left: `${x(p.rating)}%`, background: p.id === "people" ? "var(--ink)" : familyColor(modelById.get(p.id)?.family ?? "") }} />
            </span>
            <span className="num">{p.rating}</span>
            <span className="num muted">{p.median_per1k.toFixed(1)} pts/1k</span>
          </li>
        ))}
      </ol>
      <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s3)" }}>
        pts/1k is the median tell weight per 1,000 words. The checker here uses a phrase list built from the other half of the topics only, so no article scores itself.
      </p>
      <h3 style={{ margin: "var(--s6) 0 var(--s3)" }}>Head to head</h3>
      <p className="muted" style={{ fontSize: "var(--t-1)", marginBottom: "var(--s3)" }}>How often the row writer’s article had fewer tells than the column writer’s, on the same topic.</p>
      <WinMatrix a={a} />
    </section>
  );
}

function WinMatrix({ a }: { a: Arena }) {
  const order = a.players.map((p) => p.id);
  const idx = new Map(a.winrate.order.map((id, i) => [id, i]));
  const cell = (r: string, c: string) => a.winrate.matrix[idx.get(r)!][idx.get(c)!];
  const tint = (v: number) => `color-mix(in oklab, ${v >= 0.5 ? "var(--under-4)" : "var(--over-3)"} ${Math.round(Math.abs(v - 0.5) * 200)}%, var(--neutral))`;
  return (
    <div className="table-scroll">
      <table className="matrix">
        <thead>
          <tr><th />{order.map((c) => <th key={c} scope="col" title={nameOf(c)}>{c === "people" ? <span className="people-mark" aria-label="Human" /> : <BrandIcon brand={brandOfId(c)} size={14} label={nameOf(c)} />}</th>)}</tr>
        </thead>
        <tbody>
          {order.map((r) => (
            <tr key={r}>
              <th scope="row">{nameOf(r)}</th>
              {order.map((c) => {
                const v = r === c ? null : cell(r, c);
                return <td key={c} style={v == null ? undefined : { background: tint(v), color: Math.abs(v - 0.5) > 0.3 ? "var(--sheet)" : undefined }}>{v == null ? "" : `${Math.round(v * 100)}`}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Board({ b }: { b: Bench }) {
  const higherWorse = /higher = more/.test(b.metric.direction);
  const rows = [...b.models].sort((p, q) => (higherWorse ? p.value - q.value : q.value - p.value)).slice(0, 24);
  const max = Math.max(...rows.map((r) => r.value));
  const human = b.models.find((m) => /human/i.test(m.name) || /human/i.test(m.lab));
  const humanMean = /human mean is ([\d.]+)/.exec(b.metric.direction)?.[1];
  const ref = human ? human.value : humanMean ? +humanMean : null;
  return (
    <figure className="board">
      <figcaption>
        <b>{b.metric.name}</b>
        <span className="muted">{higherWorse ? "Lower is closer to human." : ""}</span>
        <small><Cite title={`${b.source.title.split(" (")[0]}, ${b.source.license.split(" (")[0]}`} url={b.source.page ?? b.source.url} /></small>
      </figcaption>
      <ol>
        {rows.map((r) => (
          <li key={r.name} className={/human/i.test(r.name) ? "people" : undefined}>
            <span className="who">{/human/i.test(r.name) ? <span className="people-mark" aria-hidden="true" /> : <BrandIcon brand={brandOf(r.lab)} size={14} />}<span title={r.name}>{/human/i.test(r.name) ? "Human" : r.name.replace(/^[\w-]+\//, "")}</span></span>
            <span className="w">{r.weights === "open" ? "open" : r.weights === "closed" ? "closed" : ""}</span>
            <span className="bar"><i style={{ width: `${(r.value / max) * 100}%` }} />{ref !== null && <b style={{ left: `${Math.min(100, (ref / max) * 100)}%` }} title="human" />}</span>
            <span className="num">{r.value.toFixed(1)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 120, height: 8, background: "var(--neutral)", borderRadius: 2, position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", inset: 0, width: `${Math.min(100, v)}%`, background: color, borderRadius: "0 3px 3px 0" }} />
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
  const f = m.features ?? {};
  const player = arena?.players.find((p) => p.id === m.id);
  const rank = arena ? arena.players.findIndex((p) => p.id === m.id) + 1 : 0;
  return (
    <div className="page">
      <header className="entry-head">
        <Link className="crumb" to="/models">Models</Link>
        <h1 className="model-title"><BrandIcon brand={brandOf(m.family)} size={40} />{m.name}</h1>
        <p className="lede">
          {m.maker}, {monthName(ym(m.released))}.{" "}
          {m.source === "raid"
            ? `Measured by shibbo on ${(m.docs ?? 0).toLocaleString("en")} RAID texts against the human texts they were prompted from.`
            : `${m.tells.toLocaleString("en")} measured tells${prev && m.shared !== null ? `, ${Math.round(m.shared * 100)}% of them shared with ${prev.name}` : ""}.`}
          {dist(m.id) !== null && ` Distance from human on the atlas: ${Math.round(dist(m.id)!)} of 100.`}
        </p>
        {dist(m.id) !== null && (
          <p style={{ marginTop: "var(--s4)" }}>
            <Link className="btn primary" to={`/?t=${m.released.slice(0, 7)}&focus=${m.id}`}>Show on the map</Link>
          </p>
        )}
      </header>
      {player && (
        <p className="arena-callout">
          Arena rating <b>{player.rating}</b> ({player.low} to {player.high}), rank {rank} of {arena!.players.length} including human. Median {player.median_per1k.toFixed(1)} tell points per 1,000 words.
        </p>
      )}
      {f["layer1__punct_emdash_per1k"] && (
        <dl className="facts">
          <dt>Em dashes</dt><dd>{f["layer1__punct_emdash_per1k"].mean.toFixed(2)} per 1,000 words (human: {f["layer1__punct_emdash_per1k"].human.toFixed(2)})</dd>
          <dt>“Delve”</dt><dd>{f["layer5__llm_delve_per1k"].mean.toFixed(3)} per 1,000 words (human: {f["layer5__llm_delve_per1k"].human.toFixed(3)})</dd>
          <dt>Ending that mirrors the opening</dt><dd>{(f["layer5__selfref_last_mirrors_first"].mean * 100).toFixed(0)}% of articles (human: {(f["layer5__selfref_last_mirrors_first"].human * 100).toFixed(0)}%)</dd>
        </dl>
      )}
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
          <h2 style={{ fontSize: "var(--t2)", marginBottom: "var(--s4)" }}>Phrases humans use and it avoids</h2>
          <ul className="phrases" style={{ columns: 1 }}>
            {m.under.slice(0, 16).map((e) => (
              <li key={e.term}><span className="specimen">“{e.term}”</span><span className="n">{e.floor ? `0 vs ${e.count}` : fmtRatio(e.ratio)}</span></li>
            ))}
          </ul>
        </section>
      </div>
      {m.rules && (
        <section className="section">
          <h2 style={{ fontSize: "var(--t2)" }}>Rules for prompts</h2>
          <p className="lede" style={{ margin: "var(--s3) 0 var(--s4)" }}>What <code>shibbo rules --model {m.id}</code> prints, ranked by this model’s measured rates.</p>
          <pre><code>{m.rules}</code></pre>
        </section>
      )}
      <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s5)" }}>
        {m.source === "raid"
          ? <>Measured by shibbo on <Cite title="RAID (Dugan et al., ACL 2024), MIT" url="https://github.com/liamdugan/raid" />. Ratios compare this model’s generations with the human texts they were prompted from.</>
          : <>“411 vs 0” counts raw uses in Graphite’s articles when one side never used the phrase. Data from <Cite title="Graphite, AI Tells (2026)" url={data.graphite.url} />.</>}
      </p>
    </div>
  );
}

/** The latest releases from each lab, measured or not, so the page keeps up with what people use now. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Newest() {
  const measuredBy = new Map(ordered.map((m) => [m.name.toLowerCase(), m]));
  const cutoff = `${new Date().getFullYear() - 1}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const recent = chronology.milestones
    .filter((m) => String(m.date) >= cutoff && m.lab)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const perLab = new Map<string, typeof recent>();
  for (const m of recent) {
    const k = m.lab!;
    if ((perLab.get(k)?.length ?? 0) < 4) perLab.set(k, [...(perLab.get(k) ?? []), m]);
  }
  const rows = [...perLab.values()].flat().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 32);
  const measured = rows.filter((m) => measuredBy.has(m.name.toLowerCase())).length;
  return (
    <section className="section" aria-labelledby="new-h" style={{ paddingTop: "var(--s6)" }}>
      <h2 id="new-h">Newest releases</h2>
      <p className="lede" style={{ margin: "var(--s3) 0 var(--s5)" }}>
        The latest from each lab in the past year. {measured ? `${measured} of these have measured tells.` : "None of these has measured tells yet."} The rest wait for matched articles; <Link to="/docs/guide/measure">measuring a model</Link> takes about 300.
      </p>
      <ul className="newest">
        {rows.map((m) => {
          const mm = measuredBy.get(m.name.toLowerCase());
          return (
            <li key={m.id}>
              <span className="ic"><BrandIcon brand={brandOf(m.lab ?? "")} size={22} /></span>
              <span className="body">
                <span className="nm">{mm ? <Link to={`/models/${mm.id}`}>{m.name}</Link> : m.name}</span>
                <span className="meta">
                  {m.source?.url ? <a href={m.source.url} title={m.source.title}>{monthName(ym(String(m.date).slice(0, 7)), "short")}</a> : monthName(ym(String(m.date).slice(0, 7)), "short")}
                  {m.weights === "open" ? ", open weights" : ""}
                </span>
                <span className={`tag${mm ? " on" : ""}`}>{mm ? "measured" : "not measured yet"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
