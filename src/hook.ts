// Claude Code hook entry points. Each reads the hook's JSON from stdin and prints JSON (or nothing).
//
//   session-start  remember the session's model; add that model's rules to context
//   post-edit      after Write/Edit, check the changed region and hand hits back to Claude
//   stop           check Claude's final message; block only when it reads as heavy slop
//
// --for <harness> adapts input and output to other harnesses: codex, cursor, gemini, copilot, devin, cline, kiro, junie.
//
// Settings (env): SHIBBO_STOP=off|warn|block (default block), SHIBBO_STOP_SCORE (default 50),
// SHIBBO_EDIT=off|on (default on), SHIBBO_DISABLE=id,id, SHIBBO_MODEL to force a model,
// SHIBBO_JUDGE=anthropic:<model>|openai:<model>|openrouter:<model> to have a small model read the final reply (off when unset).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { check, type Finding } from "./check.js";
import { rulesMarkdown, interfaceMarkdown } from "./rules.js";
import { judgeReply, judgeMessage, shouldHold, type Verdict } from "./judge.js";
import { kindOf } from "./text.js";
import { execFileSync } from "node:child_process";
import type { HookFlavor } from "./harness.js";

interface HookInput {
  [k: string]: unknown;
  session_id?: string;
  hook_event_name?: string;
  model?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; path?: string; target_file?: string; content?: string; new_string?: string; command?: string; edits?: Array<{ new_string?: string }> };
  last_assistant_message?: string;
  stop_hook_active?: boolean;
}

const stateDir = () => process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), "shibbo");
const stateFile = (sid: string) => join(stateDir(), `session-${sid.replace(/[^\w-]/g, "")}.json`);
const disabled = () => (process.env.SHIBBO_DISABLE ?? "").split(",").filter(Boolean);

function modelFor(input: HookInput): string | null {
  if (process.env.SHIBBO_MODEL) return process.env.SHIBBO_MODEL;
  if (input.model) return input.model;
  if (input.session_id && existsSync(stateFile(input.session_id))) {
    try { return JSON.parse(readFileSync(stateFile(input.session_id), "utf8")).model ?? null; } catch { return null; }
  }
  return null;
}

/** With SHIBBO_LOG set to a file, each check adds one JSON line there: a record to measure the harness by. */
function log(entry: Record<string, unknown>) {
  const p = process.env.SHIBBO_LOG;
  if (!p) return;
  try { mkdirSync(dirname(p), { recursive: true }); appendFileSync(p, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n"); } catch { /* a log must never break a hook */ }
}
const ids = (fs: Finding[]) => fs.map((f) => (f.origin === "lexicon" ? `phrase:${f.match.toLowerCase()}` : f.id));

const out = (event: string, context: string) =>
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }));

/** Where this harness says which file was edited, and what text the edit added (null: whole file). */
function editedFiles(input: HookInput, flavor: HookFlavor): Array<{ path: string; added: string[] | null }> {
  const ti = (input.tool_input ?? {}) as NonNullable<HookInput["tool_input"]>;
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const abs = (p: string) => (p.startsWith("/") ? p : join(cwd, p));
  if (flavor === "codex") {
    // apply_patch text: "*** Update File: <path>" / "*** Add File: <path>", added lines start with "+".
    const patch = String(ti.command ?? "");
    const files: Array<{ path: string; added: string[] | null }> = [];
    for (const block of patch.split(/^\*\*\* (?=(?:Update|Add) File: )/m).slice(1)) {
      const m = /^(?:Update|Add) File: (.+)$/m.exec(block);
      if (!m) continue;
      const added = block.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).filter((l) => l.trim());
      files.push({ path: abs(m[1].trim()), added: added.length ? added : null });
    }
    return files;
  }
  if (flavor === "cline") {
    const p = (input.postToolUse as { parameters?: { path?: string } } | undefined)?.parameters?.path;
    return p ? [{ path: abs(p), added: null }] : [];
  }
  if (flavor === "copilot") {
    let args: Record<string, unknown> = {};
    try { args = typeof input.toolArgs === "string" ? JSON.parse(input.toolArgs) : ((input.toolArgs as Record<string, unknown>) ?? {}); } catch { /* not JSON */ }
    const p = (args.path ?? args.file_path ?? args.filePath) as string | undefined;
    return p ? [{ path: abs(p), added: null }] : [];
  }
  const p = ti.file_path ?? ti.path ?? ti.target_file ?? (input.file_path as string | undefined) ?? (input.filePath as string | undefined);
  if (p) {
    const pieces = flavor === "claude" || flavor === "devin" || flavor === "junie"
      ? (input.tool_name === "Write" ? null : [ti.new_string, ...(ti.edits ?? []).map((e) => e.new_string)].filter((x): x is string => !!x))
      : flavor === "gemini" && ti.new_string ? [ti.new_string] : null;
    return [{ path: abs(p), added: pieces && pieces.length ? pieces : null }];
  }
  if (flavor === "kiro") {
    // Kiro's file-save payload isn't documented; fall back to prose files changed in the working tree.
    try {
      return execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd, encoding: "utf8" }).split("\n").filter((f) => /\.(md|mdx|html)$/i.test(f)).map((f) => ({ path: abs(f), added: null }));
    } catch { return []; }
  }
  return [];
}

/** Send feedback in the shape this harness reads back to the model. */
function feedback(flavor: HookFlavor, event: "PostToolUse" | "Stop", text: string) {
  switch (flavor) {
    case "cursor": process.stdout.write(JSON.stringify({ additional_context: text })); return;
    case "copilot": process.stdout.write(JSON.stringify({ additionalContext: text })); return;
    case "cline": process.stdout.write(JSON.stringify({ cancel: false, contextModification: text })); return;
    case "kiro": process.stdout.write(text + "\n"); return;
    case "devin": process.stdout.write(JSON.stringify({ decision: "block", reason: text })); return;
    case "gemini":
      if (event === "Stop") { process.stdout.write(JSON.stringify({ decision: "deny", reason: text })); return; }
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "AfterTool", additionalContext: text } })); return;
    default:
      if (event === "Stop") { process.stdout.write(JSON.stringify({ decision: "block", reason: text })); return; }
      out("PostToolUse", text);
  }
}

function list(hits: Finding[], max = 12): string {
  const lines = hits.slice(0, max).map((f) => `- line ${f.line}: "${f.match}" (${f.origin === "lexicon" ? "measured phrase" : f.id}) → ${f.origin === "lexicon" ? f.name : f.fix ?? f.name}`);
  if (hits.length > max) lines.push(`- …and ${hits.length - max} more (run: npx shibbo check <file>)`);
  return lines.join("\n");
}

/** Hits that count toward the score, skipping advisory notes. */
const real = (fs: Finding[]) => fs.filter((f) => f.counted && f.severity > 0);

export async function runHook(kind: string | undefined, raw: string, flavor: HookFlavor = "claude") {
  let input: HookInput = {};
  try { input = raw.trim() ? JSON.parse(raw) : {}; } catch { return; }

  if (kind === "session-start") {
    if (input.session_id && input.model) {
      mkdirSync(stateDir(), { recursive: true });
      writeFileSync(stateFile(input.session_id), JSON.stringify({ model: input.model }));
    }
    out("SessionStart", `shibbo is checking your writing and interfaces for tells that read as machine-made.\n\n${rulesMarkdown({ model: modelFor(input), limit: 10, phrases: 8 })}\n\n${interfaceMarkdown({ limit: 12 })}`);
    return;
  }

  if (kind === "post-edit") {
    if (process.env.SHIBBO_EDIT === "off") { if (flavor === "cline") process.stdout.write('{"cancel":false}'); return; }
    const notes: string[] = [];
    for (const { path, added } of editedFiles(input, flavor)) {
      if (!existsSync(path)) continue;
      const fk = kindOf(path);
      if (fk === "code" || (fk === "text" && !/\.(txt|rst)$/i.test(path))) continue; // prose, HTML, CSS and markup only
      const text = readFileSync(path, "utf8");
      const report = check(text, path, { model: modelFor(input), disable: disabled() });
      let hits = real(report.findings);
      if (added) {
        const ranges = added.flatMap((piece) => { const i = text.indexOf(piece); return i < 0 ? [] : [[i, i + piece.length] as const]; });
        hits = hits.filter((f) => ranges.some(([a, b]) => f.offset >= a && f.offset < b));
      }
      log({ event: "edit", model: modelFor(input), file: path, words: report.words, score: report.score, hits: ids(hits) });
      if (hits.length) notes.push(`shibbo found ${hits.length} ${/^(html|css|markup-code)$/.test(fk) ? "" : "writing "}tell${hits.length > 1 ? "s" : ""} in ${path} (file score ${report.score}/100). Rewrite these unless they are quotes or deliberate:\n${list(hits)}`);
    }
    if (notes.length) feedback(flavor, "PostToolUse", notes.join("\n\n"));
    else if (flavor === "cline") process.stdout.write('{"cancel":false}');
    return;
  }

  if (kind === "stop") {
    const mode = process.env.SHIBBO_STOP ?? "block";
    if (mode === "off" || input.stop_hook_active) return;
    const msg = (input.last_assistant_message ?? (input.prompt_response as string | undefined) ?? "") as string;
    const report = check(msg, "-", { kind: "markdown", model: modelFor(input), disable: disabled() });
    if (report.words < 60) return;
    const hits = real(report.findings);
    const floor = +(process.env.SHIBBO_STOP_SCORE ?? 50);
    const held = report.score < floor && hits.length >= 3;
    // The wording passed. With a judge set, a small model now reads a reply of 80+ words for clarity.
    let verdict: Verdict | null | undefined, judgeError: string | undefined;
    if (!held && report.words >= 80 && (process.env.SHIBBO_JUDGE ?? "").trim()) verdict = await judgeReply(msg, { onError: (why) => { judgeError = why; } });
    const unclear = !!verdict && shouldHold(verdict);
    log({ event: "reply", model: modelFor(input), words: report.words, score: report.score, hits: ids(hits), held: (held || unclear) && mode === "block",
      judge: verdict === undefined ? undefined : verdict && { failed: verdict.failed }, judge_error: judgeError,
      text: process.env.SHIBBO_LOG_TEXT === "1" ? msg : undefined });
    if (!held && !unclear) return;
    const reason = held
      ? `shibbo: your reply scores ${report.score}/100 for writing tells. Rewrite it in plain language before finishing:\n${list(hits, 10)}`
      : judgeMessage(verdict!);
    if (mode === "block") feedback(flavor, "Stop", reason);
    else out("Stop", reason);
    return;
  }

  process.stderr.write(`shibbo hook: unknown kind "${kind}" (use session-start, post-edit or stop)\n`);
}
