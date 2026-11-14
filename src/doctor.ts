// `shibbo doctor`: what runs here, whether it is current, and what a project has set up.
// Hooks swallow their own errors so they can't break a session; this is where a user looks when nothing seems to happen.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { check } from "./check.js";
import { blockVersion } from "./export.js";
import { HARNESSES, type Step } from "./harness.js";
import { graphite, root, tells, version } from "./registry.js";

export type State = "ok" | "warn" | "fail" | "note";
export interface Line { section: string; state: State; text: string; fix?: string }
export type InstallKind = "plugin" | "npx" | "project" | "npm" | "source";
export interface DoctorReport {
  version: string;
  /** Newest version on npm; null when offline or the registry didn't answer. */
  latest: string | null;
  install: { kind: InstallKind; path: string };
  lines: Line[];
}
export interface DoctorOptions {
  dir: string;
  /** Skip the npm lookup. */
  offline?: boolean;
  /** Tests pass these in place of the network, the home folder and the environment. */
  latest?: string | null;
  home?: string;
  env?: Record<string, string | undefined>;
}

const SAMPLE = "This is a genuinely useful approach. That distinction matters. It is not a refactor, it is a rethink.";
const UPDATE: Record<InstallKind, string> = {
  plugin: "claude plugin update shibbo@shibbo",
  npx: "npx shibbo@latest doctor",
  project: "npm install shibbo@latest",
  npm: "npm install -g shibbo@latest",
  source: "git pull, then npm run build",
};
const HOW: Record<InstallKind, string> = {
  plugin: "the Claude Code plugin",
  npx: "the npx cache",
  project: "this project's node_modules",
  npm: "an npm install",
  source: "a source checkout",
};

/** -1, 0 or 1 by major.minor.patch; a pre-release tag is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split("-")[0].split(".").map((n) => Number(n) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

function installOf(dir: string): DoctorReport["install"] {
  const path = root();
  const segs = path.split(sep);
  const kind: InstallKind =
    !existsSync(join(path, "package.json")) && existsSync(join(path, ".claude-plugin", "plugin.json")) ? "plugin"
    : segs.includes("_npx") ? "npx"
    : path.startsWith(join(resolve(dir), "node_modules") + sep) ? "project"
    : segs.includes("node_modules") ? "npm"
    : "source";
  return { kind, path };
}

async function newest(): Promise<string | null> {
  try {
    const r = await fetch("https://registry.npmjs.org/shibbo/latest", { signal: AbortSignal.timeout(4000) });
    const v = r.ok ? ((await r.json()) as { version?: unknown }).version : null;
    return typeof v === "string" ? v : null;
  } catch { return null; }
}

/** The plugin version Claude Code has on record for this user, if any. */
function pluginRecord(home: string, env: Record<string, string | undefined>): string | null {
  try {
    const file = join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "plugins", "installed_plugins.json");
    const plugins = (JSON.parse(readFileSync(file, "utf8")) as { plugins?: Record<string, Array<{ version?: string }>> }).plugins ?? {};
    const key = Object.keys(plugins).find((k) => k.startsWith("shibbo@"));
    return key ? plugins[key][0]?.version ?? "unknown" : null;
  } catch { return null; }
}

type Found = "set" | "missing" | { stamp: string | null };

/** Does this file hold what the step would write? */
function found(dir: string, step: Step): Found {
  const p = join(dir, step.file!);
  if (!existsSync(p)) return "missing";
  const text = readFileSync(p, "utf8");
  if (step.kind === "rules") {
    if (step.file!.endsWith("shibbo.md")) return "set";
    const v = blockVersion(text);
    return v === undefined ? "missing" : { stamp: v };
  }
  if (step.json) {
    try {
      let at: unknown = JSON.parse(text);
      for (const k of step.json.path) at = at && typeof at === "object" ? (at as Record<string, unknown>)[k] : undefined;
      return at !== undefined && /shibbo/.test(JSON.stringify(at)) ? "set" : "missing";
    } catch { /* comments or a trailing comma: fall back to the text */ }
  }
  return text.includes("shibbo") ? "set" : "missing";
}

const WHAT: Record<Step["kind"], string> = { rules: "rules", mcp: "MCP server", hooks: "hooks", note: "" };

export async function doctor(opts: DoctorOptions): Promise<DoctorReport> {
  const env = opts.env ?? process.env;
  const cur = version();
  const install = installOf(opts.dir);
  const latest = opts.latest !== undefined ? opts.latest : opts.offline ? null : await newest();
  const lines: Line[] = [];
  const add = (section: string, state: State, text: string, fix?: string) => lines.push({ section, state, text, fix });

  // ── the install ──
  if (latest === null) add("Install", "note", opts.offline ? "skipped the npm lookup (--offline)" : "could not reach npm to look up the newest version");
  else if (compareVersions(cur, latest) < 0) add("Install", "warn", `${latest} is on npm; this is ${cur}`, UPDATE[install.kind]);
  else add("Install", "ok", `${cur} is the newest version`);

  const node = process.versions.node;
  if (Number(node.split(".")[0]) >= 20) add("Install", "ok", `Node ${node}`);
  else add("Install", "fail", `Node ${node}; shibbo needs 20 or later`, "install Node 20 or later");

  try {
    const measured = Object.keys(graphite()?.models ?? {}).length; // graphite() already merges shibbo's own runs
    add("Install", "ok", `data loads: ${tells().length} tells, ${measured} measured models`);
    const hits = check(SAMPLE, "sample.md").findings.filter((f) => f.counted && f.severity > 0).length;
    if (hits) add("Install", "ok", `checker works: ${hits} hits in the sample sentence`);
    else add("Install", "fail", "checker found nothing in a sentence full of tells", "reinstall shibbo");
  } catch (e) {
    add("Install", "fail", `data does not load: ${e instanceof Error ? e.message : e}`, "reinstall shibbo");
  }

  // ── what this project has set up ──
  // One entry per file and purpose; several harnesses can share one (AGENTS.md, .mcp.json).
  const key = (s: Step) => `${s.file}\n${s.kind}`;
  const entries = new Map<string, { step: Step; ids: Set<string>; found: Found }>();
  for (const h of HARNESSES) for (const step of h.steps("")) {
    if (!step.file) continue;
    const seen = entries.get(key(step));
    if (seen) seen.ids.add(h.id);
    else entries.set(key(step), { step, ids: new Set([h.id]), found: found(opts.dir, step) });
  }
  const entry = (s: Step) => entries.get(key(s))!;
  const has = (s: Step) => !!s.file && entry(s).found !== "missing";
  // A harness is set up when a config file only it uses is there, or a shared one plus its own rules file.
  const setUp = HARNESSES.filter((h) => {
    const steps = h.steps("");
    const config = steps.filter((s) => s.kind !== "rules" && has(s));
    return config.some((s) => entry(s).ids.size === 1) || (config.length > 0 && steps.some((s) => s.kind === "rules" && has(s)));
  });
  const initFor = (ids: Set<string>) => `npx shibbo init ${setUp.find((h) => ids.has(h.id))?.id ?? [...ids][0]}`;

  for (const f of entries.values()) {
    const file = f.step.file!;
    if (f.found === "missing") continue;
    if (f.found === "set") { add("Project", "ok", `${file}: ${WHAT[f.step.kind]}`); continue; }
    const stamp = f.found.stamp;
    if (stamp === null) add("Project", "warn", `${file}: rules block from an older shibbo (no version stamp)`, initFor(f.ids));
    else if (compareVersions(stamp, cur) < 0) add("Project", "warn", `${file}: rules block written by ${stamp}; this is ${cur}`, initFor(f.ids));
    else add("Project", "ok", `${file}: rules block written by ${stamp}`);
  }
  const told = new Set<string>();
  for (const h of setUp) for (const s of h.steps("")) {
    if (!s.file || s.experimental || has(s) || told.has(key(s))) continue;
    told.add(key(s));
    add("Project", "warn", `${s.file}: no ${WHAT[s.kind]} for ${h.name}`, `npx shibbo init ${h.id}`);
  }
  if (![...entries.values()].some((f) => f.found !== "missing")) add("Project", "note", `nothing from shibbo in ${resolve(opts.dir)}`, "npx shibbo init <harness>");

  // ── the Claude Code plugin ──
  const plugin = install.kind === "plugin" ? cur : pluginRecord(opts.home ?? homedir(), env);
  if (plugin) {
    if (latest && plugin !== "unknown" && compareVersions(plugin, latest) < 0) add("Claude Code plugin", "warn", `${plugin} installed; ${latest} is out`, UPDATE.plugin);
    else add("Claude Code plugin", "ok", `${plugin} installed`);
    if (entries.get(".claude/settings.json\nhooks")?.found === "set") add("Claude Code plugin", "warn", "the plugin and .claude/settings.json both run shibbo's hooks, so each edit is checked twice", "remove shibbo's hooks from .claude/settings.json, or uninstall the plugin");
  }

  // ── settings that change what the hooks do ──
  if (env.SHIBBO_EDIT === "off") add("Settings", "warn", "SHIBBO_EDIT=off: the after-edit check is off");
  if (env.SHIBBO_STOP === "off") add("Settings", "warn", "SHIBBO_STOP=off: the reply check is off");
  for (const k of ["SHIBBO_MODEL", "SHIBBO_DISABLE", "SHIBBO_STOP_SCORE", "SHIBBO_JUDGE"]) if (env[k]) add("Settings", "note", `${k}=${env[k]}`);
  if (!env.SHIBBO_LOG) add("Settings", "note", "SHIBBO_LOG is not set, so no record of hook runs exists", "set SHIBBO_LOG to a file path to record each check");
  else if (!existsSync(env.SHIBBO_LOG)) add("Settings", "warn", `SHIBBO_LOG=${env.SHIBBO_LOG}: no file yet, so no hook has run a check since it was set`);
  else {
    const rows = readFileSync(env.SHIBBO_LOG, "utf8").trim().split("\n").filter(Boolean);
    let last = "unknown";
    try { last = (JSON.parse(rows.at(-1)!) as { at?: string }).at ?? last; } catch { /* a torn last line */ }
    add("Settings", "ok", `SHIBBO_LOG: ${rows.length} checks recorded, the last at ${last}`);
  }

  return { version: cur, latest, install, lines };
}

type Paint = Record<"bold" | "dim" | "red" | "green" | "yellow", (s: string) => string>;

export function printDoctor(r: DoctorReport, C: Paint): string {
  const mark: Record<State, string> = { ok: C.green("ok  "), warn: C.yellow("warn"), fail: C.red("fail"), note: C.dim("note") };
  const out = [`${C.bold(`shibbo ${r.version}`)} ${C.dim(`from ${HOW[r.install.kind]} (${r.install.path})`)}`];
  let section = "";
  for (const l of r.lines) {
    if (l.section !== section) { section = l.section; out.push("", C.bold(section)); }
    out.push(`  ${mark[l.state]}  ${l.text}`);
    if (l.fix) out.push(`        ${C.dim("→ " + l.fix)}`);
  }
  const count = (s: State) => r.lines.filter((l) => l.state === s).length;
  const [fails, warns] = [count("fail"), count("warn")];
  out.push("", fails || warns ? `${fails} ${fails === 1 ? "failure" : "failures"}, ${warns} ${warns === 1 ? "warning" : "warnings"}` : "Nothing to fix.");
  return out.join("\n");
}
