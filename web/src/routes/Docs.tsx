import { useMemo } from "react";
import { Cite } from "../components/Cite";
import { NavLink, useParams, Link } from "react-router-dom";
import { marked } from "marked";
import start from "../content/start.md?raw";
import cli from "../content/cli.md?raw";
import claudeCode from "../content/claude-code.md?raw";
import mcp from "../content/mcp.md?raw";
import registry from "../content/registry.md?raw";
import method from "../content/method.md?raw";
import { data, ordered, chronology } from "../data";

const PAGES: Array<{ id: string; title: string; md?: string }> = [
  { id: "start", title: "Get started", md: start },
  { id: "cli", title: "Command line", md: cli },
  { id: "claude-code", title: "Claude Code", md: claudeCode },
  { id: "mcp", title: "MCP", md: mcp },
  { id: "registry", title: "The registry", md: registry },
  { id: "method", title: "Method", md: method },
  { id: "sources", title: "Sources" },
];

export function DocsPage() {
  const { page = "start" } = useParams();
  const p = PAGES.find((x) => x.id === page) ?? PAGES[0];
  const html = useMemo(() => (p.md ? (marked.parse(p.md, { async: false }) as string) : ""), [p]);
  return (
    <div className="page docs">
      <aside>
        <nav aria-label="Docs">
          {PAGES.map((x) => (
            <NavLink key={x.id} to={`/docs/${x.id}`} className={({ isActive }) => (isActive || (x.id === "start" && !page) ? "active" : "")}>
              {x.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <article className="prose">
        {p.md && <div dangerouslySetInnerHTML={{ __html: html }} />}
        {p.id === "method" && <EvalTable />}
        {p.id === "sources" && <Sources />}
      </article>
    </div>
  );
}

function EvalTable() {
  const e = data.eval;
  if (!e) return null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <>
      <h2>Results on {e.topics.test.toLocaleString("en")} held-out topics</h2>
      <p>
        AUC is the chance that a model’s article scores worse than a person’s; 0.5 is a coin flip. “Flagged” is the share scoring under 80. With the model named, the human articles were checked under the same setting.
      </p>
      <table>
        <thead>
          <tr><th>Writer</th><th>AUC</th><th>Flagged</th><th>AUC, rules only</th><th>AUC, model named</th><th>People flagged, model named</th></tr>
        </thead>
        <tbody>
          <tr><td>People</td><td>–</td><td>{pct(e.test.default.human.flagged)}</td><td>–</td><td>–</td><td>–</td></tr>
          {ordered.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{e.test.default[m.id].auc.toFixed(3)}</td>
              <td>{pct(e.test.default[m.id].flagged)}</td>
              <td>{e.test.registry_only[m.id].auc.toFixed(3)}</td>
              <td>{e.test.model_aware[m.id].auc.toFixed(3)}</td>
              <td>{e.test.model_aware[m.id].human_flagged !== undefined ? pct(e.test.model_aware[m.id].human_flagged!) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Naming the model ranks articles better but flags about one human article in four, because the score scale was fit without it. Recalibrating that mode is the next fix.
      </p>
    </>
  );
}

function Sources() {
  const reg = Object.entries(data.sources).filter(([, s]) => s.url);
  const hist = [...new Map([...chronology.tells.map((t) => t.source), ...chronology.milestones.flatMap((m) => (m.source ? [m.source] : []))].map((s) => [s.url, s])).values()].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <>
      <h1>Sources</h1>
      <p>
        The measured layer comes from one study. Everything else cites its own source, listed here. <Link to="/docs/method">Method</Link> explains how each is used.
      </p>
      <h2>Measurements</h2>
      <p>
        Graphite, <a href={data.graphite.url}>“AI Tells”</a> (2026). License: {data.graphite.license}. Used for every per-model ratio, the atlas, and the phrase list in the checker.
      </p>
      <h2>Registry sources</h2>
      <ul>
        {reg.map(([k, s]) => <li key={k}><Cite title={s.title} url={s.url} /> <span className="muted">({s.kind})</span></li>)}
      </ul>
      {hist.length > 0 && (
        <>
          <h2>Timeline sources</h2>
          <ul>{hist.map((s) => <li key={s.url}><Cite title={s.title} url={s.url} /></li>)}</ul>
        </>
      )}
    </>
  );
}
