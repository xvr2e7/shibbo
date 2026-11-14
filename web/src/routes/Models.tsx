import { Link, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { data, ordered, modelById, familyColor, monthName, ym, fmtRatio, chronology, isOwnRun, expected, type Model, type Milestone } from "../data";
import { models as mapModels } from "../components/AtlasMap";
import { BrandIcon, brandOf } from "../components/BrandIcon";
import { Cite } from "../components/Cite";
import uiMap from "../data/ui-map.json";
import "../styles/models.css";

/** battles and wins count only the battles the rating used: those against people and Graphite's models. */
type ArenaPlayer = {
  id: string; source?: string; topics?: number; rating: number; low: number; high: number; battles: number; wins: number; median_per1k: number; clean_share: number; human_median_per1k?: number; win_vs_people?: number | null;
  /** A Graphite model written again under shibbo's prompt: `model` is the Graphite model, `name` the row label. */
  bridge?: boolean; model?: string; name?: string;
  /** Rank under each scoring, and the best and worst of the three. */
  ranks?: { total: number; registry: number; lexicon: number }; rank_range?: [number, number];
};
type Offset = { model: string; name: string; bridge_rating: number; graphite_rating: number; offset: number; low: number; high: number; shared_topics: number; win_rate: number; win_low: number; win_high: number };
type Arena = {
  topics: number; method: string; players: ArenaPlayer[]; winrate: { order: string[]; matrix: Array<Array<number | null>> };
  leave_own_out?: boolean;
  scoring?: { spearman_registry_lexicon: number; spearman_models: number; people_first_in_all: boolean; triad_share_of_rule_points?: number };
  prompt_offset?: { mean: number; models: Offset[] } | null;
};
type Bench = { source: { title: string; url: string; license: string; page?: string }; metric: { name: string; description: string; direction: string }; models: Array<{ name: string; lab: string; weights: string; value: number; note?: string }> };

const arena = (data as unknown as { arena: Arena | null }).arena;
const benchmarks = (data as unknown as { benchmarks: { benchmarks: Bench[] } | null }).benchmarks?.benchmarks ?? [];

const dist = (id: string) => {
  const m = mapModels.find((x) => x.id === id);
  return m ? Math.hypot(m.x, m.y) : null;
};
/** Arena writers by id. A bridge row has its own id and points at the model that wrote it. */
const arenaPlayer = new Map((arena?.players ?? []).map((p) => [p.id, p]));
const modelOf = (id: string) => modelById.get(arenaPlayer.get(id)?.model ?? id);
const nameOf = (id: string) => (id === "people" ? "Human" : arenaPlayer.get(id)?.name?.replace(/'/g, "’") ?? modelOf(id)?.name ?? id);
const brandOfId = (id: string) => (id === "people" ? "" : brandOf(modelOf(id)?.family ?? ""));
/** "+26" or "−12": a rating gap with its sign. */
const signed = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v)}`;
/** "3" or "3–9". */
const rangeText = (r?: [number, number]) => (!r ? "" : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number) => v.toLocaleString("en");
/** Graphite's topics: the two halves of the eval split. Null when the registry has no eval block. */
const GRAPHITE_TOPICS = data.eval ? data.eval.topics.train + data.eval.topics.test : null;
const RAID_URL = "https://github.com/liamdugan/raid";
const dayName = (d?: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
/** "289" or "286 to 292". */
const span = (xs: number[]) => { const lo = Math.min(...xs), hi = Math.max(...xs); return lo === hi ? n(lo) : `${n(lo)} to ${n(hi)}`; };
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** Where a model's measurements come from, in a word or two. */
function measuredOn(m: Model) {
  if (m.source === "raid") return <a href={RAID_URL}>RAID</a>;
  if (isOwnRun(m)) return <>shibbo{m.date ? `, ${monthName(ym(m.date), "short")}` : ""}</>;
  return <a href={data.graphite.url}>Graphite</a>;
}
const articlesOf = (m: Model) => (m.source === "raid" || isOwnRun(m) ? m.docs ?? null : GRAPHITE_TOPICS);

/** The one place a section explains how it was made. Closed by default. */
function Method({ children }: { children: ReactNode }) {
  return (
    <details className="method">
      <summary>Method</summary>
      <div className="method-body">{children}</div>
    </details>
  );
}

export function ModelsPage() {
  const history = [...chronology.milestones].filter((m) => String(m.date) >= "2022-11").sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const graphite = ordered.filter((m) => m.source !== "raid" && m.source !== "local" && !isOwnRun(m));
  const own = ordered.filter(isOwnRun);
  const raid = ordered.filter((m) => m.source === "raid");
  return (
    <div className="page models-page">
      <h1>Models</h1>

      {arena && <ArenaSection a={arena} />}

      <Newest />

      <section className="section" aria-labelledby="all-h">
        <h2 id="all-h">Every measured model</h2>
        <div className="table-scroll">
          <table className="ledger">
            <thead><tr><th scope="col">Model</th><th scope="col">Released</th><th scope="col">Articles</th><th scope="col">Distance from human</th><th scope="col">Phrases over 2×</th></tr></thead>
            <tbody>
              {[...ordered].sort((a, b) => b.released.localeCompare(a.released)).map((m) => {
                const d = dist(m.id);
                const docs = articlesOf(m);
                return (
                  <tr key={m.id}>
                    <td className="name"><Link to={`/models/${m.id}`} className="model-link"><BrandIcon brand={brandOf(m.family)} size={16} />{m.name}</Link></td>
                    <td>{monthName(ym(m.released), "short")}</td>
                    <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>{docs === null ? "–" : n(docs)}</td>
                    <td>{d === null ? "–" : <Bar v={d} color={familyColor(m.family)} />}</td>
                    <td>{n(m.tells)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint after">Distance is each model’s place on the prose map; 0 is human. Counts from a few hundred articles and counts from thousands don’t compare directly. <Link to="/docs/concepts/data">How shibbo measures this</Link></p>
      </section>

      {benchmarks.length > 0 && (
        <section className="section" aria-labelledby="other-h">
          <h2 id="other-h">Other boards</h2>
          <p className="hint">Published elsewhere. Each board uses its own prompts and scale.</p>
          <div className="boards">
            {benchmarks.map((b) => <Board key={b.source.title} b={b} />)}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="hist-h">
        <h2 id="hist-h">Release history since ChatGPT</h2>
        <details>
          <summary>{history.length} releases, newest first</summary>
          <div className="table-scroll">
            <table className="ledger">
              <thead><tr><th scope="col">Date</th><th scope="col">System</th><th scope="col">Lab</th><th scope="col">Weights</th><th scope="col">Note</th></tr></thead>
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
  const lo = Math.floor(Math.min(780, ...a.players.map((p) => p.low)) / 20) * 20 - 20, hi = Math.ceil(Math.max(1660, ...a.players.map((p) => p.high)) / 20) * 20 + 20;
  // One row per model. A model shibbo ran a second time under its own prompt is a method check; the docs cover it.
  const players = a.players.filter((p) => !p.bridge);
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <>
      <section className="section first" aria-labelledby="arena-h">
        <h2 id="arena-h">The tell arena</h2>
        <p className="hint">Fewer tells per 1,000 words wins each matched pair. Bars show 95% intervals.</p>
        <div className="arena-head" aria-hidden="true"><span /><span>Writer</span><span>Rating, 95% interval</span><span className="num">Rating</span><span className="num">±</span><span className="num">Tell points per 1,000 words</span></div>
        <ol className="arena" aria-label="Writers ranked by arena rating">
          {players.map((p, i) => (
            <li key={p.id} className={p.id === "people" ? "people" : undefined}>
              <span className="rank">{i + 1}</span>
              <span className="who">
                {p.id === "people" ? <span className="people-mark" aria-hidden="true" /> : <BrandIcon brand={brandOfId(p.id)} size={18} />}
                {p.id === "people" ? <b>Human</b> : <Link to={`/models/${p.model ?? p.id}`}>{nameOf(p.id)}</Link>}
              </span>
              <span className="rating-bar" role="img" aria-label={`rating ${p.rating}, 95% interval ${p.low} to ${p.high}`}>
                <i className="ci" style={{ left: `${x(p.low)}%`, width: `${Math.max(0.6, x(p.high) - x(p.low))}%` }} />
                <i className="pt" style={{ left: `${x(p.rating)}%`, background: p.id === "people" ? "var(--ink)" : familyColor(modelOf(p.id)?.family ?? "") }} />
              </span>
              <span className="num">{p.rating}</span>
              <span className="num muted" title={`${p.low} to ${p.high}`}>±{Math.round((p.high - p.low) / 2)}</span>
              <span className="num muted" title="median tell points per 1,000 words">{p.median_per1k.toFixed(1)}</span>
            </li>
          ))}
        </ol>
        <p className="hint after">People and models wrote on the same {n(a.topics)} topics. Every pair meets once per topic, and the ratings come from those wins. <Link to="/docs/concepts/data">How shibbo measures this</Link></p>
      </section>
      <section className="section" aria-labelledby="h2h-h">
        <h2 id="h2h-h">Head to head</h2>
        <p className="hint">Percent of shared topics where the row’s article had fewer tells than the column’s.</p>
        <WinMatrix a={a} />
      </section>
    </>
  );
}

function WinMatrix({ a }: { a: Arena }) {
  const order = a.players.filter((p) => !p.bridge).map((p) => p.id);
  const idx = new Map(a.winrate.order.map((id, i) => [id, i]));
  const cell = (r: string, c: string) => a.winrate.matrix[idx.get(r)!][idx.get(c)!];
  const tint = (v: number) => `color-mix(in oklab, ${v >= 0.5 ? "var(--under-4)" : "var(--over-3)"} ${Math.round(Math.abs(v - 0.5) * 200)}%, var(--neutral))`;
  return (
    <div className="table-scroll">
      <table className="matrix" aria-labelledby="h2h-h">
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
  /** "higher = more slop (…)" -> "Higher = more slop". */
  const dir = b.metric.direction.split(" (")[0].replace(/^./, (c) => c.toUpperCase());
  return (
    <figure className="board" aria-label={b.metric.name}>
      <figcaption>
        <b>{b.metric.name}</b>
        <span className="muted">{dir}{ref !== null ? "; the tick marks human" : ""}</span>
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
  const own = isOwnRun(m);
  const st = m.style, hs = m.human_style;
  const d = dist(m.id);
  const ui = uiApi.find((u) => names(norm(u.name), norm(m.name)));
  return (
    <div className="page model-page">
      <header className="entry-head">
        <Link className="crumb" to="/models">Models</Link>
        <h1 className="model-title"><BrandIcon brand={brandOf(m.family)} size={40} />{m.name}</h1>
        <p className="lede">{m.maker}, {monthName(ym(m.released))}</p>
        {d !== null && (
          <p style={{ marginTop: "var(--s4)" }}>
            <Link className="btn primary" to={`/?t=${m.released.slice(0, 7)}&focus=${m.id}`}>Show on the map</Link>
          </p>
        )}
      </header>
      <dl className="facts">
        <dt>Prose</dt>
        <dd>
          {m.source === "raid"
            ? <><a href={RAID_URL}>RAID</a>: {n(m.docs ?? 0)} texts, against the human texts they were prompted from</>
            : own
            ? <>shibbo’s run through the API, {dayName(m.date)}: {n(m.docs ?? 0)} articles, each against the human article on the same held-out topic</>
            : <><a href={data.graphite.url}>Graphite</a>{GRAPHITE_TOPICS ? `: ${n(GRAPHITE_TOPICS)} topics` : ""}; {n(m.tells)} measured tells{prev && m.shared !== null ? `, ${Math.round(m.shared * 100)}% shared with ${prev.name}` : ""}</>}
        </dd>
        {ui && <><dt>Interface</dt><dd><Link to="/?layer=interface">{ui.pages} pages</Link> from shibbo’s run, one per brief, no system prompt</dd></>}
        {d !== null && <><dt>Distance from human</dt><dd>{Math.round(d)} of 100 on the atlas</dd></>}
        {player && (
          <>
            <dt>Arena</dt>
            <dd>
              Rating <b>{player.rating}</b> ({player.low} to {player.high}), rank {rank} of {arena!.players.length} with human
              {player.rank_range && player.rank_range[0] !== player.rank_range[1] ? `; ${player.rank_range[0]} to ${player.rank_range[1]} across the three scorings` : ""}
              {own ? `, from ${n(player.battles)} battles on ${player.topics} topics` : ""}
            </dd>
            <dt>Tell points</dt>
            <dd>
              Median {player.median_per1k.toFixed(1)} per 1,000 words
              {own && player.human_median_per1k !== undefined ? ` (human, same topics: ${player.human_median_per1k.toFixed(1)})` : ""}
              {own && player.win_vs_people != null ? `; fewer tells than the human article on ${Math.round(player.win_vs_people * 100)}% of topics` : ""}
            </dd>
          </>
        )}
        {own && st && hs && (
          <>
            <dt>Em dashes</dt><dd>{st.emdash_per1k.toFixed(2)} per 1,000 words (human, same topics: {hs.emdash_per1k.toFixed(2)})</dd>
            <dt>“Delve”</dt><dd>{st.delve_per1k.toFixed(3)} per 1,000 words (human: {hs.delve_per1k.toFixed(3)})</dd>
            <dt>Contractions</dt><dd>{st.contractions_per1k.toFixed(1)} per 1,000 words (human: {hs.contractions_per1k.toFixed(1)})</dd>
          </>
        )}
        {f["layer1__punct_emdash_per1k"] && (
          <>
            <dt>Em dashes</dt><dd>{f["layer1__punct_emdash_per1k"].mean.toFixed(2)} per 1,000 words (human: {f["layer1__punct_emdash_per1k"].human.toFixed(2)})</dd>
            <dt>“Delve”</dt><dd>{f["layer5__llm_delve_per1k"].mean.toFixed(3)} per 1,000 words (human: {f["layer5__llm_delve_per1k"].human.toFixed(3)})</dd>
            <dt>Ending that mirrors the opening</dt><dd>{(f["layer5__selfref_last_mirrors_first"].mean * 100).toFixed(0)}% of articles (human: {(f["layer5__selfref_last_mirrors_first"].human * 100).toFixed(0)}%)</dd>
          </>
        )}
      </dl>
      {own && (
        <p className="arena-callout">
          A small sample: {n(m.docs ?? 0)} articles{GRAPHITE_TOPICS ? `, against ${n(GRAPHITE_TOPICS)} per model in Graphite’s data` : ""}. Rare phrases and small gaps don’t show at this size, and figures will shift as more articles come in.
        </p>
      )}
      <div className="two">
        <section>
          <h2 style={{ fontSize: "var(--t2)", marginBottom: "var(--s4)" }}>Phrases it over-uses</h2>
          <ul className="phrases" style={{ columns: 1 }}>
            {m.top.filter((e) => e.kind === "ngram" && (!own || e.term.includes(" ") || e.ratio >= 10)).slice(0, 16).map((e) => (
              <li key={e.term}><span className="specimen">“{e.term}”</span><span className="n">{own ? `${e.count} vs ${e.human_count}` : e.floor ? `${e.count} vs 0` : fmtRatio(e.ratio)}</span></li>
            ))}
          </ul>
        </section>
        <section>
          <h2 style={{ fontSize: "var(--t2)", marginBottom: "var(--s4)" }}>Phrases humans use and it avoids</h2>
          <ul className="phrases" style={{ columns: 1 }}>
            {m.under.slice(0, 16).map((e) => (
              <li key={e.term}><span className="specimen">“{e.term}”</span><span className="n">{own ? `${e.model_count ?? e.count} vs ${e.human_count}` : e.floor ? `0 vs ${e.count}` : fmtRatio(e.ratio)}</span></li>
            ))}
          </ul>
        </section>
      </div>
      {m.rules && (
        <section className="section">
          <h2 style={{ fontSize: "var(--t2)" }}>Rules for prompts</h2>
          <p className="hint"><code>shibbo rules --model {m.id}</code></p>
          <pre><code>{m.rules}</code></pre>
        </section>
      )}
      <p className="muted" style={{ fontSize: "var(--t-1)", marginTop: "var(--s5)" }}>
        {m.source === "raid"
          ? <>Measured by shibbo on <Cite title="RAID (Dugan et al., ACL 2024), MIT" url={RAID_URL} />. Ratios compare this model’s generations with the human texts they were prompted from.</>
          : own
          ? <>Paired counts such as “44 vs 0” are raw uses in this model’s {m.docs} articles, then in the human articles on the same topics, from <Cite title="Graphite, AI Tells (2026)" url={data.graphite.url} />. Each phrase passed a paired sign test over those topics (q &lt; 0.01). Each model got a title for the topic (GPT-4.1’s, from Graphite’s data, dropped before counting) and the human article’s length (<a href="https://github.com/xvr2e7/shibbo/tree/main/measure">measure/</a>).</>
          : <>Paired counts such as “411 vs 0” are raw uses in Graphite’s articles when one side never used the phrase. Data from <Cite title="Graphite, AI Tells (2026)" url={data.graphite.url} />.</>}
      </p>
    </div>
  );
}

/** Lower-case, hyphens as spaces, parentheticals dropped: "DeepSeek-V4-Pro (GA)" -> "deepseek v4 pro". */
const norm = (x: string) => x.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
/** a names b, or b names a, at word boundaries ("gemma 4" names "gemma 4 31b"; "claude opus 5" doesn't name "claude opus 5.5"). */
const names = (a: string, b: string) => {
  const has = (h: string, n: string) => { const k = h.indexOf(n); return k >= 0 && (k === 0 || h[k - 1] === " ") && (k + n.length === h.length || h[k + n.length] === " "); };
  return has(a, b) || has(b, a);
};
/** The measured models a chronology release covers ("Claude Fable 5.2 and Claude Mythos 5.2" covers Claude Fable 5.2). */
function measuredFor(r: Milestone): Model[] {
  const parts = r.name.split(/ and |, /).map(norm);
  return ordered.filter((m) => m.source !== "raid" && m.source !== "local" && parts.some((p) => names(p, norm(m.name))));
}

/** Interface pages shibbo has for a release: bare API runs on the interface map. */
const uiApi = (uiMap.models as { id: string; route: string; name: string; pages: number }[]).filter((m) => m.route === "api");
function uiFor(r: Milestone) {
  const parts = r.name.split(/ and |, /).map(norm);
  return uiApi.find((m) => parts.some((p) => names(p, norm(m.name))));
}

/** The latest releases from each lab, once shibbo has measured them, by Graphite's articles, its own runs, or interface pages. */
export function Newest() {
  const cutoff = `${new Date().getFullYear() - 1}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const recent = chronology.milestones
    .filter((m) => String(m.date) >= cutoff && m.lab)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  // Only releases shibbo has measured, by prose or by interface pages; the rest stay off until a run lands.
  const rows = recent.filter((m) => measuredFor(m).length || uiFor(m)).slice(0, 28);
  const ownCount = rows.filter((m) => measuredFor(m).some(isOwnRun)).length;
  const uiCount = rows.filter((m) => uiFor(m)).length;
  const briefs = Object.keys((uiMap as { briefs?: Record<string, unknown> }).briefs ?? {}).length;
  return (
    <section className="section" aria-labelledby="new-h">
      <h2 id="new-h">Newest releases</h2>
      <ul className="newest">
        {rows.map((r) => {
          const m0 = measuredFor(r)[0];
          const ui = uiFor(r);
          const prose = !m0 ? "" : isOwnRun(m0) ? `shibbo’s run: ${n(m0.docs ?? 0)} articles, ${dayName(m0.date)}` : `Graphite${GRAPHITE_TOPICS ? `: ${n(GRAPHITE_TOPICS)} topics` : ""}`;
          return (
            <li key={r.id} className={m0 ? "linked" : undefined}>
              <span className="ic"><BrandIcon brand={brandOf(r.lab ?? "")} size={22} /></span>
              <span className="body">
                <span className="nm">{m0 ? <Link to={`/models/${m0.id}`}>{r.name}</Link> : r.name}</span>
                <span className="meta">
                  {r.source?.url ? <a href={r.source.url} title={r.source.title}>{dayName(String(r.date))}</a> : dayName(String(r.date))}
                  {r.weights === "open" ? ", open weights" : ""}
                </span>
                <span className="layers">
                  {prose && <span className="layer" title={prose}>Prose</span>}
                  {ui && <Link className="layer" to="/?layer=interface" title={`shibbo’s run: ${ui.pages} pages`}>Interface</Link>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <Method>
        <p>
          Releases from the past year that shibbo has measured, newest first. A release joins once its run lands; see <Link to="/docs/guide/measure">measuring a model</Link>.
        </p>
        {expected.length > 0 && <p>Reported models are ones the press says are coming and the maker has yet to confirm. They stay off the timeline until a maker’s own page gives a date.</p>}
      </Method>
      {expected.length > 0 && (
        <>
          <h3 className="sub">Reported, unconfirmed</h3>
          <ul className="newest">
            {expected.map((e) => (
              <li key={e.id}>
                <span className="ic"><BrandIcon brand={brandOf(e.maker)} size={22} /></span>
                <span className="body">
                  <span className="nm">{e.name}</span>
                  <span className="meta"><a href={e.source.url} title={e.claim}>{host(e.source.url) || "report"}</a>, {dayName(String(e.source.date))}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
