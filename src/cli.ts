#!/usr/bin/env node
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { check, type Report } from "./check.js";
import { rulesMarkdown, modelList } from "./rules.js";
import { tells, sources, resolveModel, graphite } from "./registry.js";
import { kindOf, type FileKind } from "./text.js";

const HELP = `shibbo: find the tells that mark writing and UI as machine-made

Usage
  shibbo check <files|dirs|-> [--model ID] [--format text|json|github] [--threshold N] [--all]
  shibbo rules [--model ID] [--domain prose,chat] [--limit N] [--phrases N]
  shibbo list [--domain D] [--status S]
  shibbo show <tell-id>
  shibbo models
  shibbo export <claude|agents|cursor|vale> [--model ID] [--out DIR]
  shibbo mcp                 start the MCP server (stdio)
  shibbo hook <post-edit|stop|session-start>   Claude Code hook entry (reads stdin)

check options
  --model ID       the model that wrote the text (e.g. claude-opus-5-5, gpt-6). Weights its own measured phrases.
  --threshold N    exit 1 when any file scores below N (default 0: never fail)
  --all            also print hits that stayed under their density limit
  --kind K         force file kind for stdin: markdown|text|html|css|code
  --no-lexicon     skip measured phrase hits; curated rules only
  --disable a,b    skip these tell ids
`;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage", "vendor"]);

function* walk(path: string): Generator<string> {
  const st = statSync(path);
  if (st.isFile()) { yield path; return; }
  for (const e of readdirSync(path, { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const p = join(path, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (kindOf(p) !== "text" || /\.txt$/i.test(p)) yield p;
  }
}

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { dim: (s: string) => `\x1b[2m${s}\x1b[0m`, bold: (s: string) => `\x1b[1m${s}\x1b[0m`, red: (s: string) => `\x1b[31m${s}\x1b[0m`, yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, green: (s: string) => `\x1b[32m${s}\x1b[0m` }
  : { dim: (s: string) => s, bold: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s, green: (s: string) => s };

function printText(r: Report, all: boolean) {
  const color = r.score >= 80 ? C.green : r.score >= 60 ? C.yellow : C.red;
  console.log(`${C.bold(r.file)}: ${color(`${r.score}/100 [${r.band}]`)} ${C.dim(`(${r.words} words${r.suppressed ? `, ${r.suppressed} hits in shibbo-ignore blocks` : ""})`)}`);
  for (const f of r.findings) {
    if (!f.counted && !all) continue;
    const sev = f.severity >= 3 ? C.red("high") : f.severity >= 2 ? C.yellow("med ") : f.severity > 0 ? C.dim("low ") : C.dim("note");
    const tag = f.origin === "lexicon" ? C.dim("measured") : f.id;
    console.log(`  ${C.dim(`${f.line}:${f.col}`.padEnd(8))} ${sev} ${tag.padEnd(24)} ${JSON.stringify(f.match.length > 70 ? f.match.slice(0, 70) + "…" : f.match)}`);
    if (f.origin === "registry" && f.fix) console.log(`  ${" ".repeat(8)}      ${C.dim("→ " + f.fix)}`);
    else if (f.origin === "lexicon") console.log(`  ${" ".repeat(8)}      ${C.dim("→ " + f.name)}`);
  }
  if (r.judge.length && all) for (const j of r.judge) console.log(`  ${C.dim("judge")}    ${j.id}: ${j.question}`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") { console.log(HELP); return; }

  if (cmd === "check") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        model: { type: "string" }, format: { type: "string", default: "text" }, threshold: { type: "string", default: "0" },
        all: { type: "boolean", default: false }, kind: { type: "string" }, "no-lexicon": { type: "boolean", default: false },
        disable: { type: "string" }, quiet: { type: "boolean", short: "q", default: false },
      },
    });
    const targets = positionals.length ? positionals : ["-"];
    const reports: Report[] = [];
    const opts = { model: values.model ?? process.env.SHIBBO_MODEL ?? null, lexicon: !values["no-lexicon"], disable: values.disable?.split(","), kind: values.kind as FileKind | undefined };
    for (const t of targets) {
      if (t === "-") { reports.push(check(await readStdin(), "-", { ...opts, kind: opts.kind ?? "text" })); continue; }
      for (const f of walk(t)) reports.push(check(readFileSync(f, "utf8"), relative(process.cwd(), f) || f, opts));
    }
    const threshold = +values.threshold!;
    if (values.format === "json") console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
    else if (values.format === "github") {
      for (const r of reports) for (const f of r.findings) if (f.counted && f.severity > 0) console.log(`::${f.severity >= 2 ? "warning" : "notice"} file=${r.file},line=${f.line},col=${f.col},title=shibbo ${f.id}::${f.match} → ${f.fix ?? f.name}`);
      for (const r of reports) console.log(`${r.file}: ${r.score}/100 [${r.band}]`);
    } else {
      for (const r of reports) if (!values.quiet || r.score < threshold) printText(r, values.all!);
    }
    if (reports.some((r) => r.score < threshold)) process.exitCode = 1;
    return;
  }

  if (cmd === "rules") {
    const { values } = parseArgs({ args: rest, options: { model: { type: "string" }, domain: { type: "string" }, limit: { type: "string" }, phrases: { type: "string" } } });
    console.log(rulesMarkdown({ model: values.model ?? process.env.SHIBBO_MODEL, domains: values.domain?.split(","), limit: values.limit ? +values.limit : undefined, phrases: values.phrases ? +values.phrases : undefined }));
    return;
  }

  if (cmd === "list") {
    const { values } = parseArgs({ args: rest, options: { domain: { type: "string" }, status: { type: "string" } } });
    for (const t of tells()) {
      if (values.domain && t.domain !== values.domain) continue;
      if (values.status && t.status !== values.status) continue;
      console.log(`${t.id.padEnd(26)} ${t.domain.padEnd(6)} ${t.status.padEnd(8)} sev ${t.severity}  ${t.name}`);
    }
    return;
  }

  if (cmd === "show") {
    const t = tells().find((x) => x.id === rest[0]);
    if (!t) { console.error(`unknown tell: ${rest[0]}`); process.exitCode = 2; return; }
    const g = graphite();
    console.log(`${C.bold(t.name)}  (${t.id}, ${t.domain}/${t.kind}, ${t.status}, confidence ${t.confidence})\n\n${t.what}\n`);
    if (t.fix) console.log(`Fix: ${t.fix}`);
    if (t.examples?.bad) console.log(`Bad:  ${t.examples.bad}\nGood: ${t.examples.good ?? ""}`);
    if (t.false_positives) console.log(`False positives: ${t.false_positives}`);
    const m = g?.tells[t.id];
    if (m) {
      console.log("\nMeasured ratio vs. people (Graphite 2026):");
      for (const [id, v] of Object.entries(m)) console.log(`  ${id.padEnd(18)} ${v.ratio === null ? "—" : `${v.ratio}×`}${v.term ? `  "${v.term}"` : ""}`);
    }
    const f = g?.tellFeatures[t.id];
    if (f) {
      console.log(`\nFeature ${f.feature} (people: ${f.human.toFixed(3)}):`);
      for (const [id, v] of Object.entries(f.models)) console.log(`  ${id.padEnd(18)} ${v.mean}  (${v.ratio}× people, d=${v.d})`);
    }
    console.log(`\nSources: ${t.sources.map((s) => sources()[s]?.url ?? s).join(", ")}`);
    return;
  }

  if (cmd === "models") { console.log(modelList()); return; }

  if (cmd === "export") {
    const { runExport } = await import("./export.js");
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { model: { type: "string" }, out: { type: "string", default: "." } } });
    runExport(positionals[0], { model: values.model ?? null, out: values.out! });
    return;
  }

  if (cmd === "mcp") { await (await import("./mcp.js")).serve(); return; }

  if (cmd === "hook") { await (await import("./hook.js")).runHook(rest[0], await readStdin()); return; }

  if (cmd === "resolve") { console.log(resolveModel(rest[0])?.id ?? "unknown"); return; }

  console.error(`unknown command: ${cmd}\n\n${HELP}`);
  process.exitCode = 2;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 2; });
