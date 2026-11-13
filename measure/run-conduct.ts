// Measure how a model conducts itself as an agent: the same small coding tasks (measure/conduct-tasks.yaml), each in a
// fresh throwaway git repo under /tmp, run headless through the Claude Code binary on your subscription.
//
//   npx tsx measure/run-conduct.ts --model claude-sonnet-5-5[,claude-opus-5-5...] [--task a,b] [--jobs 3] [--reps 1]
//   npx tsx measure/run-conduct.ts --selftest      build every repo and run its check untouched (each should fail,
//                                                  except vague-nicer, whose check only asks that the script still runs)
//
// Claude Code gets project settings only (no user CLAUDE.md, plugins or MCP servers), edits accepted without asking,
// and a short tool list: Read, Write, Edit, Glob, Grep, and Bash for npm, node, python3, pytest, git status/diff, ls.
// Each run is capped at $2 of reported usage. ANTHROPIC_API_KEY is removed from the child's environment so the run
// uses the subscription, never API credit.
// After the agent stops, the script records the repo's state (files created, edited, deleted; the diff) and then runs
// the task's hidden check, which the agent never saw: exit 0 means the task succeeded.
// Output: measure/conduct-runs/<model>/<task>__<rep>/{transcript.jsonl, diff.patch, run.json} (git-ignored).
// A run whose served model differs from the one asked for is saved but flagged (mismatch).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { root } from "../src/registry.js";

const { values } = parseArgs({ options: { model: { type: "string" }, task: { type: "string" }, jobs: { type: "string", default: "3" }, reps: { type: "string", default: "1" }, selftest: { type: "boolean", default: false }, recheck: { type: "boolean", default: false }, "max-budget": { type: "string", default: "2" } } });
const R = root();
type Task = { id: string; lang: string; task: string; check: string; files: Record<string, string> };
const spec = YAML.parse(readFileSync(join(R, "measure/conduct-tasks.yaml"), "utf8")) as { version: number; tasks: Task[] };
const tasks = spec.tasks.filter((t) => !values.task || values.task.split(",").includes(t.id));
const WORK = "/tmp/shibbo-conduct";
const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=shibbo", "-c", "user.email=shibbo@example.invalid", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" });

function build(t: Task, dir: string) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [f, body] of Object.entries(t.files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); }
  writeFileSync(join(dir, ".gitignore"), "__pycache__/\nnode_modules/\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "Initial commit");
}

function check(t: Task, dir: string) {
  const r = spawnSync("bash", ["-c", t.check], { cwd: dir, encoding: "utf8", timeout: 60000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  return { pass: r.status === 0, status: r.status, out: (r.stdout + r.stderr).slice(-2000) };
}

if (values.selftest) {
  for (const t of spec.tasks) {
    const dir = join(WORK, "_selftest", t.id);
    build(t, dir);
    const c = check(t, dir);
    console.log(`${t.id.padEnd(20)} untouched: ${c.pass ? "PASS" : "fail"}${(c.pass && t.id !== "vague-nicer") ? "  <-- check is too weak" : ""}`);
  }
  process.exit(0);
}
// --recheck: run each task's check again on the repos left under /tmp (after a change to a check), and update run.json.
if (values.recheck) {
  const base = join(R, "measure", "conduct-runs");
  for (const m of readdirSync(base)) for (const d of readdirSync(join(base, m))) {
    const rj = join(base, m, d, "run.json"), dir = join(WORK, m, d);
    const run = JSON.parse(readFileSync(rj, "utf8"));
    const t = spec.tasks.find((x) => x.id === run.task);
    if (!t || (values.task && !values.task.split(",").includes(t.id)) || !existsSync(dir)) continue;
    const ck = check(t, dir);
    if (ck.pass !== run.success) console.log(`${m} ${d}: ${run.success ? "PASS" : "FAIL"} -> ${ck.pass ? "PASS" : "FAIL"}`);
    writeFileSync(rj, JSON.stringify({ ...run, success: ck.pass, check: ck }, null, 1));
  }
  process.exit(0);
}
if (!values.model) { console.error("usage: run-conduct.ts --model <id>[,<id>...] [--task a,b] [--jobs 3]"); process.exit(2); }

function run(model: string, t: Task, rep: number): Promise<void> {
  const out = join(R, "measure", "conduct-runs", model, `${t.id}__${rep}`);
  const dir = join(WORK, model, `${t.id}__${rep}`);
  build(t, dir);
  const args = ["-p", "--model", model, "--setting-sources", "project", "--strict-mcp-config", "--no-session-persistence", "--output-format", "stream-json", "--verbose",
    "--permission-mode", "acceptEdits", "--allowedTools", "Read", "Write", "Edit", "Glob", "Grep", "Bash(npm:*)", "Bash(node:*)", "Bash(python3:*)", "Bash(pytest:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(ls:*)",
    "--max-budget-usd", values["max-budget"]!, "--", t.task];
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const t0 = Date.now();
  return new Promise((done) => {
    const c = spawn("claude", args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const kill = setTimeout(() => c.kill("SIGTERM"), 15 * 60 * 1000);
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (code) => {
      clearTimeout(kill);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "transcript.jsonl"), stdout);
      const events = stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const init = events.find((e) => e.type === "system" && e.subtype === "init");
      const result = [...events].reverse().find((e) => e.type === "result");
      const served = [...new Set(events.filter((e) => e.type === "assistant").map((e) => e.message?.model).filter(Boolean))];
      // The repo after the run, before the check touches anything.
      const status = git(dir, "status", "--porcelain", "-uall").split("\n").filter(Boolean).map((l) => ({ code: l.slice(0, 2), path: l.slice(3) }));
      git(dir, "add", "-A", "-N");
      writeFileSync(join(out, "diff.patch"), git(dir, "diff"));
      const commits = +git(dir, "rev-list", "--count", "HEAD").trim() - 1;
      const ck = check(t, dir);
      const want = model.replace(/-\d{8}$/, "");
      const mismatch = served.length > 0 && served.some((s) => !String(s).replace(/-\d{8}$/, "").startsWith(want));
      const run = { model, task: t.id, lang: t.lang, rep, tasks_version: spec.version, via: "claude-cli", cli: execFileSync("claude", ["--version"], { encoding: "utf8" }).trim(),
        exit: code, seconds: Math.round((Date.now() - t0) / 1000), init_model: init?.model ?? null, served, mismatch,
        result: result ? { subtype: result.subtype, is_error: result.is_error, num_turns: result.num_turns, duration_ms: result.duration_ms, total_cost_usd: result.total_cost_usd, usage: result.usage } : null,
        files: { created: status.filter((s) => s.code.includes("?") || s.code.includes("A")).map((s) => s.path), edited: status.filter((s) => s.code.includes("M")).map((s) => s.path), deleted: status.filter((s) => s.code.includes("D")).map((s) => s.path) },
        commits, success: ck.pass, check: ck, stderr: stderr.slice(-1000) };
      writeFileSync(join(out, "run.json"), JSON.stringify(run, null, 1));
      console.log(`${model} ${t.id}#${rep}: ${ck.pass ? "PASS" : "FAIL"} ${run.result?.num_turns ?? "?"} turns ${run.seconds}s${mismatch ? ` (served by ${served.join(",")})` : ""}${code ? ` exit ${code}` : ""}`);
      done();
    });
  });
}

const models = values.model.split(",");
const queue = models.flatMap((m) => tasks.flatMap((t) => Array.from({ length: +values.reps! }, (_, i) => ({ m, t, rep: i + 1 }))))
  .filter(({ m, t, rep }) => !existsSync(join(R, "measure", "conduct-runs", m, `${t.id}__${rep}`, "run.json")));
console.log(`${queue.length} runs to go`);
await Promise.all(Array.from({ length: +values.jobs! }, async () => { while (queue.length) { const q = queue.shift()!; await run(q.m, q.t, q.rep); } }));
