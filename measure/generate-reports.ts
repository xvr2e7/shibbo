// Measure how a model writes its final message after agent work: the same finished work logs, one report each.
// No tools, no harness, no system prompt, so every model reads the same record and the report shows its own habits.
//
//   npx tsx measure/generate-reports.ts --model claude-haiku-5-5 [--via anthropic|openai|openrouter] [--reps 1] [--jobs 3] [--budget USD] [--log a,b] [--max-tokens 6000] [--plan]
// --budget is a hard cap on this run's spend. Before each request the script sets aside the most that request can
//   cost (the prompt plus --max-tokens of output at the model's price) and sends only if spend so far, the requests
//   in flight and this one all fit. A model with no known price cannot run under --budget.
// --plan prints the cost of the reports still to fetch and sends nothing: an estimate from the saved replies' mean
//   token counts (or 700 output tokens when none are saved) and the worst case with every reply at --max-tokens.
//
// The default route is the bare API: anthropic for claude-*, openai for gpt-*, openrouter for the rest.
// Output: measure/report-runs-api/<model>/<log>__<rep>/ with reply.txt (the raw report) and run.json (served model,
// stop reason, usage, cost). Reports stay local; only derived measurements get published. A reply from a different
// model than asked is saved but flagged. Errors and empty replies are not saved; rerun the same command to retry.
// A payment or credit error stops the run at once.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { root } from "../src/registry.js";

const { values } = parseArgs({ options: { model: { type: "string" }, via: { type: "string" }, reps: { type: "string", default: "1" }, jobs: { type: "string", default: "3" }, log: { type: "string" }, budget: { type: "string" }, plan: { type: "boolean", default: false }, "max-tokens": { type: "string", default: "6000" } } });
if (!values.model) { console.error("usage: generate-reports.ts --model <id> [--via anthropic|openai|openrouter] [--budget USD] [--plan]"); process.exit(2); }
const R = root();
type Log = { id: string; kind: string; domain: string; task: string; log: string };
const spec = YAML.parse(readFileSync(join(R, "measure/report-logs.yaml"), "utf8")) as { version: number; instruction: string; logs: Log[] };
const model = values.model;
const via = values.via ?? (model.startsWith("claude-") ? "anthropic" : model.startsWith("gpt-") ? "openai" : "openrouter");
if (!["anthropic", "openai", "openrouter"].includes(via)) { console.error("--via must be anthropic, openai or openrouter"); process.exit(2); }
const logs = spec.logs.filter((l) => !values.log || values.log.split(",").includes(l.id));
const reps = +values.reps!;
const MAX = +values["max-tokens"]!;
const budget = values.budget == null ? null : +values.budget;
if (budget != null && !(budget >= 0)) { console.error("--budget must be a number of dollars"); process.exit(2); }
const prompt = (l: { task: string; log: string }, instruction = spec.instruction) => `Task from the user:\n${l.task.trim()}\n\nSession record:\n${l.log.trimEnd()}\n\n${instruction}`;
const env = (k: string) => process.env[k] ?? (existsSync(join(R, ".env")) ? readFileSync(join(R, ".env"), "utf8").match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n]+)"?`, "m"))?.[1]?.trim() : undefined);

// USD per million tokens [input, output], from the makers' pages and OpenRouter's model list, 2026-11-10. Models
// missing here take their price from measure/api-models.yaml (matched on its `api` id).
const PRICE: Record<string, [number, number]> = {
  "claude-fable-5-2": [8, 40], "claude-fable-5-1": [10, 50], "claude-opus-5-5": [4, 20], "claude-opus-5": [5, 25], "claude-sonnet-5-5": [2, 10], "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5], "claude-opus-4-6": [5, 25], "claude-sonnet-4-6": [3, 15], "claude-opus-4-5-20251101": [5, 25], "claude-sonnet-4-5-20250929": [3, 15], "claude-haiku-4-5-20251001": [1, 5],
  "gpt-6.1-sol": [2, 10], "gpt-6.1-terra": [1, 5], "gpt-6-astra": [10, 50], "gpt-6-sol": [2, 10], "gpt-6-luna": [0.1, 0.5],
};
const listed = (YAML.parse(readFileSync(join(R, "measure/api-models.yaml"), "utf8")) as Array<{ api: string; price?: [number, number] }>).find((m) => m.api === model);
const price: [number, number] | null = PRICE[model] ?? listed?.price ?? null;
const priced = (inp: number, out: number) => (price ? (inp * price[0] + out * price[1]) / 1e6 : null);
/** A generous token count for a prompt: logs are dense with paths and symbols, so count 2.5 characters per token. */
const tokensUpTo = (p: string) => Math.ceil(p.length / 2.5) + 20;
const worst = (p: string) => priced(tokensUpTo(p), MAX);

type Reply = { text: string; model: string | null; outputTokens: number | null; inputTokens: number | null; costUSD: number | null; stop: string | null; status: number; usage?: unknown };
const PAYMENT = /credit|payment|billing|insufficient|quota|balance|spend limit|usage limit/i;

async function viaApi(p: string): Promise<Reply> {
  if (via === "anthropic") {
    const key = env("ANTHROPIC_API_KEY");
    if (!key) throw new Error("no key for anthropic");
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: MAX, messages: [{ role: "user", content: p }] }) });
    const j = await r.json();
    const inp = (j.usage?.input_tokens ?? 0) + (j.usage?.cache_creation_input_tokens ?? 0) + (j.usage?.cache_read_input_tokens ?? 0);
    return { text: (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"), model: j.model ?? null, outputTokens: j.usage?.output_tokens ?? null, inputTokens: j.usage ? inp : null,
      costUSD: j.usage ? priced(inp, j.usage.output_tokens) : null, stop: j.stop_reason ?? j.error?.message ?? null, status: r.status, usage: j.usage };
  }
  const [url, key] = via === "openai" ? ["https://api.openai.com/v1/chat/completions", env("OPENAI_API_KEY")] : ["https://openrouter.ai/api/v1/chat/completions", env("OPENROUTER_API_KEY")];
  if (!key) throw new Error(`no key for ${via}`);
  const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: p }], ...(via === "openrouter" ? { usage: { include: true }, max_tokens: MAX } : { max_completion_tokens: MAX }) }) });
  const j = await r.json();
  const u = j.usage;
  return { text: j.choices?.[0]?.message?.content ?? "", model: j.model ?? null, outputTokens: u?.completion_tokens ?? null, inputTokens: u?.prompt_tokens ?? null,
    costUSD: via === "openrouter" ? (u?.cost ?? (u ? priced(u.prompt_tokens, u.completion_tokens) : null)) : u ? priced(u.prompt_tokens, u.completion_tokens) : null,
    stop: j.choices?.[0]?.finish_reason ?? j.error?.message ?? null, status: r.status, usage: u };
}

const bare = model.replace(/^[^/]+\//, "");
const OUT = join(R, "measure", "report-runs-api", bare);
const queue = logs.flatMap((l) => Array.from({ length: reps }, (_, i) => ({ l, rep: i + 1 }))).filter(({ l, rep }) => !existsSync(join(OUT, `${l.id}__${rep}`, "run.json")));
let spent = 0, held = 0, saved = 0;
const mismatchOf = (served: string | null) => !!served && !served.replace(/\./g, "-").includes(bare.replace(/\./g, "-"));
function record(l: Log, rep: number, reply: Reply, seconds: number) {
  const dir = join(OUT, `${l.id}__${rep}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "reply.txt"), reply.text);
  const mismatch = mismatchOf(reply.model);
  const words = reply.text.split(/\s+/).filter(Boolean).length;
  writeFileSync(join(dir, "run.json"), JSON.stringify({ ...reply, text: undefined, status: undefined, model, served: reply.model, mismatch, via, log: l.id, kind: l.kind, domain: l.domain, rep, logs_version: spec.version, max_tokens: MAX, words, ok: true, seconds }, null, 1));
  saved++;
  console.log(`${model} ${l.id}#${rep}: ${words} words ${reply.stop}${mismatch ? ` (served by ${reply.model})` : ""} ${reply.inputTokens ?? "?"} in ${reply.outputTokens ?? "?"} out ${seconds}s $${spent.toFixed(4)}`);
}

if (values.plan) {
  const done = existsSync(OUT) ? readdirSync(OUT).filter((d) => existsSync(join(OUT, d, "run.json"))).map((d) => JSON.parse(readFileSync(join(OUT, d, "run.json"), "utf8"))) : [];
  const outs = done.map((r) => r.outputTokens).filter((x) => x != null) as number[];
  const ins = done.map((r) => r.inputTokens).filter((x) => x != null) as number[];
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const outEach = outs.length ? mean(outs) : 700;
  const est = queue.reduce((s, q) => s + (priced(ins.length ? mean(ins) : tokensUpTo(prompt(q.l)), outEach) ?? NaN), 0);
  const cap = queue.reduce((s, q) => s + (worst(prompt(q.l)) ?? NaN), 0);
  const usd = (x: number) => (Number.isNaN(x) ? "?" : x.toFixed(4));
  console.log(`${model} via ${via}: ${queue.length} reports to fetch, ${done.length} saved; price ${price ? `$${price[0]} / $${price[1]} per million tokens` : "unknown"}; ${outs.length ? `mean ${Math.round(mean(ins))} in, ${Math.round(outEach)} out over the saved replies (max ${Math.max(...outs)} out)` : "no saved replies, assuming 700 output tokens each"}; estimate $${usd(est)}; worst case at ${MAX} output tokens each $${usd(cap)}${budget != null ? `; budget $${budget}: estimate ${est <= budget ? "fits" : "EXCEEDS"}, worst case ${cap <= budget ? "fits" : "exceeds (the run stops at the cap)"}` : ""}`);
  process.exit(0);
}

if (budget != null && !price) { console.error(`${model}: no price known, so --budget cannot be kept; add the model to measure/api-models.yaml`); process.exit(2); }
let halted: string | null = null;
await Promise.all(Array.from({ length: +values.jobs! }, async () => {
  while (queue.length && !halted) {
    const { l, rep } = queue.shift()!;
    const p = prompt(l);
    const hold = worst(p) ?? 0;
    if (budget != null && spent + held + hold > budget) { halted = `budget: spent $${spent.toFixed(4)} of $${budget}; the next request could cost up to $${hold.toFixed(4)}`; break; }
    held += hold;
    const t0 = Date.now();
    let reply: Reply | null = null, err = "";
    // One more try after a rate limit or server error; never after a payment error.
    for (let attempt = 0; attempt < 2 && !reply; attempt++) {
      try {
        const r = await viaApi(p);
        spent += r.costUSD ?? 0;
        if (r.status === 402 || (r.status >= 400 && PAYMENT.test(String(r.stop)))) { halted = `payment or credit error from ${via} (HTTP ${r.status}): ${String(r.stop).slice(0, 160)}`; err = "payment"; break; }
        if (r.status === 429 || r.status >= 500) { err = `HTTP ${r.status} ${String(r.stop).slice(0, 120)}`; if (attempt === 0) await new Promise((ok) => setTimeout(ok, 5000)); continue; }
        if (r.status >= 400) { err = `HTTP ${r.status} ${String(r.stop).slice(0, 160)}`; break; }
        reply = r;
      } catch (e) { err = `error: ${String(e).slice(0, 160)}`; if (/no key for/.test(err)) { halted = err; break; } }
    }
    held -= hold;
    if (!reply) { if (!halted) console.error(`${l.id}#${rep}: no reply (${err}); rerun to retry`); continue; }
    if (!reply.text.trim()) { console.error(`${l.id}#${rep}: empty reply (${reply.stop}, ${reply.outputTokens ?? "?"} output tokens); not saved, rerun to retry`); continue; }
    record(l, rep, reply, Math.round((Date.now() - t0) / 1000));
  }
}));
if (halted) console.error(`stopping: ${halted}`);
console.log(`${model}: saved ${saved} reports, spent $${spent.toFixed(4)} this run${budget != null ? ` of --budget ${budget}` : ""}`);
