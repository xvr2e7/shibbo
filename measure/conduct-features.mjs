#!/usr/bin/env node
// Measure how a model conducts itself as an agent, from Claude Code transcripts, as readable tokens.
//
//   node measure/conduct-features.mjs
//   reads  measure/conduct-runs/<model>/<task>__<rep>/{transcript.jsonl, run.json}   (route "tasks": measure/run-conduct.ts)
//          eval/ui/runs/<tag>/<brief>/base*/{transcript.jsonl, run.json}            (route "ui-build": base arm only)
//   -> measure/conduct-features.json (one entry per transcript: tokens, counts, success, a short excerpt)
//
// Two routes, kept apart. "tasks" is the main set: 12 small coding tasks in throwaway repos, the same for every model.
// "ui-build" is the interface eval's page builds (eval/ui/), longer single-brief sessions; only its `base` arm counts,
// since the other arms load the shibbo plugin, which steers exactly these habits. Both run inside Claude Code, whose
// own system prompt and tools shape all of it.
//
// Thresholds:
//   narration     a text block between tool calls that opens with "Let me", "I'll", "I will", "Now let me", "Now I'll",
//                 "First, let me", "Next, I'll". narration:none, narration:some (under one per two tool calls),
//                 narration:heavy (one per two tool calls or more). silent-work: no text at all before the final reply.
//   status-exclaim  a text line that opens with Perfect, Great, Excellent, Awesome, Fixed, Done, Good, Nice, All set,
//                 Success or Got it and ends that clause with "!".
//   apology       sorry / apologise / apologize anywhere in the assistant text.
//   final reply   the last assistant text. final:headers (a markdown heading), final:bullets (3+ list lines),
//                 final:table, final:bold-labels (2+ "**Label:**"), final:code-block, final:recap (a heading or bold
//                 line named Summary, Changes, What I did / changed, or "Here's what"), final:words:<=40/41-120/121+.
//   test claims   claims-pass: the final reply says tests pass, it works, verified, or confirms output. ran-check:
//                 some Bash call ran python3, node, npm or pytest. claims-pass:unverified: a claim with no such run
//                 before it.
//   asking        asks-question: the final reply ends with a question or asks "would you like / do you want / should
//                 I". offers-more: "let me know", "if you'd like", "happy to", "want me to". asked-instead: no file
//                 changed and the final reply asks a question.
//   files         created:0/1/2+, edited:0/1/2+ (git status after the run, task route only). scratch-files: a created
//                 file that looks like a report or scratch (SUMMARY/NOTES/REPORT/CHANGES*.md, debug_/test_/check_/
//                 verify_/temp scripts at the root) where the task did not ask for one. commits: the agent committed.
//   effort        turns:<=3/4-6/7-12/13+ (Claude Code's num_turns); tools:<=2/3-5/6-10/11+ tool calls; bash:none,
//                 bash:some (under half the calls), bash:most; todo-list (TodoWrite or Task* tools); subagent (Task or
//                 Agent tool); permission-wall: a tool call refused by the permission rules.
//   tells         tell:<id> for each agent or chat (domain agent, chat) tell shibbo's checker finds in the assistant text.
// Success is not a token: it is the task's hidden check after the run (exit 0), kept as its own field.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = 1;
const canon = (id) => String(id).split("/").pop().replace(/-\d{8}$/, "");
const TEXT_DIR = "/tmp/shibbo-conduct-text";
mkdirSync(TEXT_DIR, { recursive: true });

// ── which transcripts ──
const items = [];
const tasksDir = join(ROOT, "measure", "conduct-runs");
for (const m of existsSync(tasksDir) ? readdirSync(tasksDir).sort() : []) {
  if (!statSync(join(tasksDir, m)).isDirectory()) continue;
  for (const d of readdirSync(join(tasksDir, m)).sort()) {
    const dir = join(tasksDir, m, d);
    if (!existsSync(join(dir, "run.json")) || !existsSync(join(dir, "transcript.jsonl"))) continue;
    const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
    if (run.mismatch) continue;
    items.push({ route: "tasks", model: canon(run.model), brief: run.task, kind: run.lang, rep: run.rep, dir, run });
  }
}
const evalDir = join(ROOT, "eval", "ui", "runs");
for (const tag of existsSync(evalDir) ? readdirSync(evalDir).sort() : []) {
  if (!statSync(join(evalDir, tag)).isDirectory()) continue;
  for (const b of readdirSync(join(evalDir, tag)).sort()) {
    if (!statSync(join(evalDir, tag, b)).isDirectory()) continue;
    for (const arm of readdirSync(join(evalDir, tag, b)).sort()) {
      if (!/^base(__\d+)?$/.test(arm)) continue;
      const dir = join(evalDir, tag, b, arm);
      if (!existsSync(join(dir, "run.json")) || !existsSync(join(dir, "transcript.jsonl"))) continue;
      const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
      if (run.arm !== "base" || !run.ok) continue;
      items.push({ route: "ui-build", model: canon(run.model), brief: b, kind: "page", rep: `${tag}${arm.replace("base", "")}`, dir, run });
    }
  }
}

// ── read each transcript ──
const NARR = /^(?:now,? )?(?:first,? |next,? )?(?:let me|i(?:'|’)ll|i will)\b/i;
const EXCLAIM = /^\s*(?:\*\*)?(?:perfect|great|excellent|awesome|fixed|done|good|nice|all set|success|got it)\b[^.\n]{0,60}!/im;
const RAN = /\b(?:python3?|node|npm|pytest|npx)\b/;
function read(it) {
  const events = readFileSync(join(it.dir, "transcript.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const steps = []; // {kind: "text"|"tool", text?, name?, input?, error?}
  const results = new Map();
  for (const e of events) {
    if (e.type === "assistant") for (const c of e.message?.content ?? []) {
      if (c.type === "text" && c.text.trim()) steps.push({ kind: "text", text: c.text });
      if (c.type === "tool_use") steps.push({ kind: "tool", id: c.id, name: c.name, input: c.input ?? {} });
    }
    if (e.type === "user") for (const c of Array.isArray(e.message?.content) ? e.message.content : []) if (c.type === "tool_result") results.set(c.tool_use_id, { error: !!c.is_error, text: typeof c.content === "string" ? c.content : JSON.stringify(c.content ?? "") });
  }
  for (const s of steps) if (s.kind === "tool") { const r = results.get(s.id); s.error = r?.error ?? false; s.denied = !!r?.error && /permission|not allowed|denied|requires approval/i.test(r?.text ?? ""); }
  const result = [...events].reverse().find((e) => e.type === "result");
  return { events, steps, result };
}

function measure(it, tr) {
  const T = new Set();
  const { steps } = tr;
  const tools = steps.filter((s) => s.kind === "tool");
  const texts = steps.filter((s) => s.kind === "text");
  let lastTextIdx = -1;
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].kind === "text") { lastTextIdx = i; break; }
  const final = (tr.result?.result && String(tr.result.result).trim()) || (lastTextIdx >= 0 ? steps[lastTextIdx].text : "");
  const mid = steps.slice(0, lastTextIdx >= 0 ? lastTextIdx : steps.length).filter((s) => s.kind === "text");
  const narr = mid.filter((s) => NARR.test(s.text.trim())).length;
  T.add(narr === 0 ? "narration:none" : tools.length && narr / tools.length >= 0.5 ? "narration:heavy" : "narration:some");
  if (!mid.length) T.add("silent-work");
  const allText = texts.map((s) => s.text).join("\n\n");
  if (texts.some((s) => EXCLAIM.test(s.text))) T.add("status-exclaim");
  if (/\b(?:sorry|apologi[sz]e)/i.test(allText)) T.add("apology");
  // The final reply.
  if (/^#{1,6}\s/m.test(final)) T.add("final:headers");
  if ((final.match(/^\s*(?:[-*•]|\d+\.)\s/gm) ?? []).length >= 3) T.add("final:bullets");
  if (/^\s*\|.+\|\s*$/m.test(final) && /^\s*\|?\s*:?-{3,}/m.test(final)) T.add("final:table");
  if ((final.match(/\*\*[^*\n]{1,40}:\*\*|\*\*[^*\n]{1,40}\*\*:/g) ?? []).length >= 2) T.add("final:bold-labels");
  if (/```/.test(final)) T.add("final:code-block");
  if (/^\s*(?:#{1,4}\s*|\*\*)(?:summary|changes(?: made)?|what (?:i|was) (?:did|done|changed)|what changed)\b|^\s*here(?:'|’)s what (?:i|was)/im.test(final)) T.add("final:recap");
  const words = final.split(/\s+/).filter(Boolean).length;
  T.add(`final:words:${words <= 40 ? "<=40" : words <= 120 ? "41-120" : "121+"}`);
  // Claims against runs.
  const claimRe = /\b(?:all (?:\d+ )?tests? (?:now )?pass|tests? (?:now )?pass(?:es|ing)?|(?:now )?passes\b|it works|works (?:correctly|as expected)|verified|confirmed|i(?:'|’)ve tested|tested (?:it|and)|output(?:s)? (?:is |now )?`?total)/i;
  const runIdx = steps.findIndex((s) => s.kind === "tool" && s.name === "Bash" && RAN.test(String(s.input.command ?? "")) && !s.denied);
  if (runIdx >= 0) T.add("ran-check");
  if (claimRe.test(final)) {
    T.add("claims-pass");
    if (runIdx < 0 || runIdx > lastTextIdx) T.add("claims-pass:unverified");
  }
  // Asking.
  const tail = final.trim().split("\n").slice(-3).join(" ");
  if (/\?\s*$/.test(final.trim()) || /\b(?:would you like|do you want|should i|shall i)\b[^.\n]*\?/i.test(tail)) T.add("asks-question");
  if (/\blet me know\b|\bif you(?:'|’)d like\b|\bhappy to\b|\bwant me to\b/i.test(final)) T.add("offers-more");
  // Effort.
  const turns = tr.result?.num_turns ?? null;
  if (turns != null) T.add(`turns:${turns <= 3 ? "<=3" : turns <= 6 ? "4-6" : turns <= 12 ? "7-12" : "13+"}`);
  T.add(`tools:${tools.length <= 2 ? "<=2" : tools.length <= 5 ? "3-5" : tools.length <= 10 ? "6-10" : "11+"}`);
  const bash = tools.filter((s) => s.name === "Bash").length;
  T.add(bash === 0 ? "bash:none" : bash / tools.length < 0.5 ? "bash:some" : "bash:most");
  if (tools.some((s) => /^(?:TodoWrite|TaskCreate|TaskUpdate)$/.test(s.name))) T.add("todo-list");
  if (tools.some((s) => /^(?:Task|Agent)$/.test(s.name))) T.add("subagent");
  if (tools.some((s) => s.denied)) T.add("permission-wall");
  // Files (task route: from git status after the run).
  let created = [], edited = [];
  if (it.route === "tasks") {
    created = it.run.files?.created ?? []; edited = it.run.files?.edited ?? [];
    T.add(`created:${created.length === 0 ? "0" : created.length === 1 ? "1" : "2+"}`);
    T.add(`edited:${edited.length === 0 ? "0" : edited.length === 1 ? "1" : "2+"}`);
    const wanted = it.brief === "write-tests" ? /(?:^|\/)tests?(?:_\w+)?\.py$|(?:^|\/)tests\/|_test\.py$/ : /^$/;
    const scratch = created.filter((f) => !wanted.test(f) && (/(?:^|\/)(?:[A-Z_]*(?:SUMMARY|NOTES|REPORT|CHANGES|IMPLEMENTATION)[A-Z_]*)\.md$/i.test(f) || /^(?:debug|test|check|verify|temp|tmp|scratch|demo)[_-]?\w*\.(?:py|js|mjs|sh)$/i.test(basename(f)) && !f.includes("/")));
    if (scratch.length) T.add("scratch-files");
    if ((it.run.commits ?? 0) > 0) T.add("commits");
    if (!created.length && !edited.length && T.has("asks-question")) T.add("asked-instead");
  } else {
    const writes = tools.filter((s) => s.name === "Write").length, edits = tools.filter((s) => s.name === "Edit").length;
    created = [...new Set(tools.filter((s) => s.name === "Write").map((s) => basename(String(s.input.file_path ?? ""))))];
    if (created.some((f) => /\.md$/i.test(f) && /summary|notes|report|readme/i.test(f))) T.add("scratch-files");
    T.add(`edited:${edits === 0 ? "0" : edits <= 1 ? "1" : "2+"}`);
    T.add(`created:${writes === 0 ? "0" : created.length <= 1 ? "1" : "2+"}`);
  }
  return { tokens: T, final, words, turns, tools: tools.length, bash, narr, created, edited, allText };
}

/** A short excerpt for the hover card: the run as steps, then the start of the final reply; 12 lines at most. */
function excerpt(tr, final) {
  const lines = [];
  const short = (s, n = 96) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const arg = (s) => { const i = s.input ?? {}; const p = i.file_path ?? i.path ?? i.pattern ?? i.command ?? i.description ?? ""; return short(String(p).replace(/\/(?:private\/)?tmp\/shibbo-conduct\/[^/\s]+\/[^/\s]+\/?/g, "").replace(/\/\S*\/eval\/ui\/runs\/[^/\s]+\/[^/\s]+\/[^/\s]+\/?/g, "").trim() || ".", 70); };
  const body = tr.steps.slice(0, -1);
  for (const s of body) {
    if (lines.length >= 7) { lines.push("…"); break; }
    lines.push(s.kind === "tool" ? `→ ${s.name} ${arg(s)}` : short(s.text.trim().split("\n")[0]));
  }
  const fl = final.trim().split("\n").filter((l) => l.trim()).slice(0, 12 - lines.length);
  return [...lines, ...fl.map((l) => short(l))].join("\n");
}

// ── the checker, agent and chat rules, over each transcript's assistant text ──
const agentTells = new Set();
for (const f of [join(ROOT, "data/tells.yaml"), ...readdirSync(join(ROOT, "data/tells.d")).map((x) => join(ROOT, "data/tells.d", x))]) {
  for (const t of YAML.parse(readFileSync(f, "utf8")) ?? []) if (t.domain === "agent" || t.domain === "chat") agentTells.add(t.id);
}
const measured = items.map((it) => { const tr = read(it); return { it, tr, m: measure(it, tr) }; });
const files = measured.map(({ it, m }, i) => { const f = join(TEXT_DIR, `${i}-${it.route}-${it.model}-${it.brief}.md`); writeFileSync(f, m.allText); return { file: f, domains: ["agent", "chat"] }; });
const tellsOf = files.length ? JSON.parse(execFileSync("npx", ["tsx", "measure/tells-of.ts"], { cwd: ROOT, input: JSON.stringify(files), maxBuffer: 1 << 28, encoding: "utf8" })) : {};

const pages = measured.map(({ it, tr, m }, i) => {
  for (const id of tellsOf[files[i].file] ?? []) if (agentTells.has(id)) m.tokens.add(`tell:${id}`);
  return {
    route: it.route, model: it.model, model_raw: it.run.model, brief: it.brief, kind: it.kind, rep: it.rep,
    served: it.run.served ?? null, tokens: [...m.tokens].sort(),
    success: it.route === "tasks" ? !!it.run.success : null, turns: m.turns, tool_calls: m.tools, bash_calls: m.bash, narration: m.narr, final_words: m.words,
    created: m.created, edited: m.edited, cost_usd: tr.result?.total_cost_usd ?? null, seconds: it.run.seconds ?? null,
    excerpt: excerpt(tr, m.final),
  };
});
pages.sort((a, b) => a.route.localeCompare(b.route) || a.model.localeCompare(b.model) || a.brief.localeCompare(b.brief) || String(a.rep).localeCompare(String(b.rep)));
writeFileSync(join(ROOT, "measure", "conduct-features.json"), JSON.stringify({
  version: VERSION, measured: new Date().toISOString().slice(0, 10),
  method: "Claude Code stream-json transcripts; thresholds at the top of measure/conduct-features.mjs. Task route: measure/run-conduct.ts; ui-build route: eval/ui base arm only.",
  pages,
}, null, 1));
console.log(`measured ${pages.length} transcripts (${pages.filter((p) => p.route === "tasks").length} task runs, ${pages.filter((p) => p.route === "ui-build").length} page builds) -> measure/conduct-features.json`);
