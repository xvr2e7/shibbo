"""Turn the full counts from dense_count.py into the atlas: per-model phrase statistics, phrase selection, and a
correspondence analysis (CA) that places people, models and phrases in one plane.

    uv run --with numpy --with scipy --with pandas --with pyyaml python -I scripts/dense_map.py <count-dir> [<raid-dir>]
      -> data/measured/dense.json   (npx tsx scripts/map-data.ts then lays it out into data/measured/map.json)

Per model, against the human article on each of the same topics:
  ratio     model rate over human rate, per position of the phrase's length; a side that never used it counts 0.5.
  test      paired sign test over topics (does the model article use it at a higher rate than its human twin?),
            Benjamini-Hochberg q < 0.01 across all tested phrases for that model.
A phrase reaches the map when, for at least one model, it is 4x or more one way, significant, used in 40+ articles
on the side that uses it more (150+, 1.5% of topics), spread over topics (the top 5 hold at most 25% of its uses),
not an echo of the human page's own topic (a model phrase that turns up mainly where the human page used it too),
readable (no stray single letters; a gapped frame needs enough fixed words and must beat its best single word by 1.5x),
and not just a fragment of a longer phrase on the map. Thresholds follow the term audit in the commit history.

Layout: CA of the phrase x corpus count table (people are one of the corpora, eleven as of Opus 5.5; phrases in 40+ articles of some corpus).
Corpora sit at their CA vertices, each phrase at the average of the vertices weighted by who uses it, so a phrase
people and models share lands between them. People are moved to the origin. RAID's 2022-23 models are placed as
supplementary corpora, each relative to its own matched human texts, and so are shibbo's own local and API runs on
Graphite's held-out topics (100+ articles each). Only derived numbers are written.
"""
import glob, json, math, os, re, sys

import numpy as np
import scipy.sparse as sp
import yaml
from scipy.stats import binom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # explicit: shared counting module
from tellcount import make_counter, clean, strip_title  # noqa: E402

D = sys.argv[1]
RAID_DIR = sys.argv[2] if len(sys.argv) > 2 else None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = dict(min_ratio_log2=2.0, q=0.01, min_docs=150, max_top5=0.25, echo_topics=10, echo_lift=10, frame_lift_log2=0.585, base_docs=40, cap=5000, frag=0.8)

meta = json.load(open(f"{D}/terms.json"))
terms, V0, C = meta["terms"], meta["ngrams"], meta["corpora"]
T = len(terms)
is_frame = np.array([("_" in t.split()) for t in terms])
K = np.array([len(t.split()) for t in terms])
X = {c: sp.load_npz(f"{D}/X_{c}.npz").tocsr().astype(np.float64) for c in C}
mt = {c: np.load(f"{D}/meta_{c}.npz") for c in C}
lens = {c: mt[c]["lens"].astype(np.float64) for c in C}
P = {c: mt[c]["pos"][np.minimum(K, 7) - 1].astype(np.float64) for c in C}
N = np.vstack([np.asarray(X[c].sum(0)).ravel() for c in C])  # corpora x T
DF = np.vstack([X[c].getnnz(axis=0) for c in C])
words = {c: int(lens[c].sum()) for c in C}
print(f"terms {T} (n-grams {V0}), words: " + ", ".join(f"{c} {w:,}" for c, w in words.items()), file=sys.stderr)

ms = yaml.safe_load(open(f"{ROOT}/data/models.yaml"))["models"]
slug2id = {m["graphite"]: m["id"] for m in ms if m.get("graphite")}
M = C[1:]
NM, NC = len(M), len(C)


def bh(p):
    n = len(p); o = np.argsort(p); q = np.empty(n)
    q[o] = np.minimum.accumulate((p[o] * n / np.arange(1, n + 1))[::-1])[::-1]
    return np.minimum(q, 1)


def top5_share(Xc, cols):
    """Share of each column's uses that come from its 5 heaviest topics."""
    Z = Xc[:, cols].tocsc()
    out = np.zeros(len(cols))
    for i in range(len(cols)):
        d = Z.data[Z.indptr[i]:Z.indptr[i + 1]]
        if len(d):
            out[i] = np.sort(d)[-5:].sum() / d.sum()
    return out


h = 0
STATS = f"{D}/stats.npz"
if os.path.exists(STATS):
    z = np.load(STATS); L2, Q, TOP, ECHO, SH = z["L2"], z["Q"], z["TOP"], z["ECHO"], z["SH"]
    print("stats: cached", file=sys.stderr)
else:
    L2 = np.zeros((NM, T)); Q = np.ones((NM, T)); TOP = np.zeros((NM, T)); ECHO = np.zeros((NM, T)); SH = np.zeros((NM, T))
    Bh = (X["human"] > 0).astype(np.float64)
    for i, m in enumerate(M):
        a, b = N[i + 1], N[h]
        L2[i] = np.log2((np.where(a > 0, a, 0.5) / P[m]) / (np.where(b > 0, b, 0.5) / P["human"]))
        paired = (lens[m] > 0) & (lens["human"] > 0)
        cand = np.flatnonzero((np.abs(L2[i]) >= 1) & (np.maximum(DF[i + 1], DF[h]) >= 40))
        Rm = sp.diags(np.where(paired, 1 / np.maximum(lens[m], 1), 0)) @ X[m][:, cand]
        Rh = sp.diags(np.where(paired, 1 / np.maximum(lens["human"], 1), 0)) @ X["human"][:, cand]
        Dd = (Rm - Rh).tocsc()
        pos_, neg_ = np.asarray((Dd > 0).sum(0)).ravel(), np.asarray((Dd < 0).sum(0)).ravel()
        n = pos_ + neg_
        Q[i, cand] = bh(np.minimum(1, 2 * binom.cdf(np.minimum(pos_, neg_), np.maximum(n, 1), 0.5)))
        over = L2[i, cand] > 0
        TOP[i, cand[over]] = top5_share(X[m], cand[over])
        TOP[i, cand[~over]] = top5_share(X["human"], cand[~over])
        # Topic echo: how much likelier the model is to use a phrase on topics where the human page used it.
        Bm = (X[m][:, cand] > 0).astype(np.float64)
        shared = np.asarray(Bm.multiply(Bh[:, cand]).sum(0)).ravel()
        dm, dh = np.asarray(Bm.sum(0)).ravel(), DF[h][cand]
        SH[i, cand] = shared
        ECHO[i, cand] = np.where(dh > 0, (shared / np.maximum(dh, 1)) / np.maximum(dm / len(lens[m]), 1e-9), 0)
        print(f"{m:24s} tested {len(cand):7d}  significant {int((Q[i] < CFG['q']).sum()):6d}", file=sys.stderr, flush=True)
    np.savez(STATS, L2=L2, Q=Q, TOP=TOP, ECHO=ECHO, SH=SH)

# ── selection ──
fav_docs = np.where(L2 > 0, DF[1:], DF[h][None, :])
ok = (np.abs(L2) >= CFG["min_ratio_log2"]) & (Q < CFG["q"]) & (fav_docs >= CFG["min_docs"]) & (TOP < CFG["max_top5"])
# A model that over-uses and one that under-uses the same phrase both count; the map draws the stronger side.
# Frames read only when they carry two or more words and the gap sits inside.
STOP = set("a an the and or but of to in on at for with by from as is are was were be been being it its it's this that these those there here i you he she we they me him her us them my your his our their not no so if then than too very can could will would shall should may might must do does did done have has had having just also only into over out up down about more most such what which who whom whose when where why how all any each both few other some own same s t".split())
def readable(t, frame):
    w = t.split()
    if any((len(x) == 1 and x not in ("a", "i", "_")) or x.isdigit() for x in w):
        return False  # stray letters ("u s") and numbers (prices, dates, table cells)
    if not frame:
        return True
    if w[0] == "_" or w[-1] == "_":
        return False
    fixed = [x for x in w if x != "_"]
    content = [x for x in fixed if x not in STOP]
    if w.count("_") >= 2 or w[0] in ("and", "or", "but", "of", "to"):
        return len(fixed) >= 4
    return len(content) >= 2 or (len(content) == 1 and len(fixed) >= 3) or len(fixed) >= 4
ok &= np.array([readable(t, f) for t, f in zip(terms, is_frame)])[None, :]
# A model phrase that mostly echoes the human page's own topic is content, not style.
ok &= ~((L2 > 0) & (SH >= CFG["echo_topics"]) & (ECHO >= CFG["echo_lift"]))
# A frame must say more than its strongest single word does alone.
tix0 = {t: j for j, t in enumerate(terms)}
for j in np.flatnonzero(is_frame & ok.any(0)):
    ws = [tix0[x] for x in terms[j].split() if x != "_" and x in tix0]
    if ws:
        alone = np.abs(L2[:, ws]).max(1)
        ok[:, j] &= (np.abs(L2[:, j]) - alone) >= CFG["frame_lift_log2"]
q_terms = np.flatnonzero(ok.any(0))
score = np.where(ok, np.minimum(np.abs(L2), 6) + np.log2(np.maximum(fav_docs, 1)) / 4, -1)
best = score.argmax(0)
# Drop a phrase when a longer phrase on the map carries most of its uses for the model that owns it.
sel = sorted(q_terms.tolist(), key=lambda j: -score[best[j], j])
chosen = set(sel)
by_words = {terms[j]: j for j in sel}
drop = set()
for j in sel:
    t = terms[j]
    if is_frame[j]:
        continue
    i = best[j]
    side = i + 1 if L2[i, j] > 0 else h
    for s, k in by_words.items():
        if k != j and not is_frame[k] and len(s) > len(t) and f" {t} " in f" {s} " and N[side, k] >= CFG["frag"] * N[side, j]:
            drop.add(j)
            break
sel = [j for j in sel if j not in drop][: CFG["cap"]]
sel = np.array(sel)
under = L2[best[sel], sel] < 0
print(f"selected {len(sel)} (qualified {len(q_terms)}, fragments dropped {len(drop)}), people use more: {int(under.sum())}", file=sys.stderr)

# ── correspondence analysis ──
base = np.flatnonzero((~is_frame) & (np.arange(T) < V0) & (DF.max(0) >= CFG["base_docs"]))
F = N[:, base].T
Pm = F / F.sum()
r, c = Pm.sum(1), Pm.sum(0)
S = (Pm - np.outer(r, c)) / np.sqrt(np.outer(r, c))
ev, vec = np.linalg.eigh(S.T @ S)
o = np.argsort(ev)[::-1]; ev, vec = ev[o], vec[:, o]
G = vec / np.sqrt(c)[:, None]  # column standard coordinates
explained = float(ev[:2].sum() / ev.sum() * 100)
inertia_share = {C[k]: float(((S[:, k] ** 2).sum()) / ev.sum()) for k in range(NC)}
print(f"CA on {len(base)} phrases: axes 1-2 explain {explained:.1f}%; people carry {inertia_share['human'] * 100:.1f}% of inertia", file=sys.stderr)
prof = lambda f: f / np.maximum(f.sum(-1, keepdims=True), 1e-12)
RP = prof(F) @ G[:, :2]  # base phrases, principal coordinates
supcol = lambda v: (prof(v) @ RP) / ev[:2]  # standard coordinates of a supplementary corpus
assert np.allclose(supcol(F[:, 1]), G[1, :2], atol=1e-6), "supplementary placement must reproduce an active corpus"

origin = G[0, :2].copy()
flip = np.array([-1.0 if G[1, 0] - origin[0] > 0 else 1.0, 1.0])
place = lambda xy: (np.asarray(xy) - origin) * flip
gm = place(G[1:, :2])
scale = 100 / np.hypot(gm[:, 0], gm[:, 1]).max()
models_out = [{"id": slug2id[m], "graphite": m, "x": round(float(gm[i, 0] * scale), 2), "y": round(float(gm[i, 1] * scale), 2)} for i, m in enumerate(M)]
txy = place(prof(N[:, sel].T) @ G[:, :2]) * scale

# ── RAID (2022-23), counted with the same filters, relative to each model's own human texts ──
raid_out = []
RAID = {"gpt3": "text-davinci-002", "chatgpt": "gpt-3.5-turbo-0613", "gpt4": "gpt-4-0613", "llama-chat": "llama-2-70b-chat", "mistral-chat": "mistral-7b-instruct", "mpt-chat": "mpt-30b-chat", "cohere-chat": "cohere-command-chat"}
def raid_count(args):
    texts_m, texts_h, want = args
    count = make_counter(set(want))
    return count([clean(str(x)) for x in texts_m]), count([clean(str(x)) for x in texts_h])


raid_meta = {m["id"]: m for m in json.load(open(f"{ROOT}/data/measured/raid.json"))["models"]} if os.path.exists(f"{ROOT}/data/measured/raid.json") else {}


def place_extra(rec, mc, mpos, hc, hpos):
    """Place a supplementary corpus relative to its own matched human texts and attach per-phrase ratios."""
    vm = np.array([mc.get(terms[j], 0) for j in base], float); vh = np.array([hc.get(terms[j], 0) for j in base], float)
    xy = (supcol(vm) - supcol(vh)) * flip * scale
    lv, nm, nh = [], [], []
    for j in sel:
        t = terms[j]; k = min(len(t.split()), 7); a, b = mc.get(t, 0), hc.get(t, 0)
        nm.append(a); nh.append(b)
        lv.append(None if a + b < 5 else round(math.log2(((a or 0.5) / max(mpos.get(k, 0), 1)) / ((b or 0.5) / max(hpos.get(k, 0), 1))), 2))
    rec.update(x=round(float(xy[0]), 2), y=round(float(xy[1]), 2), log2=lv, n=nm, human_n=nh)
    raid_out.append(rec)
    print(f"{rec['source']:5s} {rec['id']:22s} at ({xy[0]:6.1f}, {xy[1]:6.1f}), {rec['docs']} texts", file=sys.stderr, flush=True)


if RAID_DIR:
    RC = f"{D}/raid_counts.json"
    want = [terms[j] for j in np.flatnonzero(DF.max(0) >= CFG["base_docs"])]
    if os.path.exists(RC):
        rc = json.load(open(RC))
    else:
        import pandas as pd
        from multiprocessing import get_context
        cols = ["id", "source_id", "model", "decoding", "repetition_penalty", "domain", "generation"]
        df = pd.concat([pd.read_csv(f"{RAID_DIR}/{n}", usecols=cols) for n in ("train_none.csv", "extra_none.csv") if os.path.exists(f"{RAID_DIR}/{n}")], ignore_index=True)
        df = df[df["domain"].isin({"abstracts", "books", "news", "recipes", "reddit", "reviews", "wiki"})]
        human = df[df["model"] == "human"].set_index("id")["generation"]
        jobs, names = [], []
        for rn in RAID:
            sub = df[(df["model"] == rn) & (df["decoding"] == "sampling") & (df["repetition_penalty"] == "no")]
            if sub.empty:
                continue
            hum = human.reindex(sub["source_id"].unique()).dropna()
            jobs.append((sub["generation"].tolist(), hum.tolist(), want)); names.append((rn, len(sub)))
        del df
        rc = {}
        with get_context("fork").Pool(min(7, len(jobs))) as pool:  # fork: workers must not re-run this script
            for (rn, ndocs), ((mc, mpos, mw), (hc, hpos, hw)) in zip(names, pool.map(raid_count, jobs)):
                rc[rn] = {"docs": ndocs, "m": dict(mc), "mpos": dict(mpos), "mw": mw, "h": dict(hc), "hpos": dict(hpos), "hw": hw}
                print(f"RAID {rn} counted", file=sys.stderr, flush=True)
        json.dump(rc, open(RC, "w"))
    for rn, rid in RAID.items():
        if rn not in rc:
            continue
        r = rc[rn]; mc, hc = r["m"], r["h"]
        mpos = {int(k): v for k, v in r["mpos"].items()}; hpos = {int(k): v for k, v in r["hpos"].items()}
        rm = raid_meta.get(rid, {})
        place_extra({"id": rid, "name": rm.get("name", rid), "family": rm.get("family", "other"), "released": rm.get("released", ""), "verified": rm.get("verified", True), "source": "raid", "docs": r["docs"]}, mc, mpos, hc, hpos)

# ── shibbo's own runs on Graphite's held-out topics, against those topics' human articles: local open-weight models
# (measure/generate-local.ts, runs local-*) and hosted models through their APIs (measure/generate-api.ts, runs api-*).
# Each is a supplementary corpus placed relative to its own human twins; a run needs MIN_LOCAL articles.
MIN_LOCAL = 100
runs = sorted(glob.glob(f"{ROOT}/measure/runs/local-*/matched.jsonl")) + sorted(glob.glob(f"{ROOT}/measure/runs/api-*/matched.jsonl"))
if runs:
    import gzip
    lm = {m["ollama"]: m for m in (yaml.safe_load(open(f"{ROOT}/measure/local-models.yaml")) or [])}
    am = {f"api-{m['id']}": {"id": m["id"], "name": m["name"], "family": m["family"], "released": str(m["released"]), "verified": False} for m in (yaml.safe_load(open(f"{ROOT}/measure/api-models.yaml")) or [])}
    for m in ms:
        if m.get("source") == "shibbo-api":
            am[m.get("run", f"api-{m['id']}")] = {"id": m["id"], "name": m["name"], "family": m["family"], "released": str(m["released"]), "verified": m.get("verified", False)}
    rows = {}
    for f in runs:
        run = f.split("/")[-2]
        # A bridge run (a model Graphite also measured, under shibbo's prompt) feeds only the arena: on the atlas it
        # would clash with Graphite's point of the same id.
        if run.startswith("api-") and am.get(run, {}).get("id", run[4:]) in slug2id.values():
            print(f"run {run}: bridge run of a Graphite model, left off the atlas", file=sys.stderr)
            continue
        rr = [json.loads(l) for l in open(f) if l.strip()]
        rr = [x for x in rr if x.get("stop_reason") in ("end_turn", "max_tokens", "stop", "length") and x.get("text")]
        if len(rr) >= MIN_LOCAL:
            rows[run] = rr
        else:
            print(f"run {run}: {len(rr)} articles, needs {MIN_LOCAL}", file=sys.stderr)
    if rows:
        from collections import Counter
        need = {x["topic"] for rr in rows.values() for x in rr}
        human, seen = {}, Counter()
        src = f"{ROOT}/.cache/graphite-55/ai_tells_articles_opus55.jsonl.gz"
        src = src if os.path.exists(src) else f"{ROOT}/.cache/ai_tells_articles.jsonl.gz"
        with gzip.open(src, "rt") as fh:
            for line in fh:
                d = json.loads(line)
                t = d.get("human") or ""
                for l in {x.strip() for x in t.split("\n")}:
                    if len(l) >= 15:
                        seen[l] += 1
                if d["url"] in need:
                    human[d["url"]] = t
        rep = frozenset(l for l, n in seen.items() if n >= 3)  # lines on 3+ human pages, as in dense_count.py
        count = make_counter({terms[j] for j in base} | {terms[j] for j in sel})
        for run, rr in rows.items():
            rr = [x for x in rr if human.get(x["topic"])]
            (mc, mpos, _), (hc, hpos, _) = count([clean(strip_title(x["text"], x.get("title", ""))) for x in rr]), count([clean(human[x["topic"]], rep) for x in rr])
            if run.startswith("api-"):
                m = am.get(run, {"id": run[4:], "name": rr[0]["model"], "family": "other", "released": "", "verified": False})
                place_extra({**m, "source": "api", "docs": len(rr)}, mc, mpos, hc, hpos)
            else:
                tag = rr[0]["model"]
                m = lm.get(tag, {})
                place_extra({"id": m.get("id", tag.replace(":", "-")), "name": m.get("name", tag), "family": m.get("family", "other"), "released": str(m.get("released", "")), "verified": True, "source": "local", "docs": len(rr)}, mc, mpos, hc, hpos)

out = {
    "attribution": 'Counted by shibbo from the paired articles of Graphite, "AI Tells" (2026), CC BY 4.0',
    "method": {**CFG, "test": "paired sign test over topics, Benjamini-Hochberg", "layout": "correspondence analysis, people at the origin", "clutter": "repeated page lines, page-chrome patterns and nav words removed from every corpus"},
    "explained": round(explained, 1),
    "inertia": {k: round(v, 4) for k, v in inertia_share.items()},
    "words": words,
    "models": models_out,
    "raid": [{k: v for k, v in r.items() if k not in ("log2", "n", "human_n")} for r in raid_out],
    "terms": [
        {
            "t": terms[j], "x": round(float(txy[n, 0]), 2), "y": round(float(txy[n, 1]), 2), "under": int(under[n]),
            "v": [int(round(float(np.clip(L2[i, j], -10, 10)) * 10)) for i in range(NM)],
            "sig": int(sum(1 << i for i in range(NM) if Q[i, j] < CFG["q"])),
            "ok": int(sum(1 << i for i in range(NM) if ok[i, j])),
            "n": [int(N[k, j]) for k in range(NC)], "d": [int(DF[k, j]) for k in range(NC)],
            "raid": [None if r["log2"][n] is None else int(round(max(-10, min(10, r["log2"][n])) * 10)) for r in raid_out],
            "rn": [[r["n"][n], r["human_n"][n]] for r in raid_out],
        }
        for n, j in enumerate(sel)
    ],
}
json.dump(out, open(f"{ROOT}/data/measured/dense.json", "w"), separators=(",", ":"))
for m in out["models"] + out["raid"]:
    print(f"  {m['id']:22s} {m['x']:7.1f} {m['y']:7.1f}  dist {math.hypot(m['x'], m['y']):6.1f}", file=sys.stderr)

# Full per-model statistics for the registry's linked terms (tell pages), so they no longer depend on Graphite's selection.
reg = {}
for f in [f"{ROOT}/data/tells.yaml", *glob.glob(f"{ROOT}/data/tells.d/*.yaml")]:
    for t in yaml.safe_load(open(f)) or []:
        for x in [*(t.get("measure", {}) or {}).get("graphite", []), *(t.get("measure", {}) or {}).get("graphite_absent", [])]:
            reg[x] = t["id"]
tix = {t: j for j, t in enumerate(terms)}
linked = {}
for x in reg:
    j = tix.get(x)
    if j is None:
        continue
    linked[x] = {"v": [round(float(L2[i, j]), 2) for i in range(NM)], "q": [float(f"{Q[i, j]:.2g}") for i in range(NM)], "n": [int(N[k, j]) for k in range(NC)], "d": [int(DF[k, j]) for k in range(NC)], "top5": [round(float(TOP[i, j]), 3) for i in range(NM)]}
json.dump({"corpora": C, "models": [slug2id[m] for m in M], "terms": linked, "missing": sorted(set(reg) - set(linked))}, open(f"{ROOT}/data/measured/dense-registry.json", "w"), separators=(",", ":"))
print(f"registry terms: {len(linked)} measured, {len(set(reg) - set(linked))} not in the counts", file=sys.stderr)
