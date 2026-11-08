import { tells as loadTells, graphite, resolveModel, models, type Tell, type LexEntry } from "./registry.js";
import { findTriads } from "./triads.js";
import { kindOf, domainsFor, proseView, commentsFromCode, countWords, lineCol, paragraphs, tokens, type FileKind } from "./text.js";

export interface Finding {
  id: string;
  name: string;
  severity: number;
  /** "registry" = curated rule; "lexicon" = phrase measured as over-used by a model. */
  origin: "registry" | "lexicon";
  line: number;
  col: number;
  offset: number;
  match: string;
  fix?: string;
  /** Lexicon hits: which measured model over-uses this, and by how much. */
  model?: string;
  ratio?: number;
  /** False when the hit is reported for context but did not reach its density threshold. */
  counted: boolean;
}

export interface Report {
  file: string;
  kind: FileKind;
  words: number;
  score: number;
  band: "clean" | "light" | "moderate" | "heavy" | "saturated";
  penalty: number;
  findings: Finding[];
  judge: Array<{ id: string; question: string }>;
  /** Hits inside explicit <!-- shibbo-ignore --> blocks: not scored, but always reported as a count. */
  suppressed: number;
}

export interface Options {
  /** Model writing the text. Selects that model's measured lexicon; default is every measured model. */
  model?: string | null;
  /** Restrict to these registry ids (after disable). */
  only?: string[];
  disable?: string[];
  /** Include measured n-gram/frame lexicon hits. Default true. */
  lexicon?: boolean;
  /** Force a file kind (for stdin). */
  kind?: FileKind;
  /** Override domains. */
  domains?: string[];
  /** Replace the shipped measured lexicon (used by the evaluator to test a lexicon built from a train split). */
  lexiconData?: Record<string, LexEntry[]>;
}

/** Score scale: penalty points per 1,000 words that halve the score. Calibrated in scripts/eval-graphite.ts on a train split. */
export let HALF_LIFE = 33.96; // calibrated on the train half: 90% of human articles score >= 80
export function setHalfLife(x: number) { HALF_LIFE = x; }

const jsRegex = (t: Tell): RegExp => {
  const flags = new Set((t.detect.flags ?? "i").split(""));
  flags.add("g");
  return new RegExp(t.detect.pattern!, [...flags].join(""));
};

const compiled = new Map<string, RegExp>();
function regexFor(t: Tell): RegExp {
  let re = compiled.get(t.id);
  if (!re) compiled.set(t.id, (re = jsRegex(t)));
  re.lastIndex = 0;
  return re;
}

type Hit = { offset: number; match: string };

// ───────── statistical detectors ─────────

const STAT: Record<string, (prose: string, words: number) => Hit[]> = {
  emdash(prose) {
    return [...prose.matchAll(/—|(?<=\w) -- (?=\w)/g)].map((m) => ({ offset: m.index!, match: m[0] }));
  },

  // Whole-document sentence-length variation (CV) below 0.35, over at least 15 sentences. Advisory.
  rhythm(prose) {
    const sents = paragraphs(prose).filter((p) => p.kind === "para").flatMap((p) => p.sentences).filter((s) => s.words >= 3);
    if (sents.length < 15) return [];
    const w = sents.map((s) => s.words);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const cv = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length) / mean;
    return cv < 0.35 ? [{ offset: sents[0].start, match: `sentence-length CV ${cv.toFixed(2)} over ${w.length} sentences (people: ~0.5)` }] : [];
  },

  // Long text that spells out "it is", "do not" and never contracts.
  contractions(prose, words) {
    if (words < 250) return [];
    const expanded = [...prose.matchAll(/\b(?:it is|that is|there is|do not|does not|did not|is not|are not|was not|were not|cannot|will not|would not|should not|could not|have not|has not|you are|we are|they are|i am|let us)\b/gi)];
    const contracted = (prose.match(/\b\w+(?:'|’)(?:s|t|re|ve|ll|d|m)\b/gi) ?? []).filter((c) => !/^\w+(?:'|’)s$/i.test(c) || /^(?:it|that|there|here|what|who|let)(?:'|’)s$/i.test(c)).length;
    if (expanded.length >= 6 && contracted / (contracted + expanded.length) < 0.1) {
      return [{ offset: expanded[0].index!, match: `${expanded.length} spelled-out forms, ${contracted} contractions` }];
    }
    return [];
  },

  // A paragraph or section ending on a short, standalone punchline.
  pithy_closer(prose) {
    const hits: Hit[] = [];
    const ps = paragraphs(prose);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.kind !== "para" || !p.sentences.length) continue;
      const last = p.sentences.at(-1)!;
      const isLoneLine = p.sentences.length === 1 && last.words <= 7 && i > 0 && ps[i - 1].kind === "para";
      const endsShort = p.sentences.length >= 3 && last.words <= 5 && p.sentences.slice(0, -1).every((s) => s.words >= 10);
      const sectionEnd = i === ps.length - 1 || ps[i + 1].kind === "heading";
      // A label line ("Sources: ...", "Note: ...") is a reference, not a punchline.
      if (/^\s*[A-Z][\w ]{0,24}:/.test(last.text) || /^\s*[A-Z][\w ]{0,24}:/.test(p.sentences[0].text) || /^\s*See\b/.test(last.text)) continue;
      if ((isLoneLine && sectionEnd && /[.!]$/.test(last.text)) || (endsShort && /[.!]$/.test(last.text))) {
        hits.push({ offset: last.start, match: last.text });
      }
    }
    return hits;
  },

  // Lists of three phrases or clauses ("a stock phrase, a purple gradient, a comment that narrates the code").
  triads(prose) {
    return findTriads(prose);
  },

  // Three or more consecutive "**Label:** text" blocks.
  bold_label_blocks(prose) {
    const hits: Hit[] = [];
    const lines = prose.split("\n");
    let run = 0;
    let runStart = 0;
    let offset = 0;
    let firstOffset = 0;
    for (const line of lines) {
      const isLabel = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\*\*[^*]{1,40}[:.]?\*\*[:.]?\s+\S/.test(line);
      const isBlank = !line.trim();
      if (isLabel) {
        if (!run) { runStart = offset; firstOffset = offset; }
        run++;
      } else if (!isBlank && !/^\s{2,}\S/.test(line)) {
        if (run >= 3) hits.push({ offset: firstOffset, match: `${run} bold-label blocks in a row` });
        run = 0;
      }
      offset += line.length + 1;
    }
    if (run >= 3) hits.push({ offset: runStart, match: `${run} bold-label blocks in a row` });
    return hits;
  },
};

// ───────── measured lexicon ─────────

interface LexHit { entry: LexEntry; model: string }
type LexIndex = Map<string, LexHit[]>;
const lexCache = new WeakMap<object, Map<string, LexIndex>>();
const SHIPPED = {};

/** Index each model's measured lexicon by first token. Union over models when none is given. */
function lexiconFor(modelId: string | null, data?: Record<string, LexEntry[]>): LexIndex {
  const key = modelId ?? "*";
  const owner = data ?? SHIPPED;
  if (!lexCache.has(owner)) lexCache.set(owner, new Map());
  const cached = lexCache.get(owner)!.get(key);
  if (cached) return cached;
  const g = graphite();
  const source: Record<string, LexEntry[]> = data ?? Object.fromEntries(Object.entries(g?.models ?? {}).map(([k, v]) => [k, v.lexicon]));
  const idx: LexIndex = new Map();
  {
    const best = new Map<string, LexHit>();
    for (const id of Object.keys(source)) {
      for (const e of source[id] ?? []) {
        const prev = best.get(e.term);
        // Prefer the writing model's own measurement when it has one.
        const own = modelId !== null && id === modelId;
        const prevOwn = modelId !== null && prev?.model === modelId;
        if (!prev || (own && !prevOwn) || (!prevOwn && prev.entry.ratio < e.ratio)) best.set(e.term, { entry: e, model: id });
      }
    }
    for (const h of best.values()) {
      const first = h.entry.term.split(" ")[0];
      if (!idx.has(first)) idx.set(first, []);
      idx.get(first)!.push(h);
    }
  }
  lexCache.get(owner)!.set(key, idx);
  return idx;
}

function lexiconHits(prose: string, modelId: string | null, data?: Record<string, LexEntry[]>): Array<Hit & { lex: LexHit }> {
  const idx = lexiconFor(modelId, data);
  if (!idx.size) return [];
  const toks = tokens(prose);
  // Segment ids: n-grams don't cross sentence ends or paragraph breaks.
  const seg: number[] = [];
  let s = 0;
  for (let i = 0; i < toks.length; i++) {
    if (i > 0 && /[.!?\u2029]|\n\s*\n|\n\s*[-*#|]/.test(prose.slice(toks[i - 1].end, toks[i].start))) s++;
    seg.push(s);
  }
  const hits: Array<Hit & { lex: LexHit }> = [];
  const taken: Array<[number, number]> = [];
  for (let i = 0; i < toks.length; i++) {
    const cands = idx.get(toks[i].t);
    if (!cands) continue;
    let best: { lex: LexHit; end: number } | null = null;
    for (const c of cands) {
      const parts = c.entry.term.split(" ");
      if (i + parts.length > toks.length) continue;
      let ok = true;
      for (let k = 0; k < parts.length; k++) {
        const tok = toks[i + k];
        if (seg[i + k] !== seg[i] || (parts[k] !== "_" && parts[k] !== tok.t)) { ok = false; break; }
      }
      if (ok && (!best || c.entry.ratio > best.lex.entry.ratio)) best = { lex: c, end: toks[i + parts.length - 1].end };
    }
    if (best && !taken.some(([a, b]) => toks[i].start < b && best!.end > a)) {
      taken.push([toks[i].start, best.end]);
      hits.push({ offset: toks[i].start, match: prose.slice(toks[i].start, best.end), lex: best.lex });
    }
  }
  return hits;
}

// ───────── main ─────────

export function check(text: string, file = "-", opts: Options = {}): Report {
  const kind = opts.kind ?? kindOf(file);
  const domains = new Set(opts.domains ?? domainsFor(kind));
  const prose = proseView(text, kind);
  const comments = kind === "code" || kind === "markup-code" ? commentsFromCode(text) : "";
  const words = countWords(prose || comments);
  const disabled = new Set(opts.disable ?? []);
  const only = opts.only ? new Set(opts.only) : null;
  const model = resolveModel(opts.model ?? null);

  const findings: Finding[] = [];
  const judge: Report["judge"] = [];

  for (const t of loadTells()) {
    if (disabled.has(t.id) || (only && !only.has(t.id))) continue;
    // chat-domain rules also apply to prose files; ui rules see the raw file; code rules see the raw file.
    if (!domains.has(t.domain)) continue;
    const target = t.domain === "ui" || t.domain === "code" ? text : prose;
    if (!target.trim()) continue;

    let hits: Hit[] = [];
    if (t.detect.method === "regex" && t.detect.pattern) {
      hits = [...target.matchAll(regexFor(t))].map((m) => ({ offset: m.index!, match: m[0] }));
    } else if (t.detect.method === "stat" && t.detect.fn) {
      hits = STAT[t.detect.fn]?.(target, words) ?? [];
    } else if (t.detect.method === "judge" && t.detect.judge) {
      judge.push({ id: t.id, question: t.detect.judge });
      continue;
    }
    if (t.detect.judge && t.detect.method !== "judge") judge.push({ id: t.id, question: t.detect.judge });
    if (!hits.length) continue;

    // Density: only count hits once they exceed count-per-N-words (scaled, never below count).
    let counted = true;
    if (t.detect.density) {
      const need = t.detect.density.count * Math.max(1, words / t.detect.density.per);
      counted = hits.length >= need;
    }
    for (const h of hits) {
      const { line, col } = lineCol(text, h.offset);
      findings.push({ id: t.id, name: t.name, severity: t.severity, origin: "registry", line, col, offset: h.offset, match: h.match.trim().slice(0, 160), fix: t.fix, counted });
    }
  }

  if (opts.lexicon !== false && domains.has("prose") && prose.trim()) {
    const covered = findings.map((f) => [f.offset, f.offset + f.match.length]);
    for (const h of lexiconHits(prose, model?.id ?? null, opts.lexiconData)) {
      if (covered.some(([a, b]) => h.offset < b && h.offset + h.match.length > a)) continue;
      const { line, col } = lineCol(text, h.offset);
      const name = models().models.find((m) => m.id === h.lex.model)?.name ?? h.lex.model;
      findings.push({
        id: `lexicon:${h.lex.entry.term}`,
        name: h.lex.entry.floor
          ? `"${h.lex.entry.term}" (${name} used it ${h.lex.entry.count} times in Graphite's articles; people, never)`
          : `"${h.lex.entry.term}" (${name} uses it ${fmtRatio(h.lex.entry.ratio)} as often as people)`,
        severity: lexWeight(h.lex.entry.ratio) * (model && h.lex.model === model.id ? OWN_MODEL_BOOST : 1),
        origin: "lexicon",
        line, col, offset: h.offset,
        match: h.match,
        model: h.lex.model,
        ratio: h.lex.entry.ratio,
        counted: true,
      });
    }
  }

  // Explicit, visible opt-outs for quoted examples: <!-- shibbo-ignore --> ... <!-- /shibbo-ignore -->,
  // or <!-- shibbo-ignore-next-line --> before a single line. Suppressed hits are counted in the report.
  const ignored: Array<[number, number]> = [];
  for (const m of text.matchAll(/<!--\s*shibbo-ignore\s*-->([\s\S]*?)<!--\s*\/shibbo-ignore\s*-->/g)) ignored.push([m.index!, m.index! + m[0].length]);
  for (const m of text.matchAll(/<!--\s*shibbo-ignore-next-line\s*-->[^\n]*\n([^\n]*)/g)) ignored.push([m.index!, m.index! + m[0].length]);
  const before = findings.length;
  const kept = findings.filter((f) => !ignored.some(([a, b]) => f.offset >= a && f.offset < b));
  const suppressed = before - kept.length;
  findings.length = 0;
  findings.push(...kept);

  findings.sort((a, b) => a.offset - b.offset);
  const penalty = findings.filter((f) => f.counted).reduce((a, f) => a + f.severity, 0);
  const per1k = (penalty / Math.max(words, 150)) * 1000;
  const score = Math.round(100 * Math.pow(0.5, per1k / HALF_LIFE));
  return { file, kind, words, score, band: band(score), penalty, findings, judge, suppressed };
}

/** Weight on phrases measured for the model that is writing (when known). Chosen on train. */
export let OWN_MODEL_BOOST = 8; // chosen on the train half (see data/measured/eval.json)
export function setOwnModelBoost(x: number) { OWN_MODEL_BOOST = x; }

export function lexWeight(ratio: number): number {
  return ratio >= 100 ? 1.5 : ratio >= 25 ? 1 : 0.5;
}

export function fmtRatio(r: number): string {
  return r >= 100 ? `${Math.round(r)}×` : r >= 10 ? `${r.toFixed(0)}×` : `${r.toFixed(1)}×`;
}

export function band(score: number): Report["band"] {
  return score >= 80 ? "clean" : score >= 60 ? "light" : score >= 40 ? "moderate" : score >= 20 ? "heavy" : "saturated";
}
