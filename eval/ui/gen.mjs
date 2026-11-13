#!/usr/bin/env node
// Build each brief under each arm with the real Claude Code binary, one scratch project per cell.
//   node eval/ui/gen.mjs [--brief id,id] [--arm id,id] [--jobs 4] [--model ID] [--tag NAME]
//                          [--reps N]
// Arms:
//   base       no harness
//   shibbo     the plugin in this checkout (session rules + post-edit and stop hooks)
//   shibbo-v1  an older copy of the plugin, at SHIBBO_V1 (prose rules only)
//   shibbo-ui  the plugin, plus `shibbo rules --domain ui` appended to the system prompt
//   hallmark   Hallmark's skill in the project, called by name (HALLMARK_DIR points at a clone)
// With --reps N each cell is built N times, in <arm>__1 .. <arm>__N, to show how alike repeat builds are.
// Every arm runs with --setting-sources project, so user-level plugins, skills and CLAUDE.md stay out.
// A cell that already has run.json is skipped; pass --tag to build a fresh set beside it.
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, createWriteStream } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const HALLMARK = process.env.HALLMARK_DIR ?? "/tmp/hallmark-study/repo";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const RUNS = join(HERE, "runs", arg("tag", "main"));
const briefs = JSON.parse(readFileSync(join(HERE, "briefs.json"), "utf8")).filter((b) => !arg("brief") || arg("brief").split(",").includes(b.id));
const arms = arg("arm", "base,shibbo,shibbo-ui,hallmark").split(",");
const jobs = +arg("jobs", 4), model = arg("model"), reps = +arg("reps", 1);
// Pin the model: the account default can change mid-run, which would mix two models in one comparison.
if (!model) { console.error("pass --model (e.g. claude-fable-5-1); the default model can change between runs"); process.exit(2); }
const V1 = process.env.SHIBBO_V1 ?? "/tmp/shibbo-eval/plugin-v1";
const SUFFIX = " Write it as one self-contained index.html in the current directory.";

function uiRules() {
  return execFileSync("npx", ["tsx", join(REPO, "src", "cli.ts"), "rules", "--domain", "ui", "--limit", "40", "--phrases", "0"], { cwd: REPO, encoding: "utf8" })
    .replace("## Writing tells to avoid", "## Interface tells to avoid")
    .replace("Readers spot these patterns as machine-made. Write the plain version instead.", "Viewers spot these patterns as machine-made. Design the page for its subject instead.");
}

function cell(brief, arm, rep) {
  const dir = join(RUNS, brief.id, reps > 1 ? `${arm}__${rep}` : arm);
  if (existsSync(join(dir, "run.json"))) return null;
  mkdirSync(dir, { recursive: true });
  const args = ["-p", "--setting-sources", "project", "--strict-mcp-config", "--no-session-persistence",
    "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
    "--allowedTools", "Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(node:*)", "Bash(ls:*)",
    "--max-budget-usd", "8"];
  if (model) args.push("--model", model);
  let prompt = brief.brief + SUFFIX;
  if (arm === "shibbo" || arm === "shibbo-ui") args.push("--plugin-dir", join(REPO, "plugins", "shibbo"));
  if (arm === "shibbo-v1") args.push("--plugin-dir", V1);
  if (arm === "shibbo-ui") args.push("--append-system-prompt", uiRules());
  if (arm === "hallmark") {
    cpSync(join(HALLMARK, "skills", "hallmark"), join(dir, ".claude", "skills", "hallmark"), { recursive: true });
    prompt = "/hallmark " + prompt;
  }
  return new Promise((done) => {
    const t0 = Date.now();
    const p = spawn("claude", [...args, "--", prompt], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    const log = createWriteStream(join(dir, "transcript.jsonl"));
    let buf = "", result = null, init = null;
    p.stdout.on("data", (d) => {
      log.write(d); buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const j = JSON.parse(l); if (j.type === "result") result = j; if (j.type === "system" && j.subtype === "init") init = j; } catch { /* partial line */ }
      }
    });
    p.stderr.on("data", (d) => log.write(d));
    p.on("close", (code) => {
      log.end();
      const run = { brief: brief.id, arm, rep, ok: existsSync(join(dir, "index.html")), exit: code, seconds: Math.round((Date.now() - t0) / 1000),
        model: init?.model ?? null, skills: init?.skills ?? null, plugins: init?.plugins ?? null,
        costUSD: result?.total_cost_usd ?? null, turns: result?.num_turns ?? null, stop: result?.subtype ?? null, outputTokens: result?.usage?.output_tokens ?? null };
      writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2));
      if (run.model && !run.model.startsWith(model) && !model.match(/^(sonnet|opus|haiku|fable)$/)) console.warn(`  model mismatch: asked ${model}, got ${run.model}`);
      console.log(`${brief.id}/${arm}#${rep}: ${run.ok ? "ok" : "NO PAGE"} ${run.seconds}s $${run.costUSD?.toFixed(2)} turns ${run.turns} ${run.stop}`);
      done();
    });
  });
}

const queue = briefs.flatMap((b) => arms.flatMap((a) => Array.from({ length: reps }, (_, i) => () => cell(b, a, i + 1))));
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await queue.shift()(); }));
