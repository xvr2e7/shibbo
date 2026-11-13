#!/usr/bin/env node
// Measure the code habits in each one-shot reply from measure/generate-code.ts, as readable tokens.
//
//   node measure/code-features.mjs
//   reads  measure/code-runs-api/<model>/<brief>__<rep>/{run.json, reply.txt, files/}
//   -> measure/code-features.json (one entry per reply: tokens, line counts, a short excerpt for the hover card)
//
// A reply counts when it came back from the model asked for (no mismatch) and at least one file came out of it.
// Every file the reply holds is read together as "the code". README and commit briefs get their own tokens.
//
// Thresholds:
//   length      verbosity: non-blank code lines against the median for that brief over every model's reply.
//               short < 0.67x, typical 0.67-1.5x, long 1.5-2.5x, very-long > 2.5x.
//   comments    comment lines (#, //, --, /* */ bodies; shebangs, docstrings and JSDoc excluded) per non-blank line:
//               none 0, light < 10%, moderate 10-25%, heavy > 25%.
//   narrating-comments   3+ comments that open with a plain verb saying what the next line does ("Create the
//               parser", "Check if the file exists", "Loop over rows", "Return the result").
//   section-banners      a comment holding a run of 3+ of - = * # ─ ━ next to words, or a line of 10+ of them.
//   docstrings  docs:every-function when 2+ functions and each has a docstring, JSDoc, /// or Go doc comment;
//               docs:trivial-function when a function of 3 body lines or fewer has one; docs:module when the
//               file opens with a docstring or a block comment of 3+ lines.
//   emoji, non-ascii     any emoji in the code (README excluded); 2+ other non-ASCII symbols (→ ✓ • — …) in code.
//   types       py:type-hints when half or more of the defs carry annotations, py:no-type-hints when none do.
//               ts:any for `: any`, `as any`, `<any>`; ts:ignore for @ts-ignore, @ts-expect-error, eslint-disable.
//               ts:return-types when half or more of the functions declare a return type.
//   errors      try:0, try:1-2, try:3+ blocks; py:broad-except for `except:` or `except Exception`.
//               guard-clauses: 2+ one-line `if ...: return/raise/continue` (or the braced form).
//               none-checks: 3+ `is None` / `== null` / `=== undefined` tests, or 3+ optional chains.
//   structure   nesting: deepest indent in code blocks, as levels (indent unit guessed per file): <=2, 3, 4, 5+.
//               fn-length: median function length in lines, short <= 10, medium 11-25, long > 25.
//               functions: 0, 1, 2-4, 5-8, 9+. classes when any class or struct with methods is declared.
//               named-constants: 2+ module-level UPPER_CASE names.
//   scripts     main-guard (`if __name__ == "__main__"`, Go func main, require.main === module); py:argparse,
//               py:sys-argv; shebang; exit-codes (sys.exit/process.exit with a value); example-usage (a comment
//               or block headed "example" or "usage" in code).
//   output      logging (Python logging, Go log, a logger object) against prints:0, prints:1-4, prints:5+.
//               py:f-strings, py:str-format, py:percent-format; py:pathlib, py:os-path.
//   style       indent:2, indent:4, indent:tabs (most common leading unit); js:semicolons-off when under 30% of
//               statement lines end in `;`; js:single-quotes / js:double-quotes by majority; js:var.
//   react       react:memo (useMemo/useCallback/memo), react:aria (3+ aria- or role=), react:inline-styles,
//               react:tailwind (className with 4+ utility classes), react:portal, react:escape-key, react:forward-ref.
//   go, sql, sh go:error-wrap (%w), sql:cte, sql:upper-keywords, sql:comments, sh:strict-mode (set -e...),
//               sh:functions.
//   tests       tests:<framework>; asserts:1-5, 6-15, 16+; tests:mocks; tests:parametrized (parametrize,
//               subTest, it.each/test.each); tests:classes; test-cases:1-4, 5-9, 10+.
//   readme      readme:badges, readme:emoji-headers, readme:toc, readme:features, readme:license, readme:contributing,
//               readme:tables, readme:sections:<=4/5-7/8+, readme:words:<200/200-399/400+.
//   commit      commit:subject:<=50/51-72/73+; commit:conventional; commit:body; commit:bullets; commit:period;
//               commit:lowercase.
//   reply       prose-outside-code: 3+ lines of text outside the code despite the instruction; unnamed-file: no file
//               name given; files:2+; truncated (stopped at max_tokens).
//   tells       tell:<id> for each code (domain code) tell that shibbo's checker finds in the reply's files.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = join(ROOT, "measure", "code-runs-api");
const VERSION = 1;
const canon = (id) => String(id).split("/").pop().replace(/-\d{8}$/, "");
const spec = YAML.parse(readFileSync(join(ROOT, "measure/code-briefs.yaml"), "utf8"));
const briefOf = Object.fromEntries(spec.briefs.map((b) => [b.id, b]));

// ── which replies ──
const runs = [];
for (const m of existsSync(BASE) ? readdirSync(BASE).sort() : []) {
  if (!statSync(join(BASE, m)).isDirectory()) continue;
  for (const d of readdirSync(join(BASE, m)).sort()) {
    const dir = join(BASE, m, d);
    if (!existsSync(join(dir, "run.json"))) continue;
    const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
    if (!run.ok || run.mismatch || !existsSync(join(dir, "files"))) continue;
    const files = readdirSync(join(dir, "files")).sort().map((f) => ({ name: f, path: join(dir, "files", f), text: readFileSync(join(dir, "files", f), "utf8") }));
    if (!files.length || !briefOf[run.brief]) continue;
    runs.push({ model: canon(run.model), model_raw: run.model, served: run.served, brief: run.brief, kind: run.kind, lang: run.lang, rep: run.rep ?? 1, stop: run.stop, dir, files, reply: readFileSync(join(dir, "reply.txt"), "utf8") });
  }
}

// ── the checker, once over every file, code rules only ──
const codeTells = new Set();
for (const f of [join(ROOT, "data/tells.yaml"), ...readdirSync(join(ROOT, "data/tells.d")).map((x) => join(ROOT, "data/tells.d", x))]) {
  for (const t of YAML.parse(readFileSync(f, "utf8")) ?? []) if (t.domain === "code") codeTells.add(t.id);
}
const items = runs.flatMap((r) => r.files.map((f) => ({ file: relative(ROOT, f.path), domains: ["code"] })));
const tellsOf = items.length ? JSON.parse(execFileSync("npx", ["tsx", "measure/tells-of.ts"], { cwd: ROOT, input: JSON.stringify(items), maxBuffer: 1 << 28, encoding: "utf8" })) : {};

// ── helpers ──
const bucket = (x, edges, names) => { for (let i = 0; i < edges.length; i++) if (x <= edges[i]) return names[i]; return names[names.length - 1]; };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const count = (s, re) => (s.match(re) ?? []).length;
const EMOJI = /\p{Extended_Pictographic}/u;
const GLYPH = /[→←⇒✓✔✗✘•─│└├┌┐┘…—–★☆▶►]/g;
const isCodeFile = (f) => !/\.(md|markdown|txt)$/i.test(f.name) && f.name !== "COMMIT_EDITMSG";
const langOf = (f, fallback) => ({ py: "python", ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", go: "go", sql: "sql", sh: "shell", bash: "shell", rs: "rust" }[f.name.split(".").pop().toLowerCase()] ?? fallback);
const NARRATE = /^(?:create|creates|initiali[sz]e|check(?:s)? (?:if|whether|that)|loop(?:s)? (?:through|over)|iterate(?:s)? (?:through|over)|return(?:s)? the|get(?:s)? the|set(?:s)? (?:the|up)|calculate|compute|read(?:s)? the|write(?:s)? the|open(?:s)? the|convert|add(?:s)? the|remove(?:s)? the|call(?:s)? the|define|import|parse(?:s)? the|print(?:s)? the|update(?:s)? the|store(?:s)? the|increment|append|split|sort(?:s)? (?:the|by)|filter(?:s)? the|load(?:s)? the|save(?:s)? the|handle(?:s)? the|validate(?:s)? the|start(?:s)? the|use|make(?:s)? sure)\b/i;

/** Split a source file into comment lines and code lines, by language. */
function scan(text, lang) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out = { comments: [], code: [], doc: 0, blank: 0, lines };
  const hash = lang === "python" || lang === "shell";
  let inBlock = false, inDoc = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.trim();
    if (!t) { out.blank++; continue; }
    if (lang === "python" && inDoc) { out.doc++; if (t.includes(inDoc)) inDoc = null; continue; }
    if (lang === "python" && /^(?:[rbu]?"""|[rbu]?''')/.test(t)) {
      const q = t.match(/"""|'''/)[0];
      const prev = lines.slice(0, i).reverse().find((x) => x.trim());
      // A string statement right after a def/class line or at the top of the file is a docstring.
      if (!prev || /:\s*(#.*)?$/.test(prev.trim()) || /^(?:import|from)\s/.test(prev.trim()) || i < 3) { out.doc++; if (t.split(q).length < 3) inDoc = q; continue; }
    }
    if (!hash && inBlock) { (out.isDoc ? null : out.comments.push(t.replace(/^\*+\s?/, ""))); if (out.isDoc) out.doc++; if (t.includes("*/")) inBlock = false; continue; }
    if (!hash && t.startsWith("/*")) { out.isDoc = t.startsWith("/**") || false; if (out.isDoc) out.doc++; else out.comments.push(t.replace(/^\/\*+\s?/, "")); inBlock = !t.includes("*/"); continue; }
    if (hash && t.startsWith("#")) { if (!(i === 0 && t.startsWith("#!"))) out.comments.push(t.replace(/^#+\s?/, "")); continue; }
    if (!hash && (t.startsWith("//") || (lang === "sql" && t.startsWith("--")))) {
      if (t.startsWith("///") || (lang === "go" && /^\/\/\s*[A-Z]\w*\s/.test(t) && /^\s*(?:func|type)\s/.test(lines[i + 1] ?? ""))) out.doc++; else out.comments.push(t.replace(/^(?:\/\/+|--)\s?/, ""));
      continue;
    }
    out.code.push(l);
    // Trailing comments count as comments too.
    if (hash ? /\s#\s/.test(l) && !/["'][^"']*#[^"']*["']/.test(l) : /\s\/\/\s/.test(l) && !/["'`][^"'`]*\/\/[^"'`]*["'`]/.test(l)) out.comments.push(l.split(hash ? /\s#\s/ : /\s\/\/\s/).pop().trim());
  }
  return out;
}

/** Functions: start line, length in lines, whether documented. */
function functions(text, lang) {
  const lines = text.replace(/\r/g, "").split("\n");
  const fns = [];
  if (lang === "python") {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(?:async\s+)?def\s+\w+/);
      if (!m) continue;
      const ind = m[1].length;
      let j = i + 1;
      while (j < lines.length && !/\)\s*(->\s*[^:]+)?:\s*(#.*)?$/.test(lines[j - 1]) && j < i + 15) j++; // multi-line signature
      const bodyStart = j;
      let end = j;
      for (let k = j; k < lines.length; k++) { if (!lines[k].trim()) continue; if (lines[k].match(/^\s*/)[0].length <= ind) break; end = k; }
      const body = lines.slice(bodyStart, end + 1).filter((x) => x.trim());
      const documented = /^\s*[rbu]?("""|''')/.test(body[0] ?? "");
      const sig = lines.slice(i, bodyStart).join(" ");
      fns.push({ line: i, len: end - i + 1, body: body.length - (documented ? 1 : 0), documented, annotated: /->/.test(sig) || /\(\s*(?:self,\s*)?\w+\s*:/.test(sig) });
    }
    return fns;
  }
  const START = lang === "go" ? /^\s*func\s/ : lang === "rust" ? /^\s*(?:pub\s+)?(?:async\s+)?fn\s/ : /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^\s*(?:export\s+)?(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::\s*[^=]+)?=>|^\s*(?:public |private |static |async )*\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/;
  for (let i = 0; i < lines.length; i++) {
    if (!START.test(lines[i]) || /^\s*(?:if|for|while|switch|catch|return)\b/.test(lines[i])) continue;
    let depth = 0, opened = false, end = i;
    for (let k = i; k < lines.length && k < i + 400; k++) {
      for (const ch of lines[k].replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")) { if (ch === "{") { depth++; opened = true; } else if (ch === "}") depth--; }
      end = k;
      if (opened && depth <= 0) break;
      if (!opened && k > i + 3) break;
    }
    if (!opened) { fns.push({ line: i, len: 1, body: 1, documented: false, annotated: false }); continue; }
    const prev = lines.slice(Math.max(0, i - 1), i).join("");
    const documented = /\*\/\s*$/.test(prev) || /^\s*\/\/\//.test(prev) || (lang === "go" && /^\s*\/\/\s*\w/.test(prev));
    const sig = lines[i];
    fns.push({ line: i, len: end - i + 1, body: Math.max(0, end - i - 1), documented, annotated: /\)\s*:\s*[\w<>[\]{}|. ]+\s*(?:=>|\{)/.test(sig) });
  }
  return fns;
}

function indentUnit(code) {
  const ws = code.map((l) => l.match(/^[ \t]*/)[0]).filter(Boolean);
  if (!ws.length) return { unit: 4, token: null };
  const tabs = ws.filter((w) => w.startsWith("\t")).length;
  if (tabs > ws.length / 2) return { unit: 1, tab: true, token: "indent:tabs" };
  const sp = ws.filter((w) => !w.includes("\t")).map((w) => w.length);
  const two = sp.filter((n) => n % 4 === 2).length;
  return two > sp.length * 0.15 ? { unit: 2, token: "indent:2" } : { unit: 4, token: "indent:4" };
}

// ── per reply ──
function measure(r) {
  const T = new Set();
  const brief = briefOf[r.brief];
  const codeFiles = r.files.filter(isCodeFile);
  const all = r.files.map((f) => f.text).join("\n");
  // Reply-level tokens.
  const outside = (() => {
    const ls = r.reply.replace(/\r/g, "").split("\n");
    let inF = false, n = 0;
    for (const l of ls) { if (/^\s*(```|~~~)/.test(l)) { inF = !inF; continue; } if (!inF && l.trim() && !/^[\s*#`]*[\w@./-]+\.\w+[\s*`:]*$/.test(l)) n++; }
    return /```|~~~/.test(r.reply) ? n : 0;
  })();
  if (outside >= 3 && brief.kind !== "readme" && brief.kind !== "commit") T.add("prose-outside-code");
  // A name the extractor had to make up (main.py, part2.py) never appears in the reply itself.
  if (!r.files.some((f) => r.reply.includes(f.name.replace(/^_+/, "").replace(/__/g, "/")) || r.reply.includes(f.name.split("__").pop())) && brief.kind !== "readme" && brief.kind !== "commit") T.add("unnamed-file");
  if (codeFiles.length >= 2) T.add("files:2+");
  if (/max_tokens|length/.test(String(r.stop))) T.add("truncated");
  for (const f of r.files) for (const id of tellsOf[relative(ROOT, f.path)] ?? []) if (codeTells.has(id)) T.add(`tell:${id}`);

  let codeLines = 0;
  if (brief.kind === "readme") {
    const md = all;
    const heads = md.split("\n").filter((l) => /^#{1,6}\s/.test(l));
    if (/shields\.io|badge|!\[[^\]]*\]\([^)]*(?:svg|badge)/i.test(md)) T.add("readme:badges");
    if (heads.some((h) => EMOJI.test(h))) T.add("readme:emoji-headers");
    if (/^#+\s*(?:table of contents|contents)\b/im.test(md)) T.add("readme:toc");
    if (/^#+\s*(?:\S+\s)?features\b/im.test(md)) T.add("readme:features");
    if (/^#+\s*(?:\S+\s)?licen[cs]e\b/im.test(md)) T.add("readme:license");
    if (/^#+\s*(?:\S+\s)?contribut/im.test(md)) T.add("readme:contributing");
    if (/^\s*\|.+\|\s*$/m.test(md) && /^\s*\|?\s*:?-{3,}/m.test(md)) T.add("readme:tables");
    T.add(`readme:sections:${bucket(heads.length, [4, 7], ["<=4", "5-7", "8+"])}`);
    T.add(`readme:words:${bucket(md.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length, [199, 399], ["<200", "200-399", "400+"])}`);
    codeLines = md.split("\n").filter((l) => l.trim()).length;
  } else if (brief.kind === "commit") {
    const msg = all.trim().split("\n");
    const subject = msg[0].trim();
    T.add(`commit:subject:${bucket(subject.length, [50, 72], ["<=50", "51-72", "73+"])}`);
    if (/^(?:feat|fix|chore|refactor|docs|test|perf|style|build|ci)(?:\([^)]*\))?!?:\s/.test(subject)) T.add("commit:conventional");
    const body = msg.slice(1).filter((l) => l.trim());
    if (body.length) T.add("commit:body");
    if (body.some((l) => /^\s*[-*•]\s/.test(l))) T.add("commit:bullets");
    if (/\.$/.test(subject)) T.add("commit:period");
    if (/^(?:\w+(?:\([^)]*\))?:\s*)?[a-z]/.test(subject)) T.add("commit:lowercase");
    codeLines = msg.filter((l) => l.trim()).length;
  } else {
    let pyDefs = 0, pyAnn = 0, comments = 0, nonblank = 0, narr = 0, banners = 0, fns = [], maxDepth = 0, prints = 0, tries = 0, guards = 0, nones = 0, consts = 0, glyphs = 0;
    const indentTokens = [];
    for (const f of codeFiles) {
      const lang = langOf(f, brief.lang);
      const s = scan(f.text, lang);
      const code = s.code;
      nonblank += code.length + s.comments.length + s.doc;
      codeLines += code.length;
      comments += s.comments.length;
      narr += s.comments.filter((c) => NARRATE.test(c) && c.split(/\s+/).length <= 12).length;
      banners += s.comments.filter((c) => /[-=*#─━]{3,}\s*\w|\w\s*[-=*#─━]{3,}/.test(c) || /^[-=*#─━]{10,}$/.test(c)).length;
      banners += s.lines.filter((l) => /^\s*(?:#|\/\/)\s*[-=*#─━]{10,}\s*$/.test(l)).length > 0 ? 1 : 0;
      const fs_ = functions(f.text, lang);
      fns.push(...fs_);
      const iu = indentUnit(code);
      if (iu.token && code.length >= 5) indentTokens.push(iu.token);
      // JSX markup nests by design, so React files count nesting in their logic only.
      for (const l of /\.[jt]sx$/.test(f.name) ? code.filter((x) => !/^\s*(?:<|\{|\)|\/>|[\w-]+=)/.test(x)) : code) {
        const w = l.match(/^[ \t]*/)[0];
        const lvl = iu.tab ? w.length : Math.floor(w.replace(/\t/g, "    ").length / iu.unit);
        maxDepth = Math.max(maxDepth, lvl);
      }
      const src = code.join("\n");
      if (EMOJI.test(src)) T.add("emoji");
      glyphs += count(src, GLYPH);
      prints += count(src, /\bprint\s*\(|console\.(?:log|error|warn|info)\s*\(|fmt\.Print|println!\s*\(|^\s*echo\s/gm);
      if (/\bimport logging\b|\blogging\.\w+\(|\blog\.(?:Print|Fatal|Printf|Println)|\blogger\.\w+\(|\bslog\./.test(src)) T.add("logging");
      tries += count(src, /^\s*try\s*(?::|\{)/gm);
      guards += count(src, /^\s*if\b[^\n]*(?::\s*(?:return|raise|continue|break)\b|\)\s*(?:return|throw|continue|break)\b|\)\s*\{\s*(?:return|throw|continue)\b[^\n]*\}\s*$)/gm);
      guards += count(f.text, /^\s*if\b[^\n]*:\s*\n\s*(?:return|raise)\b[^\n]*\n(?!\s+\S)/gm) + count(f.text, /^\s*if\b[^\n]*\{\s*\n\s*(?:return|throw)\b[^\n]*\n\s*\}/gm);
      nones += count(src, /\bis (?:not )?None\b|[!=]==?\s*(?:null|undefined)\b|\b(?:null|undefined)\s*[!=]==?/g);
      if (count(src, /\?\./g) >= 3) T.add("optional-chaining");
      consts += count(src, /^(?:export\s+)?(?:const\s+)?[A-Z][A-Z0-9_]{2,}\s*(?::[^=]+)?=/gm);
      if (/^\s*(?:class|struct|impl)\s+\w+|^\s*type\s+\w+\s+struct\b/m.test(src) && (lang !== "go" || /^func\s*\(/m.test(src))) T.add("classes");
      if (/(?:#|\/\/|--)\s*(?:example(?: usage)?|usage)\b/i.test(f.text) || /^\s*(?:#|\/\/)\s*-+\s*example/im.test(f.text)) T.add("example-usage");
      if (/^#!/.test(f.text)) T.add("shebang");
      if (/\b(?:sys\.exit|process\.exit|os\.Exit|std::process::exit)\s*\(\s*[^)\s]/.test(src)) T.add("exit-codes");
      if (lang === "python") {
        if (/if __name__ == ["']__main__["']/.test(src)) T.add("main-guard");
        if (/\bargparse\b/.test(src)) T.add("py:argparse");
        if (/\bsys\.argv\b/.test(src)) T.add("py:sys-argv");
        if (/\bf["']/.test(src)) T.add("py:f-strings");
        if (/["']\.format\(/.test(src)) T.add("py:str-format");
        if (/["'][^"'\n]*%[-\d.]*[sdifr][^"'\n]*["'] % [(\w]/.test(src)) T.add("py:percent-format");
        if (/\bpathlib\b|\bPath\(/.test(src)) T.add("py:pathlib");
        if (/\bos\.path\./.test(src)) T.add("py:os-path");
        if (/^\s*except\s*:|^\s*except\s+(?:Exception|BaseException)\b/m.test(src)) T.add("py:broad-except");
        if (/@dataclass/.test(src)) T.add("py:dataclass");
        pyDefs += fs_.length; pyAnn += fs_.filter((x) => x.annotated).length;
        if (/^\s*[rbu]?("""|''')/.test(f.text.replace(/^#!.*\n/, "").replace(/^\s*\n/, ""))) T.add("docs:module");
      }
      if (lang === "javascript" || lang === "typescript") {
        if (lang === "typescript") {
          if (/:\s*any\b|\bas any\b|<any>/.test(src)) T.add("ts:any");
          if (/@ts-ignore|@ts-expect-error|eslint-disable/.test(f.text)) T.add("ts:ignore");
          const named = fs_.filter((x) => x.len > 1);
          if (named.length && named.filter((x) => x.annotated).length / named.length >= 0.5) T.add("ts:return-types");
          if (/^\s*(?:export\s+)?(?:interface|type)\s+\w+/m.test(src)) T.add("ts:declared-types");
        }
        if (/require\.main === module|import\.meta\.url\s*===|process\.argv\[1\]/.test(src)) T.add("main-guard");
        if (/^\s*var\s/m.test(src)) T.add("js:var");
        const stmts = code.filter((l) => /[\w)\]'"`]\s*;?\s*$/.test(l) && !/[{(,[]\s*$/.test(l) && !/^\s*(?:\/\/|\*|<|}|\)|\])/.test(l.trim()));
        if (stmts.length >= 5) T.add(stmts.filter((l) => /;\s*$/.test(l)).length / stmts.length < 0.3 ? "js:semicolons-off" : "js:semicolons");
        const sq = count(src, /(?<![\w\\])'[^'\n]*'/g), dq = count(src, /(?<![\w\\=])"[^"\n]*"/g);
        if (sq + dq >= 4) T.add(sq > dq ? "js:single-quotes" : "js:double-quotes");
        if (/\.tsx$|\.jsx$|from ["']react["']/.test(f.name + src)) {
          if (/\buse(?:Memo|Callback)\b|\bmemo\(/.test(src)) T.add("react:memo");
          if (count(src, /\baria-\w+=|\brole=/g) >= 3) T.add("react:aria");
          if (/style=\{\{/.test(src)) T.add("react:inline-styles");
          if (/className=["'`{][^"'`}]*(?:\b(?:flex|grid|px-\d|py-\d|p-\d|m[trblxy]?-\d|text-(?:sm|lg|xl|gray)|bg-\w+-\d|rounded|shadow|w-\w+|h-\w+)\b[^"'`}]*){4,}/.test(src)) T.add("react:tailwind");
          if (/createPortal/.test(src)) T.add("react:portal");
          if (/["']Escape["']|keyCode\s*===\s*27/.test(src)) T.add("react:escape-key");
          if (/forwardRef/.test(src)) T.add("react:forward-ref");
        }
      }
      if (lang === "go") { if (/^func main\(\)/m.test(src)) T.add("main-guard"); if (/%w/.test(src)) T.add("go:error-wrap"); }
      if (lang === "sql") {
        if (/^\s*with\s+\w+\s+as\s*\(/im.test(src)) T.add("sql:cte");
        const kw = src.match(/\b(select|from|where|group by|order by|join|limit)\b/gi) ?? [];
        if (kw.length && kw.filter((k) => k === k.toUpperCase()).length / kw.length > 0.8) T.add("sql:upper-keywords");
        if (s.comments.length) T.add("sql:comments");
      }
      if (lang === "shell") {
        if (/^\s*set\s+-[a-z]*e/m.test(src) || /set -o errexit/.test(src)) T.add("sh:strict-mode");
        if (/^\s*(?:function\s+)?\w+\s*\(\)\s*\{/m.test(src)) T.add("sh:functions");
      }
    }
    if (pyDefs && pyAnn / pyDefs >= 0.5) T.add("py:type-hints");
    if (pyDefs && pyAnn === 0) T.add("py:no-type-hints");
    if (glyphs >= 2) T.add("non-ascii");
    const share = nonblank ? comments / nonblank : 0;
    T.add(`comments:${comments === 0 ? "none" : share < 0.1 ? "light" : share <= 0.25 ? "moderate" : "heavy"}`);
    if (narr >= 3) T.add("narrating-comments");
    if (banners >= 1) T.add("section-banners");
    if (fns.length >= 2 && fns.every((f) => f.documented)) T.add("docs:every-function");
    if (fns.some((f) => f.documented && f.body <= 3)) T.add("docs:trivial-function");
    const lens = fns.map((f) => f.len);
    if (lens.length) T.add(`fn-length:${bucket(median(lens), [10, 25], ["short", "medium", "long"])}`);
    T.add(`functions:${bucket(fns.length, [0, 1, 4, 8], ["0", "1", "2-4", "5-8", "9+"])}`);
    T.add(`nesting:${bucket(maxDepth, [2, 3, 4], ["<=2", "3", "4", "5+"])}`);
    T.add(`try:${bucket(tries, [0, 2], ["0", "1-2", "3+"])}`);
    if (guards >= 2) T.add("guard-clauses");
    if (nones >= 3) T.add("none-checks");
    if (consts >= 2) T.add("named-constants");
    if (!T.has("logging")) T.add(`prints:${bucket(prints, [0, 4], ["0", "1-4", "5+"])}`);
    const it = [...new Set(indentTokens)];
    if (it.length === 1 && brief.lang !== "go") T.add(it[0]);
    // Tests.
    if (brief.kind === "tests") {
      const src = all;
      const fw = /\bimport pytest\b|@pytest\./.test(src) ? "pytest" : /\bunittest\b/.test(src) ? "unittest" : /from ["']vitest["']/.test(src) ? "vitest" : /node:test/.test(src) ? "node-test" : /\b(?:describe|it|test)\(/.test(src) ? (brief.lang === "python" ? "pytest" : "jest") : /^def test_/m.test(src) ? "pytest" : "other";
      T.add(`tests:${fw}`);
      const asserts = count(src, /\bassert\b|\bself\.assert\w+\(|\bexpect\(|\bassert\.\w+\(/g);
      T.add(`asserts:${bucket(asserts, [5, 15], ["1-5", "6-15", "16+"])}`);
      if (/\bmock\b|\bMock\(|\bpatch\(|jest\.fn|vi\.fn|jest\.mock|vi\.mock|monkeypatch/.test(src)) T.add("tests:mocks");
      if (/parametrize|subTest|\.each\(|\.each`/.test(src)) T.add("tests:parametrized");
      if (/^class\s+\w*Test/m.test(src)) T.add("tests:classes");
      const cases = count(src, /^\s*(?:async\s+)?def test_\w+|\b(?:it|test)\s*\(\s*["'`]/gm) + count(src, /^\s*\(\s*["'][^"']*["']\s*,/gm);
      T.add(`test-cases:${bucket(cases, [4, 9], ["1-4", "5-9", "10+"])}`);
    }
  }
  return { tokens: [...T].sort(), codeLines };
}

/** A short excerpt for the hover card: 12 lines from the model's own reply, starting at its first function or class. */
function excerpt(r) {
  const f = r.files.find(isCodeFile) ?? r.files[0];
  const lines = f.text.replace(/\r/g, "").split("\n");
  let start = 0;
  if (isCodeFile(f)) {
    const k = lines.findIndex((l) => /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:def|function|func|fn|class|const \w+ = (?:\(|async))\b/.test(l));
    if (k > 0) { start = k; while (start > 0 && /^\s*(?:@|#|\/\/|\/?\*)/.test(lines[start - 1]) && k - start < 4) start--; }
  }
  const out = lines.slice(start, start + 12);
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return { file: f.name, from: start + 1, text: out.map((l) => (l.length > 100 ? l.slice(0, 99) + "…" : l)).join("\n") };
}

const results = runs.map((r) => ({ r, ...measure(r) }));
// Verbosity against the brief's median over every model.
const perBrief = {};
for (const x of results) (perBrief[x.r.brief] ??= []).push(x.codeLines);
const med = Object.fromEntries(Object.entries(perBrief).map(([b, a]) => [b, median(a)]));
const pages = results.map(({ r, tokens, codeLines }) => {
  const ratio = med[r.brief] ? codeLines / med[r.brief] : 1;
  const t = [...tokens, `length:${ratio < 0.67 ? "short" : ratio <= 1.5 ? "typical" : ratio <= 2.5 ? "long" : "very-long"}`].sort();
  return { route: "api", model: r.model, model_raw: r.model_raw, served: r.served, brief: r.brief, kind: r.kind, lang: r.lang, rep: r.rep, stop: r.stop, tokens: t, lines: codeLines, ratio: +ratio.toFixed(2), files: r.files.map((f) => f.name), excerpt: excerpt(r) };
});
pages.sort((a, b) => a.model.localeCompare(b.model) || a.brief.localeCompare(b.brief) || a.rep - b.rep);
writeFileSync(join(ROOT, "measure", "code-features.json"), JSON.stringify({
  version: VERSION, measured: new Date().toISOString().slice(0, 10),
  method: "Static reading of each reply's files; thresholds at the top of measure/code-features.mjs. Verbosity is relative to the brief's median over every model.",
  medians: med, pages,
}, null, 1));
console.log(`measured ${pages.length} replies from ${new Set(pages.map((p) => p.model)).size} models (${runs.length} usable runs) -> measure/code-features.json`);
