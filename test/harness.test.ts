import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

test("init keeps the user's own hooks and a second run changes nothing", () => {
  const mine = { type: "command", command: "echo mine" };
  const seed: Record<string, [string, unknown]> = {
    claude: [".claude/settings.json", { permissions: { allow: ["Bash(ls)"] }, hooks: { PostToolUse: [{ matcher: "Bash", hooks: [mine] }], Stop: [{ hooks: [mine] }], PreToolUse: [{ hooks: [mine] }] } }],
    codex: [".codex/hooks.json", { hooks: { PostToolUse: [{ matcher: "shell", hooks: [mine] }] } }],
    cursor: [".cursor/hooks.json", { version: 1, hooks: { postToolUse: [{ command: "echo mine" }], stop: [{ command: "echo mine" }] } }],
    copilot: [".github/hooks/shibbo.json", { version: 1, hooks: { postToolUse: [{ type: "command", bash: "echo mine" }] } }],
    gemini: [".gemini/settings.json", { hooks: { AfterTool: [{ matcher: "x", hooks: [mine] }] } }],
    devin: [".devin/hooks.v1.json", { PostToolUse: [{ matcher: "x", hooks: [mine] }] }],
    kiro: [".kiro/hooks/shibbo.json", { version: "v1", hooks: [{ name: "mine", action: mine }] }],
  };
  for (const [id, [file, body]] of Object.entries(seed)) {
    const p = mkdtempSync(join(tmpdir(), "shibbo-init-"));
    mkdirSync(dirname(join(p, file)), { recursive: true });
    writeFileSync(join(p, file), JSON.stringify(body));
    init(id, { dir: p, model: null, dryRun: false });
    const once = readFileSync(join(p, file), "utf8");
    assert.equal(once.match(/echo mine/g)?.length, JSON.stringify(body).match(/echo mine/g)!.length, `${id} lost a hook`);
    assert.match(once, /shibbo hook post-edit/, id);
    init(id, { dir: p, model: null, dryRun: false });
    assert.equal(readFileSync(join(p, file), "utf8"), once, `${id} changed on the second run`);
  }
  const p = mkdtempSync(join(tmpdir(), "shibbo-init-"));
  mkdirSync(join(p, ".claude"));
  const old = { matcher: "Write", hooks: [mine, { type: "command", command: "node plugins/shibbo/bin/shibbo.mjs hook post-edit" }] };
  writeFileSync(join(p, ".claude/settings.json"), JSON.stringify({ hooks: { PostToolUse: [old] } }));
  init("claude", { dir: p, model: null, dryRun: false });
  const post = JSON.parse(readFileSync(join(p, ".claude/settings.json"), "utf8")).hooks.PostToolUse;
  assert.deepEqual(post[0], { matcher: "Write", hooks: [mine] });
  assert.equal(JSON.stringify(post).match(/shibbo/g)?.length, 1);
});

test("init leaves a hook script it did not write", () => {
  const p = mkdtempSync(join(tmpdir(), "shibbo-init-"));
  mkdirSync(join(p, ".clinerules/hooks"), { recursive: true });
  writeFileSync(join(p, ".clinerules/hooks/PostToolUse"), "#!/bin/sh\necho mine\n");
  assert.ok(init("cline", { dir: p, model: null, dryRun: false }).some((x) => x.action.startsWith("skipped")));
  assert.equal(readFileSync(join(p, ".clinerules/hooks/PostToolUse"), "utf8"), "#!/bin/sh\necho mine\n");
});

test("doctor reads what init wrote, and flags an old rules block, missing hooks and a newer release", async () => {
  const { doctor, compareVersions } = await import("../src/doctor.js");
  const { blockVersion } = await import("../src/export.js");
  const { version } = await import("../src/registry.js");
  const p = mkdtempSync(join(tmpdir(), "shibbo-doctor-"));
  const run = (latest: string | null = null) => doctor({ dir: p, latest, home: p, env: {} });
  const project = async () => (await run()).lines.filter((l) => l.section === "Project");

  assert.equal((await project())[0].state, "note"); // nothing set up yet
  init("claude", { dir: p, model: null, dryRun: false });
  assert.equal(blockVersion(readFileSync(join(p, "CLAUDE.md"), "utf8")), version());
  assert.deepEqual((await project()).map((l) => l.state), ["ok", "ok", "ok"]); // rules, MCP, hooks; Copilot shares .mcp.json and stays out

  // A block from before the stamp, and hooks removed by hand.
  writeFileSync(join(p, "CLAUDE.md"), readFileSync(join(p, "CLAUDE.md"), "utf8").replace(/<!-- shibbo:start v[^ ]+ -->/, "<!-- shibbo:start -->"));
  writeFileSync(join(p, ".claude", "settings.json"), "{}");
  const warns = (await project()).filter((l) => l.state === "warn");
  assert.equal(warns.length, 2);
  assert.ok(warns.every((l) => l.fix === "npx shibbo init claude"));
  init("claude", { dir: p, model: null, dryRun: false }); // the fix replaces the old block in place
  assert.equal(readFileSync(join(p, "CLAUDE.md"), "utf8").match(/shibbo:start/g)!.length, 1);
  assert.ok((await project()).every((l) => l.state === "ok"));

  const behind = (await run("99.0.0")).lines.find((l) => l.text.includes("99.0.0"))!;
  assert.equal(behind.state, "warn");
  assert.ok(!(await run()).lines.some((l) => l.state === "fail"));
  assert.equal(compareVersions("0.9.9", "0.10.0"), -1);
  assert.equal(compareVersions("1.2.3", "1.2.3-beta.1"), 0);

  // The plugin on record plus project hooks means every edit is checked twice.
  mkdirSync(join(p, ".claude", "plugins"), { recursive: true });
  writeFileSync(join(p, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "shibbo@shibbo": [{ version: "0.1.0" }] } }));
  assert.ok((await run()).lines.some((l) => l.section === "Claude Code plugin" && /twice/.test(l.text)));
});
