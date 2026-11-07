// Turn files into the text each detector should see. Removed spans become spaces,
// so offsets, lines and columns still point at the original file.

export type FileKind = "markdown" | "text" | "html" | "css" | "markup-code" | "code";

const EXT: Record<string, FileKind> = {
  md: "markdown", mdx: "markdown", markdown: "markdown",
  txt: "text", rst: "text",
  html: "html", htm: "html", svg: "html",
  css: "css", scss: "css", sass: "css", less: "css",
  tsx: "markup-code", jsx: "markup-code", vue: "markup-code", svelte: "markup-code", astro: "markup-code",
  ts: "code", js: "code", mjs: "code", cjs: "code", py: "code", go: "code", rs: "code", rb: "code",
  java: "code", kt: "code", swift: "code", c: "code", cc: "code", cpp: "code", h: "code", sh: "code", zsh: "code",
};

export function kindOf(path: string | undefined): FileKind {
  if (!path || path === "-") return "text";
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return EXT[ext] ?? "text";
}

/** Which registry domains apply to which file kinds. */
export function domainsFor(kind: FileKind): Set<string> {
  switch (kind) {
    case "markdown":
    case "text":
      return new Set(["prose", "chat"]);
    case "html":
      return new Set(["prose", "ui"]);
    case "css":
      return new Set(["ui"]);
    case "markup-code":
      return new Set(["ui", "code"]);
    case "code":
      return new Set(["code"]);
  }
}

const blank = (s: string) => s.replace(/[^\n]/g, " ");
const mask = (text: string, re: RegExp) => text.replace(re, blank);

/** Prose view of a markdown file: no code, URLs, HTML tags, link targets or front matter. */
export function proseFromMarkdown(md: string): string {
  let t = md;
  t = t.replace(/^---\n[\s\S]*?\n---\n/, blank); // front matter
  t = mask(t, /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm); // fenced code
  t = mask(t, /<!--[\s\S]*?-->/g);
  t = mask(t, /`[^`\n]+`/g); // inline code
  t = t.replace(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m) => "]" + blank(m.slice(1))); // link targets
  t = mask(t, /https?:\/\/\S+/g);
  t = mask(t, /<\/?[a-zA-Z][^>\n]*>/g);
  t = mask(t, /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm); // table rules
  return t;
}

/** Prose view of an HTML file: visible text only. Scripts, styles and tags are masked. */
export function proseFromHtml(html: string): string {
  let t = html;
  t = mask(t, /<!--[\s\S]*?-->/g);
  t = mask(t, /<(script|style|svg|pre|code)\b[\s\S]*?<\/\1>/gi);
  // Block-level tags end a sentence; put a newline-safe break marker in their place.
  t = t.replace(/<\/?(p|div|section|article|header|footer|main|nav|aside|li|ul|ol|h[1-6]|br|tr|td|th|table|figure|figcaption|blockquote|dd|dt|dl|button|label|summary|details)\b[^>]*>/gi, (m) => {
    const b = blank(m);
    return b.length > 1 ? "\u2029" + b.slice(1) : "\u2029";
  });
  t = mask(t, /<[^>]+>/g);
  t = t.replace(/&(nbsp|amp|lt|gt|quot|#39|rsquo|lsquo|ldquo|rdquo|mdash|ndash|middot|times);/g, (m, e: string) => {
    const map: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", middot: "·", times: "×" };
    return (map[e] ?? " ").padEnd(m.length, " ");
  });
  return t;
}

/** Comments only, for code-domain prose checks. */
export function commentsFromCode(code: string): string {
  const out = blank(code).split("");
  const re = /(\/\/[^\n]*|#(?!!)[^\n]*|\/\*[\s\S]*?\*\/)/g;
  for (const m of code.matchAll(re)) for (let i = 0; i < m[0].length; i++) out[m.index! + i] = m[0][i];
  return out.join("");
}

export function proseView(text: string, kind: FileKind): string {
  if (kind === "markdown") return proseFromMarkdown(text);
  if (kind === "html") return proseFromHtml(text);
  if (kind === "text") return text;
  return "";
}

export function countWords(prose: string): number {
  return (prose.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length;
}

export function lineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") { line++; last = i; }
  return { line, col: offset - last };
}

export interface Sentence { start: number; end: number; words: number; text: string }
export interface Paragraph { start: number; end: number; sentences: Sentence[]; kind: "para" | "list" | "heading" }

/** Split prose into paragraphs and sentences. Lists and headings are tagged so rhythm checks can skip them. */
export function paragraphs(prose: string): Paragraph[] {
  const out: Paragraph[] = [];
  const re = /[^\n\u2029]+(?:\n(?![ \t]*\n)(?![ \t]*[-*+] )(?![ \t]*\d+[.)] )(?!#)[^\n\u2029]+)*/g;
  for (const m of prose.matchAll(re)) {
    const raw = m[0];
    if (!raw.trim()) continue;
    const start = m.index!;
    const trimmed = raw.trim();
    const kind: Paragraph["kind"] = /^#{1,6} /.test(trimmed) ? "heading" : /^([-*+]|\d+[.)]) /.test(trimmed) || /^\|/.test(trimmed) ? "list" : "para";
    const sentences: Sentence[] = [];
    const sre = /[^.!?\u2029]+(?:[.!?]+["'”’)]*|$)/g;
    for (const s of raw.matchAll(sre)) {
      const txt = s[0].trim();
      const words = countWords(txt);
      if (!words) continue;
      sentences.push({ start: start + s.index!, end: start + s.index! + s[0].length, words, text: txt });
    }
    out.push({ start, end: start + raw.length, sentences, kind });
  }
  return out;
}

export interface Token { t: string; start: number; end: number }

/** Graphite-style tokens: lowercase words, apostrophes kept, punctuation dropped. */
export function tokens(prose: string): Token[] {
  const out: Token[] = [];
  for (const m of prose.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g)) {
    out.push({ t: m[0].toLowerCase().replace(/’/g, "'"), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}
