import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { init, HARNESSES } from "../src/harness.js";

const dir = mkdtempSync(join(tmpdir(), "shibbo-test-"));
const doc = join(dir, "doc.md");
writeFileSync(doc, "# Notes\n\nThis is a genuinely useful approach. That distinction matters. It is not a refactor, it is a rethink.\n");
const cli = join(process.cwd(), "src", "cli.ts");
const hook = (flavor: string, input: unknown, event = "post-edit") =>
  execFileSync("npx", ["tsx", cli, "hook", event, "--for", flavor], { input: JSON.stringify(input), encoding: "utf8" });

test("each hook adapter answers in its harness's format", () => {
  assert.match(JSON.parse(hook("claude", { tool_name: "Write", tool_input: { file_path: doc } })).hookSpecificOutput.additionalContext, /writing tell/);
  assert.match(JSON.parse(hook("cursor", { tool_input: { file_path: doc } })).additional_context, /writing tell/);
  assert.match(JSON.parse(hook("copilot", { cwd: dir, toolArgs: JSON.stringify({ path: "doc.md" }) })).additionalContext, /writing tell/);
  assert.match(JSON.parse(hook("cline", { postToolUse: { parameters: { path: doc } } })).contextModification, /writing tell/);
  assert.equal(JSON.parse(hook("devin", { tool_input: { file_path: doc } })).decision, "block");
  assert.equal(JSON.parse(hook("gemini", { tool_input: { file_path: doc } })).hookSpecificOutput.hookEventName, "AfterTool");
  const patch = "*** Begin Patch\n*** Update File: doc.md\n@@\n+This is a genuinely useful approach. That distinction matters. It is not a refactor, it is a rethink.\n*** End Patch";
  assert.match(JSON.parse(hook("codex", { cwd: dir, tool_input: { command: patch } })).hookSpecificOutput.additionalContext, /writing tell/);
});

test("cline always answers with JSON, even with nothing to report", () => {
  assert.deepEqual(JSON.parse(hook("cline", { postToolUse: { parameters: { path: join(dir, "missing.md") } } })), { cancel: false });
});

test("stop hooks respect stop_hook_active", () => {
  assert.equal(hook("claude", { stop_hook_active: true, last_assistant_message: "x ".repeat(100) }, "stop"), "");
});

test("init merges into existing JSON and leaves other keys alone", () => {
  const p = mkdtempSync(join(tmpdir(), "shibbo-init-"));
  writeFileSync(join(p, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
  init("claude", { dir: p, model: null, dryRun: false });
  const mcp = JSON.parse(readFileSync(join(p, ".mcp.json"), "utf8"));
  assert.ok(mcp.mcpServers.other && mcp.mcpServers.shibbo);
  assert.ok(JSON.parse(readFileSync(join(p, ".claude/settings.json"), "utf8")).hooks.PostToolUse);
  assert.match(readFileSync(join(p, "CLAUDE.md"), "utf8"), /shibbo:start/);
});

test("init never overwrites a file it can't parse", () => {
  const p = mkdtempSync(join(tmpdir(), "shibbo-init-"));
  writeFileSync(join(p, ".mcp.json"), "{ // comments\n}");
  const r = init("claude", { dir: p, model: null, dryRun: false });
  assert.ok(r.some((x) => x.action.startsWith("skipped")));
  assert.equal(readFileSync(join(p, ".mcp.json"), "utf8"), "{ // comments\n}");
});

test("every harness can be initialised in a dry run", () => {
  for (const h of HARNESSES) {
    const p = mkdtempSync(join(tmpdir(), "shibbo-dry-"));
    assert.doesNotThrow(() => init(h.id, { dir: p, model: null, dryRun: true }), h.id);
    assert.ok(!existsSync(join(p, ".mcp.json")), `${h.id} wrote during a dry run`);
  }
});

test("cline hook script is executable", () => {
  const p = mkdtempSync(join(tmpdir(), "shibbo-init-"));
  init("cline", { dir: p, model: null, dryRun: false });
  assert.ok(statSync(join(p, ".clinerules/hooks/PostToolUse")).mode & 0o100);
});
