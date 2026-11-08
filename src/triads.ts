// Lists of exactly three phrases or clauses in one sentence: "fast, simple and secure",
// "a stock phrase, a purple gradient, a comment that narrates the code", or three parallel clauses.
// Tuned on the training half of Graphite's matched articles; names, numbers and longer lists are skipped.
import { paragraphs } from "./text.js";

type Hit = { offset: number; match: string };

const DET = /^(?:a|an|the|its|their|your|our|my|his|her|each|every|some|any|no|this|that|these|those)$/i;
const PREP = /^(?:in|on|at|to|for|with|by|from|of|into|onto|over|under|about|through|across|without|within|between|after|before)$/i;
const INTRO = /^\s*(?:for|if|when|after|before|in|on|as|since|while|although|though|because|to|with|by|once|unless|until|at|from|so|but|yet|then|here|now|today|however|still|also|yes|no|well|indeed|instead|meanwhile|finally|first|second|third|next|later|thus|hence|overall|sadly|fortunately|unfortunately|again|otherwise|ok|okay|oh)\b/i;
const ASIDE = /^\s*(?:say|perhaps|maybe|too|though|however|then|also|again|etc|for example|for instance|in short|of course|in fact|i think|you know)\s*$/i;
const CONJ = /^\s*(?:and|or)\s+/i;
const wc = (s: string) => (s.match(/[A-Za-z0-9’']+/g) ?? []).length;
const cls = (s: string) => { const w = (s.trim().match(/[A-Za-z’']+/) ?? [""])[0]; return DET.test(w) ? "det" : PREP.test(w) ? "prep" : /\w{3,}ing$/i.test(w) && !/^(?:bring|string|spring|during|nothing|something|anything|everything|morning|evening)$/i.test(w) ? "ing" : "other"; };
const afterBreak = (s: string) => s.split(/[:;—]|\s-\s/).pop()!;

function commaSegs(text: string) {
  const segs: { t: string; at: number }[] = [];
  let depth = 0, q = false, last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++; else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === '"') q = !q; else if (c === "“") q = true; else if (c === "”") q = false;
    else if (c === "," && !depth && !q) { segs.push({ t: text.slice(last, i), at: last }); last = i + 1; }
  }
  segs.push({ t: text.slice(last), at: last });
  return segs;
}

export function findTriads(prose: string): Hit[] {
  const out: Hit[] = [];
  for (const p of paragraphs(prose)) {
    if (p.kind !== "para") continue;
    for (const s of p.sentences) {
      const segs = commaSegs(s.text);
      for (let k = 0; k + 1 < segs.length; k++) {
        const a = segs[k].t, b = segs[k + 1].t, c = segs[k + 2]?.t;
        let mid: string, lastItem: string, end: number, kind: "oxford" | "inline" | "bare";
        if (c !== undefined && CONJ.test(c) && !CONJ.test(b)) { mid = b; lastItem = c.replace(CONJ, ""); end = k + 2; kind = "oxford"; }
        else {
          const m = b.match(/^(.*?)\s+(?:and|or)\s+(.*)$/i);
          if (m && !CONJ.test(b) && wc(m[1]) >= 1 && wc(m[1]) <= 8) { mid = m[1]; lastItem = m[2]; end = k + 1; kind = "inline"; }
          else if (c !== undefined && k + 3 === segs.length && /[:;—]/.test(a) && !CONJ.test(b) && !CONJ.test(c)) { mid = b; lastItem = c; end = k + 2; kind = "bare"; }
          else continue;
        }
        const w1 = wc(mid), w2 = wc(lastItem);
        // First item: after a colon or dash; for short lists, just the last few words of the lead-in.
        const lead = afterBreak(a).replace(CONJ, "");
        const toks = lead.trim().split(/\s+/);
        const short = w1 <= 3 && w2 <= 3;
        const first = short ? toks.slice(-Math.max(w1, w2)).join(" ") : lead.trim();
        const tookTail = first.length < lead.trim().length;
        const w0 = wc(first);
        if (!w0 || !w1 || !w2 || w0 > 12 || w1 > 10 || w2 > 14) continue;
        if (ASIDE.test(mid) || [first, mid, lastItem].some((x) => /\d/.test(x))) continue;
        if (kind === "inline" && !tookTail && INTRO.test(a)) continue;
        if (kind === "inline" && !short && (w0 === 1 || cls(first) !== cls(mid))) continue; // "Thankfully, X has improved and Y" is one clause pair
        if (/^\s*(?:but|so|which|who|whom|whose|that|since|because|if|when|while|yet|though|although|where|unless)\b/i.test(mid)) continue;
        if ([first, mid, lastItem].every((x) => /^\s*[A-Z]/.test(x))) continue; // names and titles: a real list
        if (kind === "inline" && /\b(?:and|or)\b/i.test(first)) continue;
        if (!short && kind !== "oxford" && w0 > 4 && cls(first) !== cls(mid)) continue;
        if (kind === "bare" && !(cls(first) === cls(mid) && cls(mid) === cls(lastItem))) continue;
        // A fourth item before this one makes it a longer list.
        if (!tookTail && k > 0 && !/[:;—]/.test(a) && wc(afterBreak(segs[k - 1].t)) <= 4 && (short || cls(segs[k - 1].t) === cls(mid))) continue;
        const from = segs[k].at + s.text.slice(segs[k].at).indexOf(first);
        const to = end + 1 < segs.length ? segs[end + 1].at - 1 : s.text.length;
        out.push({ offset: s.start + from, match: s.text.slice(from, to).trim() });
        k = end - 1;
      }
    }
  }
  return out;
}
