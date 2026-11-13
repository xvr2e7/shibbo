// Measure a model's interface defaults: the same one-line briefs, one reply each, HTML out. No tools, no harness,
// no style hints, so the pages show what the model picks unprompted, and every model gets the same request.
//
//   npx tsx measure/generate-ui.ts --model claude-sonnet-4-5 [--via claude-cli|openrouter|anthropic|openai] [--reps 1] [--jobs 4] [--budget USD]
// --budget stops sending once this run's reported spend reaches the cap (OpenRouter reports cost per reply).
//
// --via claude-cli (default for claude-* ids) runs the local Claude Code binary with tools off and user settings
// out, on your subscription. openrouter, anthropic and openai call the APIs with keys from the environment or .env.
// Output: measure/ui-runs/<model>/ (Claude Code) or measure/ui-runs-api/<model>/ (APIs), one <brief>__<rep>/ folder per page
// with index.html plus run.json. --batch (anthropic, openai) submits at half price; rerun the same command to collect. Pages stay local (git-ignored); only
// derived measurements get published. A reply from a different model than asked is saved but flagged.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { root } from "../src/registry.js";

const { values } = parseArgs({ options: { model: { type: "string" }, via: { type: "string" }, reps: { type: "string", default: "1" }, jobs: { type: "string", default: "4" }, brief: { type: "string" }, budget: { type: "string" }, batch: { type: "boolean", default: false } } });
if (!values.model) { console.error("usage: generate-ui.ts --model <id> [--via claude-cli|openrouter|anthropic|openai]"); process.exit(2); }
const R = root();
const spec = YAML.parse(readFileSync(join(R, "measure/ui-briefs.yaml"), "utf8")) as { version: number; instruction: string; briefs: Array<{ id: string; kind: string; brief: string }> };
const model = values.model;
const via = values.via ?? (model.startsWith("claude-") ? "claude-cli" : "openrouter");
const briefs = spec.briefs.filter((b) => !values.brief || values.brief.split(",").includes(b.id));
const reps = +values.reps!;
const prompt = (b: { brief: string }) => `${b.brief}\n\n${spec.instruction}`;
const env = (k: string) => process.env[k] ?? (existsSync(join(R, ".env")) ? readFileSync(join(R, ".env"), "utf8").match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n]+)"?`, "m"))?.[1]?.trim() : undefined);

/** Pull the HTML document out of a reply (fenced or bare). */
function html(text: string): string | null {
  // Some replies arrive JSON-escaped (literal \n and \"): undo that when the text has escapes but few real line breaks.
  if ((text.match(/\\n/g)?.length ?? 0) > 20 && (text.match(/\n/g)?.length ?? 0) < 5) {
    try { text = JSON.parse(`"${text.replace(/^"|"$/g, "")}"`); } catch { text = text.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\"); }
  }
  const fence = text.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.search(/<!doctype html|<html[\s>]/i);
  if (start < 0) return null;
  const end = body.toLowerCase().lastIndexOf("</html>");
  return body.slice(start, end > start ? end + 7 : undefined);
}

type Reply = { text: string; model: string | null; outputTokens: number | null; costUSD: number | null; stop: string | null };

function viaCli(p: string): Promise<Reply> {
  return new Promise((done) => {
    const args = ["-p", "--model", model, "--setting-sources", "project", "--strict-mcp-config", "--no-session-persistence",
      "--tools", "", "--output-format", "json", "--max-turns", "1", "--", p];
    const c = spawn("claude", args, { cwd: "/tmp", stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.on("close", () => {
      try {
        const j = JSON.parse(out);
        done({ text: j.result ?? "", model: Object.keys(j.modelUsage ?? {}).find((m) => !m.includes("haiku") || model.includes("haiku")) ?? null, outputTokens: j.usage?.output_tokens ?? null, costUSD: j.total_cost_usd ?? null, stop: j.subtype ?? null });
      } catch { done({ text: "", model: null, outputTokens: null, costUSD: null, stop: "parse-error" }); }
    });
  });
}

/** POST JSON. Retries 429, 5xx and dropped connections with backoff, then throws. The error carries the status and the start of the body, never headers. */
async function post(url: string, headers: Record<string, string>, body: unknown) {
  for (let n = 0; ; n++) {
    let r: Response | null = null, err = "";
    try { r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    if (r?.ok) return r.json();
    if (r) err = `HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`;
    if ((r && r.status !== 429 && r.status < 500) || n >= 3) throw new Error(err);
    const wait = Number(r?.headers.get("retry-after")) || 2 ** n * 2;
    await new Promise((d) => setTimeout(d, Math.min(wait, 60) * 1000));
  }
}

async function viaApi(p: string): Promise<Reply> {
  if (via === "anthropic") {
    const key = env("ANTHROPIC_API_KEY");
    if (!key) throw new Error(`no key for ${via}`);
    const j = await post("https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      { model, max_tokens: 32000, messages: [{ role: "user", content: p }] });
    return { text: (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"), model: j.model ?? null, outputTokens: j.usage?.output_tokens ?? null, costUSD: null, stop: j.stop_reason ?? j.error?.message ?? null };
  }
  const [url, key] = via === "openai" ? ["https://api.openai.com/v1/chat/completions", env("OPENAI_API_KEY")] : ["https://openrouter.ai/api/v1/chat/completions", env("OPENROUTER_API_KEY")];
  if (!key) throw new Error(`no key for ${via}`);
  const j = await post(url, { authorization: `Bearer ${key}`, "content-type": "application/json" },
    { model, messages: [{ role: "user", content: p }], ...(via === "openrouter" ? { usage: { include: true } } : {}) });
  return { text: j.choices?.[0]?.message?.content ?? "", model: j.model ?? null, outputTokens: j.usage?.completion_tokens ?? null, costUSD: j.usage?.cost ?? null, stop: j.choices?.[0]?.finish_reason ?? j.error?.message ?? null };
}

// Claude Code runs keep their own folder (its system prompt wraps every request); API runs share one, by bare model id.
const OUT = via === "claude-cli" ? join(R, "measure", "ui-runs", model) : join(R, "measure", "ui-runs-api", model.replace(/^[^/]+\//, ""));
const queue = briefs.flatMap((b) => Array.from({ length: reps }, (_, i) => ({ b, rep: i + 1 }))).filter(({ b, rep }) => !existsSync(join(OUT, `${b.id}__${rep}`, "run.json")));
let spent = 0;
const mismatchOf = (served: string | null) => !!served && !served.replace(/\./g, "-").includes(model.replace(/^[^/]+\//, "").replace(/\./g, "-"));
function record(b: { id: string; kind: string }, rep: number, reply: Reply, seconds: number, extra: Record<string, unknown> = {}) {
  // An empty reply is a failed call: leave no run.json, so the next run asks again.
  if (!reply.text.trim()) { console.error(`${model} ${b.id}#${rep}: empty reply (${reply.stop ?? "no reason given"}), will retry on the next run`); return; }
  const dir = join(OUT, `${b.id}__${rep}`);
  mkdirSync(dir, { recursive: true });
  const page = html(reply.text);
  if (page) writeFileSync(join(dir, "index.html"), page);
  else writeFileSync(join(dir, "reply.txt"), reply.text);
  const mismatch = mismatchOf(reply.model);
  writeFileSync(join(dir, "run.json"), JSON.stringify({ ...reply, ...extra, text: undefined, model, served: reply.model, mismatch, via, brief: b.id, kind: b.kind, rep, briefs_version: spec.version, ok: !!page && !/^(max_tokens|length)$/.test(String(reply.stop)), truncated: /^(max_tokens|length)$/.test(String(reply.stop)), seconds }, null, 1));
  console.log(`${model} ${b.id}#${rep}: ${page ? (/^(max_tokens|length)$/.test(String(reply.stop)) ? "CUT OFF" : "ok") : "NO HTML"}${mismatch ? ` (served by ${reply.model})` : ""} ${seconds}s $${spent.toFixed(2)}`);
}

// Batch mode (Anthropic, OpenAI): half price, results within 24 hours. First run submits; rerun the same command to collect.
if (values.batch) {
  if (via !== "anthropic" && via !== "openai") { console.error("--batch works with --via anthropic or openai"); process.exit(2); }
  mkdirSync(OUT, { recursive: true });
  const pending = join(OUT, "batch.json");
  const fnv = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const items = new Map(queue.map((q) => [`u${fnv(q.b.id + "#" + q.rep)}`, q]));
  const key = via === "anthropic" ? env("ANTHROPIC_API_KEY") : env("OPENAI_API_KEY");
  if (!key) { console.error(`no key for ${via}`); process.exit(1); }
  if (!existsSync(pending)) {
    if (!items.size) { console.log("nothing to send"); process.exit(0); }
    let id: string;
    if (via === "anthropic") {
      const requests = [...items].map(([custom_id, q]) => ({ custom_id, params: { model, max_tokens: 32000, messages: [{ role: "user", content: prompt(q.b) }] } }));
      const r = await fetch("https://api.anthropic.com/v1/messages/batches", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ requests }) });
      if (!r.ok) { console.error(`batch create ${r.status}: ${await r.text()}`); process.exit(1); }
      id = (await r.json()).id;
    } else {
      const jsonl = [...items].map(([custom_id, q]) => JSON.stringify({ custom_id, method: "POST", url: "/v1/chat/completions", body: { model, messages: [{ role: "user", content: prompt(q.b) }] } })).join("\n");
      const form = new FormData(); form.append("purpose", "batch"); form.append("file", new Blob([jsonl], { type: "application/jsonl" }), "requests.jsonl");
      const f = await fetch("https://api.openai.com/v1/files", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
      if (!f.ok) { console.error(`file upload ${f.status}: ${await f.text()}`); process.exit(1); }
      const r = await fetch("https://api.openai.com/v1/batches", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ input_file_id: (await f.json()).id, endpoint: "/v1/chat/completions", completion_window: "24h" }) });
      if (!r.ok) { console.error(`batch create ${r.status}: ${await r.text()}`); process.exit(1); }
      id = (await r.json()).id;
    }
    writeFileSync(pending, JSON.stringify({ via, id, created: new Date().toISOString(), items: Object.fromEntries([...items].map(([k, q]) => [k, `${q.b.id}#${q.rep}`])) }));
    console.log(`${model}: submitted batch ${id} (${items.size} pages). Rerun to collect.`);
    process.exit(0);
  }
  const p = JSON.parse(readFileSync(pending, "utf8"));
  const byKey = new Map(Object.entries(p.items as Record<string, string>).map(([k, v]) => { const [bid, rep] = v.split("#"); return [k, { b: briefs.find((x) => x.id === bid) ?? spec.briefs.find((x) => x.id === bid)!, rep: +rep }]; }));
  let lines: string[] = [];
  if (via === "anthropic") {
    const h = { "x-api-key": key, "anthropic-version": "2023-06-01" };
    const b = await (await fetch(`https://api.anthropic.com/v1/messages/batches/${p.id}`, { headers: h })).json();
    if (b.processing_status !== "ended") { console.log(`${model}: batch ${p.id} ${b.processing_status}`, JSON.stringify(b.request_counts)); process.exit(0); }
    lines = (await (await fetch(b.results_url, { headers: h })).text()).trim().split("\n");
    for (const l of lines) {
      const r = JSON.parse(l); const q = byKey.get(r.custom_id); if (!q) continue;
      if (r.result.type !== "succeeded") { console.error(`${q.b.id}: ${r.result.type} ${JSON.stringify(r.result.error ?? "")}`); continue; }
      const m = r.result.message;
      record(q.b, q.rep, { text: m.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"), model: m.model, outputTokens: m.usage?.output_tokens ?? null, costUSD: null, stop: m.stop_reason }, 0, { batch: p.id, usage: m.usage });
    }
  } else {
    const auth = { authorization: `Bearer ${key}` };
    const b = await (await fetch(`https://api.openai.com/v1/batches/${p.id}`, { headers: auth })).json();
    if (b.status !== "completed" && !["failed", "expired", "cancelled"].includes(b.status)) { console.log(`${model}: batch ${p.id} ${b.status}`, JSON.stringify(b.request_counts)); process.exit(0); }
    if (b.output_file_id) lines = (await (await fetch(`https://api.openai.com/v1/files/${b.output_file_id}/content`, { headers: auth })).text()).trim().split("\n");
    for (const l of lines) {
      const r = JSON.parse(l); const q = byKey.get(r.custom_id); if (!q) continue;
      if (r.error || r.response?.status_code !== 200) { console.error(`${q.b.id}: ${JSON.stringify(r.error ?? r.response?.body?.error)}`); continue; }
      const body = r.response.body;
      record(q.b, q.rep, { text: body.choices[0].message.content ?? "", model: body.model, outputTokens: body.usage?.completion_tokens ?? null, costUSD: null, stop: body.choices[0].finish_reason }, 0, { batch: p.id, usage: body.usage });
    }
  }
  writeFileSync(pending.replace("batch.json", `batch-${p.id}.done.json`), JSON.stringify(p));
  (await import("node:fs")).rmSync(pending);
  process.exit(0);
}

await Promise.all(Array.from({ length: +values.jobs! }, async () => {
  while (queue.length) {
    if (values.budget && spent >= +values.budget) { console.error(`stopping: spent $${spent.toFixed(2)} of --budget ${values.budget}`); queue.length = 0; break; }
    const { b, rep } = queue.shift()!;
    const t0 = Date.now();
    let reply: Reply;
    try { reply = via === "claude-cli" ? await viaCli(prompt(b)) : await viaApi(prompt(b)); } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      console.error(`${model} ${b.id}#${rep}: failed, will retry on the next run: ${why}`);
      if (/^no key|^HTTP 40[13]\b/.test(why)) { console.error("stopping: the key is missing or refused"); queue.length = 0; }
      continue;
    }
    spent += reply.costUSD ?? 0;
    record(b, rep, reply, Math.round((Date.now() - t0) / 1000));
  }
}));
