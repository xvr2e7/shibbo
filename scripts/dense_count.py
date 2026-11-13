"""Count every 1-3-gram (plus Graphite's frames and the registry's longer terms) per topic, from Graphite's paired articles.

    uv run --with numpy --with scipy python -I scripts/dense_count.py <ai_tells_articles.jsonl.gz> <out-dir>

Graphite's published table lists only the terms that passed its own selection for each model, so a missing
(term, model) cell is unknown, not "no difference". Counting the articles directly gives a full table.

Before counting, every text (people and models alike) loses web-page clutter: lines repeated on 3+ human
pages (cookie banners, nav, sign-up boxes), lines matching common page-chrome patterns, and bare nav words.
Topics whose human page is a BibTeX entry are dropped. The texts stay local; out-dir holds only counts
(sparse topic x term matrices) and belongs in .cache/, never in the repo.
Tokens match scripts/tellcount.py and src/text.ts.
"""
import glob, gzip, hashlib, json, os, re, sys
from array import array
from collections import Counter
from multiprocessing import Pool

import numpy as np
import scipy.sparse as sp

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # explicit: shared tokenizer
from tellcount import segments, clean  # noqa: E402

SRC, OUT = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPORA = ["human", "gpt41", "gpt5", "gpt-5-6-sol", "gpt-6-astra", "claude-opus-4-20250514", "claude-opus-4-6", "claude-opus-5", "claude-opus-5-5", "gemini-2-5-pro", "gemini-3-1-pro-preview"]
MIN_DF = 10  # keep an n-gram if it appears in this many articles of at least one corpus

def repeated_human_lines():
    seen = Counter()
    with gzip.open(SRC, "rt") as f:
        for line in f:
            t = json.loads(line).get("human") or ""
            for l in {x.strip() for x in t.split("\n")}:
                if len(l) >= 15:
                    seen[l] += 1
    return {l for l, n in seen.items() if n >= 3}


def load_long_terms():
    """Frames from Graphite's table and 4+-word terms from the registry: matched token by token, `_` = any one token."""
    terms = set()
    with gzip.open(os.path.join(ROOT, "data/raw/graphite/tells_vs_human.csv.gz"), "rt") as f:
        next(f)
        for line in f:
            kind, term = line.split(",", 2)[:2]
            if kind == "frame" or len(term.split()) > 3:
                terms.add(term)
    for p in [os.path.join(ROOT, "data/tells.yaml"), *glob.glob(os.path.join(ROOT, "data/tells.d/*.yaml"))]:
        for m in re.finditer(r"graphite(?:_absent)?: \[([^\]]*)\]", open(p).read()):
            for t in re.split(r",\s*", m.group(1)):
                t = t.strip().strip("'\"")
                if t and ("_" in t.split() or len(t.split()) > 3):
                    terms.add(t)
    return sorted(terms)


def H(s):
    return int.from_bytes(hashlib.blake2b(s.encode(), digest_size=8).digest(), "little") & ((1 << 62) - 1)


def grams(toks):
    n = len(toks)
    for i in range(n):
        g = toks[i]
        yield g
        if i + 1 < n:
            g2 = g + " " + toks[i + 1]
            yield g2
            if i + 2 < n:
                yield g2 + " " + toks[i + 2]


def pass1(args):
    corpus, rep, long_terms = args
    index = {}
    for j, t in enumerate(long_terms):
        parts = tuple(t.split())
        if parts[0] != "_":
            index.setdefault(parts[0], []).append((parts, j))
    hs, ds = array("q"), array("i")
    lc = []  # (doc, long-term index, count)
    pos = np.zeros(7, np.int64)
    lens = []
    dropped = 0
    with gzip.open(SRC, "rt") as f:
        for doc, line in enumerate(f):
            d = json.loads(line)
            raw = d.get(corpus) or ""
            if (d.get("human") or "").lstrip().startswith("@") and re.match(r"\s*@\w+\{", d.get("human") or ""):
                lens.append(0); dropped += 1
                continue
            t = clean(raw, rep)
            L = 0
            lcount = Counter()
            for toks in segments(t):
                n = len(toks); L += n
                for k in range(7):
                    pos[k] += max(0, n - k)
                for g in grams(toks):
                    hs.append(H(g)); ds.append(doc)
                for i in range(n):
                    for parts, j in index.get(toks[i], ()):
                        k = len(parts)
                        if i + k <= n and all(p == "_" or p == toks[i + q] for q, p in enumerate(parts)):
                            lcount[j] += 1
            lens.append(L)
            for j, c in lcount.items():
                lc.append((doc, j, c))
    hs = np.frombuffer(hs, np.int64); ds = np.frombuffer(ds, np.int32)
    order = np.lexsort((ds, hs)); hs, ds = hs[order], ds[order]
    brk = np.flatnonzero(np.r_[True, (hs[1:] != hs[:-1]) | (ds[1:] != ds[:-1])])
    cnt = np.diff(np.r_[brk, len(hs)]).astype(np.int32)
    lc = np.array(lc, np.int64).reshape(-1, 3)
    np.savez(f"{OUT}/p1_{corpus}.npz", h=hs[brk], d=ds[brk], c=cnt, pos=pos, lens=np.array(lens), lc=lc)
    return corpus, len(brk), dropped


def pass2(args):
    corpus, keep_path, rep = args
    keep = set(np.load(keep_path).tolist())
    found = {}
    with gzip.open(SRC, "rt") as f:
        for line in f:
            for toks in segments(clean(json.loads(line).get(corpus) or "", rep)):
                for g in grams(toks):
                    x = H(g)
                    if x in keep and x not in found:
                        found[x] = g
    return found


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    rep = repeated_human_lines()
    print(f"repeated human lines (3+ pages): {len(rep)}", file=sys.stderr, flush=True)
    long_terms = load_long_terms()
    print(f"frames and long terms: {len(long_terms)}", file=sys.stderr, flush=True)
    with Pool(5) as p:
        for r in p.imap_unordered(pass1, [(c, rep, long_terms) for c in CORPORA]):
            print("counted", r, file=sys.stderr, flush=True)
    keep = set()
    for c in CORPORA:
        z = np.load(f"{OUT}/p1_{c}.npz")
        u, df = np.unique(z["h"], return_counts=True)
        keep.update(u[df >= MIN_DF].tolist())
    keep = np.array(sorted(keep), np.int64)
    np.save(f"{OUT}/keep.npy", keep)
    print(f"vocabulary: {len(keep)} n-grams", file=sys.stderr, flush=True)
    strings = {}
    with Pool(5) as p:
        for found in p.imap_unordered(pass2, [(c, f"{OUT}/keep.npy", rep) for c in CORPORA]):
            for k, v in found.items():
                strings.setdefault(k, v)
    terms = [strings[k] for k in keep.tolist()]
    V = len(terms)
    for c in CORPORA:
        z = np.load(f"{OUT}/p1_{c}.npz")
        m = np.isin(z["h"], keep)
        cols = np.searchsorted(keep, z["h"][m])
        lc = z["lc"]
        rows = np.r_[z["d"][m], lc[:, 0]]
        cs = np.r_[cols, V + lc[:, 1]]
        vals = np.r_[z["c"][m], lc[:, 2]]
        X = sp.csr_matrix((vals, (rows, cs)), shape=(len(z["lens"]), V + len(long_terms)))
        sp.save_npz(f"{OUT}/X_{c}.npz", X)
        np.savez(f"{OUT}/meta_{c}.npz", pos=z["pos"], lens=z["lens"])
        os.remove(f"{OUT}/p1_{c}.npz")
    json.dump({"terms": terms + long_terms, "ngrams": V, "corpora": CORPORA}, open(f"{OUT}/terms.json", "w"))
    print("done", file=sys.stderr)
