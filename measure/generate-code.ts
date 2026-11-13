// Measure a model's code defaults: the same one-line programming briefs, one reply each, code out. No tools, no
// harness, no style hints, so the replies show what the model writes unprompted, and every model gets the same request.
//
//   npx tsx measure/generate-code.ts --model claude-sonnet-5-5 [--via anthropic|openai|openrouter|claude-cli] [--reps 1] [--jobs 3] [--budget USD] [--brief a,b] [--batch] [--plan]
// --budget stops sending once this run's spend reaches the cap. OpenRouter reports cost per reply; for Anthropic and
//   OpenAI the script prices the reported usage with PRICE below (batch at half).
// --plan prints the cost of the replies still to fetch, from the mean output of the replies already saved for this
//   model (run a 2-brief trial first: --brief py-csv-dedupe,readme-tool).
// --batch (anthropic, openai) submits at half price; rerun the same command to collect.
//
// The default route is the bare API: anthropic for claude-*, openai for gpt-*, openrouter for the rest. --via claude-cli
// runs the local Claude Code binary with tools off, on your subscription, and saves to measure/code-runs/ instead.
// Output: measure/code-runs-api/<model>/<brief>__<rep>/ with reply.txt (the raw reply), files/ (the files pulled out of
// it) and run.json (served model, stop reason, usage, cost). Replies stay local (git-ignored); only derived
// measurements get published. A reply from a different model than asked is saved but flagged.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { root } from "../src/registry.js";

const { values } = parseArgs({ options: { model: { type: "string" }, via: { type: "string" }, reps: { type: "string", default: "1" }, jobs: { type: "string", default: "3" }, brief: { type: "string" }, budget: { type: "string" }, batch: { type: "boolean", default: false }, plan: { type: "boolean", default: false }, reextract: { type: "boolean", default: false }, "max-tokens": { type: "string", default: "16000" } } });
if (!values.model && !values.reextract) { console.error("usage: generate-code.ts --model <id> [--via anthropic|openai|openrouter|claude-cli]"); process.exit(2); }
const R = root();
type Brief = { id: string; kind: string; lang: string; brief: string };
const spec = YAML.parse(readFileSync(join(R, "measure/code-briefs.yaml"), "utf8")) as { version: number; instruction: string; briefs: Brief[] };
const model = values.model ?? "";
const via = values.via ?? (model.startsWith("claude-") ? "anthropic" : model.startsWith("gpt-") ? "openai" : "openrouter");
const briefs = spec.briefs.filter((b) => !values.brief || values.brief.split(",").includes(b.id));
const reps = +values.reps!;
const MAX = +values["max-tokens"]!;
const prompt = (b: { brief: string }) => `${b.brief}\n\n${spec.instruction}`;
const env = (k: string) => process.env[k] ?? (existsSync(join(R, ".env")) ? readFileSync(join(R, ".env"), "utf8").match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n]+)"?`, "m"))?.[1]?.trim() : undefined);

// USD per million tokens [input, output], from the makers' pages and OpenRouter's model list, 2026-11-10.
const PRICE: Record<string, [number, number]> = {
  "claude-fable-5-2": [8, 40], "claude-fable-5-1": [10, 50], "claude-opus-5-5": [4, 20], "claude-opus-5": [5, 25], "claude-sonnet-5-5": [2, 10], "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5], "claude-opus-4-6": [5, 25], "claude-sonnet-4-6": [3, 15], "claude-opus-4-5-20251101": [5, 25], "claude-sonnet-4-5-20250929": [3, 15], "claude-haiku-4-5-20251001": [1, 5],
  "gpt-6.1-sol": [2, 10], "gpt-6.1-terra": [1, 5], "gpt-6-astra": [10, 50], "gpt-6-sol": [2, 10], "gpt-6-luna": [0.1, 0.5],
};
const priced = (inp: number, out: number, batch: boolean) => { const p = PRICE[model]; return p ? ((inp * p[0] + out * p[1]) / 1e6) * (batch ? 0.5 : 1) : null; };

/** Pull the files out of a reply: "name" line then a fenced block, repeated; or a bare name line then the contents. */
export function files(text: string, b: Brief): Array<{ name: string; body: string }> {
  const EXT: Record<string, string> = { python: "py", typescript: "ts", javascript: "js", go: "go", sql: "sql", shell: "sh", rust: "rs", markdown: "md", text: "txt" };
  const nameOf = (line: string | undefined) => {
    if (!line) return null;
    const s = line.trim().replace(/^#+\s*/, "").replace(/^(?:\/\/|--|#)\s*/, "").replace(/^\*\*|\*\*:?$/g, "").replace(/^`|`$/g, "").replace(/^(?:file(?:name)?|path)\s*:\s*/i, "").replace(/:$/, "").replace(/^`|`$/g, "").trim();
    return /^[\w@./-]+\.[\w]+$|^(?:Makefile|Dockerfile|COMMIT_EDITMSG|README)$/.test(s) && s.length < 80 ? s : null;
  };
  const clean = (n: string) => n.replace(/^\.?\//, "").replace(/\.\.\//g, "").replace(/\//g, "__");
  const lines = text.replace(/\r/g, "").split("\n");
  const fenceAt = lines.map((l, i) => (/^\s*(```|~~~)/.test(l) ? i : -1)).filter((i) => i >= 0);
  const out: Array<{ name: string; body: string }> = [];
  const dflt = () => `${b.kind === "readme" ? "README" : b.kind === "commit" ? "COMMIT_EDITMSG" : "main"}.${EXT[b.lang] ?? "txt"}`.replace("COMMIT_EDITMSG.txt", "COMMIT_EDITMSG");
  // README and commit replies may hold fences of their own: when the reply opens and closes with a fence, take it whole.
  const firstReal = lines.findIndex((l) => l.trim());
  const lastReal = lines.length - 1 - [...lines].reverse().findIndex((l) => l.trim());
  // A bare reply: a name line, then the contents with no outer fence (fences inside a README stay part of it).
  const secondReal = lines.findIndex((l, i) => i > firstReal && l.trim());
  if (firstReal >= 0 && secondReal > 0 && !/^\s*(```|~~~)/.test(lines[secondReal]) && (nameOf(lines[firstReal]) || ((b.kind === "readme" || b.kind === "commit") && !/^\s*(```|~~~)/.test(lines[firstReal])))) {
    const n = nameOf(lines[firstReal]);
    const body = lines.slice(n ? firstReal + 1 : firstReal).join("\n").replace(/^\n+/, "").replace(/\n*$/, "\n");
    return [{ name: clean(n ?? dflt()), body }];
  }
  if ((b.kind === "readme" || b.kind === "commit") && fenceAt.length >= 2) {
    const open = fenceAt[0], close = fenceAt[fenceAt.length - 1];
    const before = lines.slice(firstReal, open).filter((l) => l.trim());
    if (close === lastReal && before.length <= 1) return [{ name: clean(nameOf(before[0]) ?? dflt()), body: lines.slice(open + 1, close).join("\n") + "\n" }];
  }
  if (fenceAt.length >= 2) {
    let carry: string | null = null;
    for (let k = 0; k + 1 < fenceAt.length; k += 2) {
      const open = fenceAt[k], close = fenceAt[k + 1];
      let j = open - 1;
      while (j >= 0 && !lines[j].trim()) j--;
      let body = lines.slice(open + 1, close);
      const only = body.filter((l) => l.trim());
      // A fence holding only a file name names the next block (```python / app.py / ```). When the code then follows
      // unfenced up to a bare closing fence, that stretch is the file.
      if (only.length === 1 && nameOf(only[0])) {
        carry = nameOf(only[0]);
        const next = fenceAt[k + 2];
        if (next !== undefined && /^\s*(```|~~~)\s*$/.test(lines[next]) && lines.slice(close + 1, next).some((l) => l.trim())) {
          out.push({ name: carry!, body: lines.slice(close + 1, next).join("\n").replace(/^\n+/, "") + "\n" });
          carry = null;
          k += 1; // the bare fence closed the unfenced stretch; pairing resumes after it
        }
        continue;
      }
      // The name may sit in the fence's info string (```app.py, ```python:app.py, ```tsx title="Modal.tsx"), alone on
      // the first line inside the fence, or on the line before it.
      const info = lines[open].trim().replace(/^(```|~~~)/, "");
      const fromInfo = nameOf(info.match(/title="([^"]+)"/)?.[1] ?? info.split(/[:\s]/).find((x) => nameOf(x)) ?? "");
      let inside: string | null = null;
      const fi = body.findIndex((l) => l.trim());
      if (fi >= 0 && !/\s/.test(body[fi].trim()) && nameOf(body[fi])) { inside = nameOf(body[fi]); body = body.slice(fi + 1); }
      const name = carry ?? fromInfo ?? inside ?? (j > (k ? fenceAt[k - 1] : -1) ? nameOf(lines[j]) : null) ?? (body.length && nameOf(body[0]) && /^\s*(?:#|\/\/|--)/.test(body[0]) ? nameOf(body[0]) : null);
      carry = null;
      out.push({ name: name ?? (out.length ? `part${out.length + 1}.${EXT[b.lang] ?? "txt"}` : dflt()), body: body.join("\n").replace(/^\n+/, "") + "\n" });
    }
  } else if (firstReal >= 0) {
    const n = nameOf(lines[firstReal]);
    const body = lines.slice(n ? firstReal + 1 : firstReal).join("\n").replace(/^\n+/, "");
    if (body.trim()) out.push({ name: n ?? dflt(), body: body.endsWith("\n") ? body : body + "\n" });
  }
  const seen = new Set<string>();
  return out.filter((f) => f.body.trim()).map((f) => { let n = clean(f.name); while (seen.has(n)) n = "_" + n; seen.add(n); return { name: n, body: f.body }; });
}

type Reply = { text: string; model: string | null; outputTokens: number | null; inputTokens?: number | null; costUSD: number | null; stop: string | null };

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
        done({ text: j.result ?? "", model: Object.keys(j.modelUsage ?? {}).find((m) => !m.includes("haiku") || model.includes("haiku")) ?? null, outputTokens: j.usage?.output_tokens ?? null, costUSD: null, stop: j.subtype ?? null });
      } catch { done({ text: "", model: null, outputTokens: null, costUSD: null, stop: "parse-error" }); }
    });
  });
}

async function viaApi(p: string): Promise<Reply> {
  if (via === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: MAX, messages: [{ role: "user", content: p }] }) });
    const j = await r.json();
    const inp = (j.usage?.input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0);
    return { text: (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"), model: j.model ?? null, outputTokens: j.usage?.output_tokens ?? null, inputTokens: inp, costUSD: j.usage ? priced(inp, j.usage.output_tokens, false) : null, stop: j.stop_reason ?? j.error?.message ?? null };
  }
  const [url, key] = via === "openai" ? ["https://api.openai.com/v1/chat/completions", env("OPENAI_API_KEY")] : ["https://openrouter.ai/api/v1/chat/completions", env("OPENROUTER_API_KEY")];
  if (!key) throw new Error(`no key for ${via}`);
  const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: p }], ...(via === "openrouter" ? { usage: { include: true }, max_tokens: MAX } : { max_completion_tokens: MAX }) }) });
  const j = await r.json();
  const u = j.usage;
  return { text: j.choices?.[0]?.message?.content ?? "", model: j.model ?? null, outputTokens: u?.completion_tokens ?? null, inputTokens: u?.prompt_tokens ?? null,
    costUSD: via === "openrouter" ? (u?.cost ?? null) : u ? priced(u.prompt_tokens, u.completion_tokens, false) : null, stop: j.choices?.[0]?.finish_reason ?? j.error?.message ?? null };
}

const bare = model.replace(/^[^/]+\//, "");
const OUT = via === "claude-cli" ? join(R, "measure", "code-runs", model) : join(R, "measure", "code-runs-api", bare);
const queue = briefs.flatMap((b) => Array.from({ length: reps }, (_, i) => ({ b, rep: i + 1 }))).filter(({ b, rep }) => !existsSync(join(OUT, `${b.id}__${rep}`, "run.json")));
let spent = 0;
const mismatchOf = (served: string | null) => !!served && !served.replace(/\./g, "-").includes(bare.replace(/\./g, "-"));
function record(b: Brief, rep: number, reply: Reply, seconds: number, extra: Record<string, unknown> = {}) {
  const dir = join(OUT, `${b.id}__${rep}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "reply.txt"), reply.text);
  const fs = files(reply.text, b);
  if (fs.length) { mkdirSync(join(dir, "files"), { recursive: true }); for (const f of fs) writeFileSync(join(dir, "files", f.name), f.body); }
  const mismatch = mismatchOf(reply.model);
  writeFileSync(join(dir, "run.json"), JSON.stringify({ ...reply, ...extra, text: undefined, model, served: reply.model, mismatch, via, brief: b.id, kind: b.kind, lang: b.lang, rep, briefs_version: spec.version, files: fs.map((f) => f.name), ok: fs.length > 0 && !!reply.text.trim(), seconds }, null, 1));
  console.log(`${model} ${b.id}#${rep}: ${fs.length ? fs.map((f) => f.name).join(",") : "NO CODE"} ${reply.stop}${mismatch ? ` (served by ${reply.model})` : ""} ${reply.outputTokens ?? "?"} tok ${seconds}s $${spent.toFixed(3)}`);
}

// --reextract: pull the files out of every saved reply again (after a change to files() above), for every model.
if (values.reextract) {
  const base = join(R, "measure", "code-runs-api");
  for (const m of existsSync(base) ? readdirSync(base) : []) for (const d of readdirSync(join(base, m))) {
    const dir = join(base, m, d), rj = join(dir, "run.json");
    if (!existsSync(rj)) continue;
    const run = JSON.parse(readFileSync(rj, "utf8"));
    const b = spec.briefs.find((x) => x.id === run.brief); if (!b) continue;
    const text = readFileSync(join(dir, "reply.txt"), "utf8");
    const fs = files(text, b);
    rmSync(join(dir, "files"), { recursive: true, force: true });
    if (fs.length) { mkdirSync(join(dir, "files"), { recursive: true }); for (const f of fs) writeFileSync(join(dir, "files", f.name), f.body); }
    writeFileSync(rj, JSON.stringify({ ...run, files: fs.map((f) => f.name), ok: fs.length > 0 && !!text.trim() }, null, 1));
  }
  console.log("re-extracted");
  process.exit(0);
}

if (values.plan) {
  const done = existsSync(OUT) ? readdirSync(OUT).filter((d) => existsSync(join(OUT, d, "run.json"))).map((d) => JSON.parse(readFileSync(join(OUT, d, "run.json"), "utf8"))) : [];
  const outs = done.map((r) => r.outputTokens).filter((x) => x != null);
  if (!outs.length) { console.log(`${model}: no saved replies yet; run a trial first`); process.exit(0); }
  const mean = outs.reduce((a, b) => a + b, 0) / outs.length;
  const each = priced(150, mean, values.batch);
  console.log(`${model}: ${outs.length} replies, mean ${Math.round(mean)} output tokens (max ${Math.max(...outs)}); ${queue.length} to go ≈ $${each == null ? "?" : (each * queue.length).toFixed(2)}${values.batch ? " at batch price" : ""}`);
  process.exit(0);
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
      const requests = [...items].map(([custom_id, q]) => ({ custom_id, params: { model, max_tokens: MAX, messages: [{ role: "user", content: prompt(q.b) }] } }));
      const r = await fetch("https://api.anthropic.com/v1/messages/batches", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ requests }) });
      if (!r.ok) { console.error(`batch create ${r.status}: ${await r.text()}`); process.exit(1); }
      id = (await r.json()).id;
    } else {
      const jsonl = [...items].map(([custom_id, q]) => JSON.stringify({ custom_id, method: "POST", url: "/v1/chat/completions", body: { model, max_completion_tokens: MAX, messages: [{ role: "user", content: prompt(q.b) }] } })).join("\n");
      const form = new FormData(); form.append("purpose", "batch"); form.append("file", new Blob([jsonl], { type: "application/jsonl" }), "requests.jsonl");
      const f = await fetch("https://api.openai.com/v1/files", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
      if (!f.ok) { console.error(`file upload ${f.status}: ${await f.text()}`); process.exit(1); }
      const r = await fetch("https://api.openai.com/v1/batches", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ input_file_id: (await f.json()).id, endpoint: "/v1/chat/completions", completion_window: "24h" }) });
      if (!r.ok) { console.error(`batch create ${r.status}: ${await r.text()}`); process.exit(1); }
      id = (await r.json()).id;
    }
    writeFileSync(pending, JSON.stringify({ via, id, created: new Date().toISOString(), items: Object.fromEntries([...items].map(([k, q]) => [k, `${q.b.id}#${q.rep}`])) }));
    console.log(`${model}: submitted batch ${id} (${items.size} replies). Rerun to collect.`);
    process.exit(0);
  }
  const p = JSON.parse(readFileSync(pending, "utf8"));
  const byKey = new Map(Object.entries(p.items as Record<string, string>).map(([k, v]) => { const [bid, rep] = v.split("#"); return [k, { b: spec.briefs.find((x) => x.id === bid)!, rep: +rep }]; }));
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
      const inp = (m.usage?.input_tokens ?? 0) + (m.usage?.cache_creation_input_tokens ?? 0) + (m.usage?.cache_read_input_tokens ?? 0);
      const cost = priced(inp, m.usage?.output_tokens ?? 0, true);
      spent += cost ?? 0;
      record(q.b, q.rep, { text: m.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"), model: m.model, outputTokens: m.usage?.output_tokens ?? null, inputTokens: inp, costUSD: cost, stop: m.stop_reason }, 0, { batch: p.id, usage: m.usage });
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
      const cost = body.usage ? priced(body.usage.prompt_tokens, body.usage.completion_tokens, true) : null;
      spent += cost ?? 0;
      record(q.b, q.rep, { text: body.choices[0].message.content ?? "", model: body.model, outputTokens: body.usage?.completion_tokens ?? null, inputTokens: body.usage?.prompt_tokens ?? null, costUSD: cost, stop: body.choices[0].finish_reason }, 0, { batch: p.id, usage: body.usage });
    }
  }
  console.log(`${model}: collected, $${spent.toFixed(3)}`);
  writeFileSync(pending.replace("batch.json", `batch-${p.id}.done.json`), JSON.stringify({ ...p, spent }));
  rmSync(pending);
  process.exit(0);
}

await Promise.all(Array.from({ length: +values.jobs! }, async () => {
  while (queue.length) {
    if (values.budget && spent >= +values.budget) { console.error(`stopping: spent $${spent.toFixed(2)} of --budget ${values.budget}`); queue.length = 0; break; }
    const { b, rep } = queue.shift()!;
    const t0 = Date.now();
    const reply = via === "claude-cli" ? await viaCli(prompt(b)) : await viaApi(prompt(b)).catch((e) => ({ text: "", model: null, outputTokens: null, costUSD: null, stop: `error: ${String(e).slice(0, 200)}` }));
    spent += reply.costUSD ?? 0;
    if (!reply.text.trim() && reply.outputTokens == null) { console.error(`${b.id}: no reply (${reply.stop}); rerun to retry`); continue; }
    record(b, rep, reply, Math.round((Date.now() - t0) / 1000));
  }
}));
console.log(`${model}: spent $${spent.toFixed(3)} this run`);
