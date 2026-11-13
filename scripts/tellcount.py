"""Shared phrase counting for shibbo's matched-design importers (RAID, local runs).
Tokens match src/text.ts: lowercase words with apostrophes kept; segments end at . ! ? and newlines."""
import csv, gzip, math, re
from collections import Counter, defaultdict

TOK = re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)*")
SEG = re.compile(r"[.!?\n]")


CHROME = re.compile(
    r"cookie|consent|privacy policy|subscribe|newsletter|\bsign up\b|\blog ?in\b|skip to (?:main )?content|all rights reserved|©"
    r"|\bshare (?:this|on)\b|\bread more\b|\bclick here\b|related (?:posts|articles)|affiliate link|\bopt.out\b|terms of (?:use|service)"
    r"|\bposted (?:by|on)\b|leave a (?:comment|reply)|https?://|www\.|IABV2|^\s*\|?\s*-{3,}"
    r"|^\s*always active\s*$|\bfollow us\b|\blike us on\b|^\s*(?:label\s*)+$",
    re.I,
)
NAV = re.compile(r"^\s*(?:home|menu|search|advertisement|share|tweet|pin it|print|email|facebook|twitter|instagram|pinterest|linkedin)\s*$", re.I)


def clean(text, rep=frozenset()):
    """Drop web-page clutter lines: repeated page lines (rep), page-chrome patterns and bare nav words."""
    keep = []
    for l in (text or "").split("\n"):
        s = l.strip()
        if s in rep or NAV.match(s) or CHROME.search(s):
            continue
        keep.append(l)
    return "\n".join(keep)


def _words(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split()


def strip_title(text, title):
    """Drop the echoed title line from a shibbo run: the prompt gives each model the title (GPT-4.1's, from
    Graphite's data), so that line carries another model's words. A first line that matches the title, or a
    heading that shares 80% of its words, goes."""
    lines = (text or "").split("\n")
    for i, l in enumerate(lines):
        if not l.strip():
            continue
        a, b = _words(l), _words(title)
        same = a == b or (l.lstrip().startswith("#") and b and len(set(a) & set(b)) >= 0.8 * max(len(set(a)), len(set(b))))
        return "\n".join(lines[i + 1:]) if same else text
    return text


def segments(text):
    for seg in SEG.split(text or ""):
        toks = [t.lower().replace("’", "'") for t in TOK.findall(seg)]
        if toks:
            yield toks


def load_terms(graphite_csv, tells_yaml):
    """Every term in Graphite's table (so the map can place a model) plus the registry's linked terms."""
    terms = set()
    with gzip.open(graphite_csv, "rt") as f:
        for row in csv.DictReader(f):
            terms.add(row["term"])
    reg = open(tells_yaml).read()
    for m in re.finditer(r"graphite(?:_absent)?: \[([^\]]*)\]", reg):
        for t in re.split(r",\s*", m.group(1)):
            t = t.strip().strip("'\"")
            if t:
                terms.add(t)
    return terms


def make_counter(terms):
    short = {t for t in terms if "_" not in t and len(t.split()) <= 3}
    long_index = defaultdict(list)  # first token -> [(tuple, term)] for frames and 4+ grams
    for t in terms - short:
        parts = tuple(t.split())
        if parts[0] != "_":
            long_index[parts[0]].append((parts, t))
    return lambda texts: count(texts, short, long_index)


def count(texts, short, long_index):
    c = Counter()
    positions = Counter()
    words = 0
    for text in texts:
        for toks in segments(text):
            n = len(toks)
            words += n
            for k in (1, 2, 3, 4, 5, 6, 7):
                positions[k] += max(0, n - k + 1)
            for i in range(n):
                g = toks[i]
                if g in short:
                    c[g] += 1
                if i + 1 < n:
                    g2 = g + " " + toks[i + 1]
                    if g2 in short:
                        c[g2] += 1
                    if i + 2 < n:
                        g3 = g2 + " " + toks[i + 2]
                        if g3 in short:
                            c[g3] += 1
                for parts, term in long_index.get(toks[i], ()):
                    k = len(parts)
                    if i + k <= n and all(p == "_" or p == toks[i + j] for j, p in enumerate(parts)):
                        c[term] += 1
    return c, positions, words


def style(texts):
    em = sum(t.count("—") for t in texts)
    delve = sum(len(re.findall(r"\bdelv(?:e|es|ed|ing)\b", t, re.I)) for t in texts)
    words = sum(len(TOK.findall(t)) for t in texts)
    contractions = sum(len(re.findall(r"\b(?:it|that|there|here|what)['’]s\b|\b\w+n['’]t\b|\b\w+['’](?:re|ve|ll|m|d)\b", t, re.I)) for t in texts)
    return {"emdash_per1k": round(1000 * em / max(words, 1), 3), "delve_per1k": round(1000 * delve / max(words, 1), 4), "contractions_per1k": round(1000 * contractions / max(words, 1), 2), "words": words}




def log2ratios(terms, model_counts, human_counts, min_total=5):
    """Model rate over human rate per term, half-count smoothing on the side that never used it."""
    mc, mpos, _ = model_counts
    hc, hpos, _ = human_counts
    out = {}
    for t in terms:
        k = len(t.split())
        a, b = mc.get(t, 0), hc.get(t, 0)
        if a + b < min_total:
            continue
        m_rate = (a or 0.5) / max(mpos[k], 1)
        h_rate = (b or 0.5) / max(hpos[k], 1)
        out[t] = round(math.log2(m_rate / h_rate), 2)
    return out
