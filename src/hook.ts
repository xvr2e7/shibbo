// Claude Code hook entry points. Each reads the hook's JSON from stdin and prints JSON (or nothing).
//
//   session-start  remember the session's model; add that model's rules to context
//   post-edit      after Write/Edit, check the changed region and hand hits back to Claude
//   stop           check Claude's final message; block only when it reads as heavy slop
//
// Settings (env): SHIBBO_STOP=off|warn|block (default block), SHIBBO_STOP_SCORE (default 50),
// SHIBBO_EDIT=off|on (default on), SHIBBO_DISABLE=id,id, SHIBBO_MODEL to force a model.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { check, type Finding } from "./check.js";
import { rulesMarkdown } from "./rules.js";
import { kindOf } from "./text.js";

interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  model?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string; edits?: Array<{ new_string?: string }> };
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

const out = (event: string, context: string) =>
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }));

function list(hits: Finding[], max = 12): string {
  const lines = hits.slice(0, max).map((f) => `- line ${f.line}: "${f.match}" (${f.origin === "lexicon" ? "measured phrase" : f.id}) → ${f.origin === "lexicon" ? f.name : f.fix ?? f.name}`);
  if (hits.length > max) lines.push(`- …and ${hits.length - max} more (run: npx shibbo check <file>)`);
  return lines.join("\n");
}

/** Hits that count toward the score, skipping advisory notes. */
const real = (fs: Finding[]) => fs.filter((f) => f.counted && f.severity > 0);

export async function runHook(kind: string | undefined, raw: string) {
  let input: HookInput = {};
  try { input = raw.trim() ? JSON.parse(raw) : {}; } catch { return; }

  if (kind === "session-start") {
    if (input.session_id && input.model) {
      mkdirSync(stateDir(), { recursive: true });
      writeFileSync(stateFile(input.session_id), JSON.stringify({ model: input.model }));
    }
    out("SessionStart", `shibbo is checking your writing for tells that read as machine-made.\n\n${rulesMarkdown({ model: modelFor(input), limit: 10, phrases: 8 })}`);
    return;
  }

  if (kind === "post-edit") {
    if (process.env.SHIBBO_EDIT === "off") return;
    const path = input.tool_input?.file_path;
    if (!path || !existsSync(path)) return;
    const fk = kindOf(path);
    if (fk === "code" || (fk === "text" && !/\.(txt|rst)$/i.test(path))) return; // prose, HTML, CSS and markup only
    const text = readFileSync(path, "utf8");
    const report = check(text, path, { model: modelFor(input), disable: disabled() });
    let hits = real(report.findings);
    // For edits, only report what this edit wrote.
    const pieces = input.tool_name === "Write" ? null : [input.tool_input?.new_string, ...(input.tool_input?.edits ?? []).map((e) => e.new_string)].filter((x): x is string => !!x);
    if (pieces) {
      const ranges = pieces.flatMap((p) => { const i = text.indexOf(p); return i < 0 ? [] : [[i, i + p.length] as const]; });
      hits = hits.filter((f) => ranges.some(([a, b]) => f.offset >= a && f.offset < b));
    }
    if (!hits.length) return;
    out("PostToolUse", `shibbo found ${hits.length} writing tell${hits.length > 1 ? "s" : ""} in ${path} (file score ${report.score}/100). Rewrite these unless they are quotes or deliberate:\n${list(hits)}`);
    return;
  }

  if (kind === "stop") {
    const mode = process.env.SHIBBO_STOP ?? "block";
    if (mode === "off" || input.stop_hook_active) return;
    const msg = input.last_assistant_message ?? "";
    const report = check(msg, "-", { kind: "markdown", model: modelFor(input), disable: disabled() });
    if (report.words < 60) return;
    const hits = real(report.findings);
    const floor = +(process.env.SHIBBO_STOP_SCORE ?? 50);
    if (report.score >= floor || hits.length < 3) return;
    const reason = `shibbo: your reply scores ${report.score}/100 for writing tells. Rewrite it in plain language before finishing:\n${list(hits, 10)}`;
    if (mode === "block") process.stdout.write(JSON.stringify({ decision: "block", reason }));
    else out("Stop", reason);
    return;
  }

  process.stderr.write(`shibbo hook: unknown kind "${kind}" (use session-start, post-edit or stop)\n`);
}
