"""Measure shibbo's own runs against the human articles of the same topics.

    uv run --with pandas --with pyyaml python -I scripts/import_local.py <ai_tells_articles.jsonl.gz> <graphite tells csv.gz> <tells.yaml> <out.json> [<api-out.json>]

Local open-weight runs (measure/runs/local-*/matched.jsonl) go to <out.json>, as before. API runs
(measure/runs/api-*/matched.jsonl, from measure/generate-api.ts) go to <api-out.json> (default: api.json next to
<out.json>); see measure_api() below for what that file holds.

Each local run answered the same title, at the same length, as a human article from Graphite's held-out topics
(measure/generate-local.ts). This compares each model with exactly those human articles. Texts stay local;
only derived rates are written. Models and their labs/release months come from measure/local-models.yaml.
"""
import glob, gzip, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # explicit: shared counting module
from tellcount import load_terms, make_counter, log2ratios, style, segments, clean, strip_title  # noqa: E402

articles, graphite_csv, tells_yaml, out_path = sys.argv[1:5]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
meta = {}
meta_path = os.path.join(root, "measure", "local-models.yaml")
if os.path.exists(meta_path):
    import re
    cur = None
    for line in open(meta_path):
        m = re.match(r"^- ollama: (\S+)", line)
        if m:
            cur = m.group(1); meta[cur] = {}
            continue
        m = re.match(r"^\s+(\w+): (.+)$", line)
        if m and cur:
            meta[cur][m.group(1)] = m.group(2).strip().strip('"')

runs = {}
for f in glob.glob(os.path.join(root, "measure", "runs", "local-*", "matched.jsonl")):
    rows = [json.loads(l) for l in open(f) if l.strip()]
    rows = [r for r in rows if r.get("stop_reason") in ("end_turn", "max_tokens") and r.get("text")]
    if rows:
        runs[rows[0]["model"]] = rows
need = {r["topic"] for rows in runs.values() for r in rows}
human = {}
with gzip.open(articles, "rt") as fh:
    for line in fh:
        d = json.loads(line)
        if d["url"] in need:
            human[d["url"]] = d.get("human") or ""

terms = load_terms(graphite_csv, tells_yaml)
count = make_counter(terms)
out = {"source": {"title": "Local runs by shibbo on Graphite topics (open-weight models via Ollama)", "url": "https://github.com/xvr2e7/shibbo/tree/main/measure", "license": "derived rates"},
       "design": "Each model wrote an article with the same title and target length as one held-out human article from Graphite's topics, compared with exactly those human articles.",
       "models": []}
for model, rows in sorted(runs.items()):
    hum = [human[r["topic"]] for r in rows if human.get(r["topic"])]
    gen = [strip_title(r["text"], r.get("title", "")) for r in rows if human.get(r["topic"])]
    if len(gen) < 20:
        print(f"skip {model}: only {len(gen)} matched outputs (need 20)", file=sys.stderr)
        continue
    mc = count(gen)
    hc = count(hum)
    m = meta.get(model, {})
    out["models"].append({
        "id": m.get("id", model.replace(":", "-")), "name": m.get("name", model), "lab": m.get("lab", ""), "family": m.get("family", "other"),
        "released": m.get("released", ""), "ollama": model, "docs": len(gen), "human_docs": len(hum),
        "style": style(gen), "human_style": style(hum), "log2ratio": log2ratios(terms, mc, hc, min_total=3),
    })
    print(f"{model:24s} matched {len(gen):4d}", file=sys.stderr)
json.dump(out, open(out_path, "w"))


# ── API runs (measure/generate-api.ts) ──
# Each API run answered held-out Graphite topics (fnv(url) % 2 == 1) with the same title and target length as the
# human article. Per model, against exactly those human articles, this writes:
#   top / under  phrases of 1-3 words the model over-uses (or people do), with raw counts on both sides
#   lexicon      the checker's phrase list for that model (strong, common, significant)
#   tells        each registry tell's strongest linked term, as in graphite.json, marked via "shibbo"
#   log2ratio    every Graphite term (as for local runs), for comparison with Graphite's table
# The test is a paired sign test over topics (model article vs. its human twin, rate per token), Benjamini-Hochberg.
# Thresholds scale Graphite's to a few hundred articles; see API_CFG.
MIN_API = 100
LEX_STOP = set("a an the and or but of to in on at for with by from as is are was were be been being it its it's this that these those there here i you he she we they me him her us them my your his our their not no so if then than too very can could will would shall should may might must do does did done have has had having just also only into over out up down about more most such what which who whom whose when where why how all any each both few other some own same".split())
API_CFG = dict(q=0.01, top_ratio=4, top_docs=15, under_docs=30, lex_ratio=8, lex_docs=20,
               tell_ratio=2, tell_docs=10, tell_q=0.05, max_top5=0.5, echo_topics=5, echo_lift=10, cand_docs=10, frag=0.8)


def api_meta():
    import yaml
    by_run = {}
    for m in (yaml.safe_load(open(os.path.join(root, "measure", "api-models.yaml"))) or []):
        by_run[f"api-{m['id']}"] = {"id": m["id"], "name": m["name"], "family": m["family"], "released": str(m["released"]), "verified": False, "api": m.get("api", "")}
    reg = yaml.safe_load(open(os.path.join(root, "data", "models.yaml")))
    fams = reg.get("families", {})
    for m in reg["models"]:
        if m.get("source") == "shibbo-api":
            run = m.get("run", f"api-{m['id']}")
            by_run[run] = {**by_run.get(run, {}), **{k: (str(v) if k == "released" else v) for k, v in m.items() if k in ("id", "name", "family", "released", "verified", "api")}}
    for v in by_run.values():
        v["lab"] = fams.get(v.get("family"), {}).get("maker", "")
    return by_run


def binom_two_sided(k, n):
    """Exact two-sided sign test p-value for k of n."""
    if n == 0:
        return 1.0
    k = min(k, n - k)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def bh(ps):
    n = len(ps)
    order = sorted(range(n), key=lambda i: ps[i])
    q = [1.0] * n
    run = 1.0
    for rank in range(n, 0, -1):
        i = order[rank - 1]
        run = min(run, ps[i] * n / rank)
        q[i] = min(run, 1.0)
    return q


def readable(t):
    return not any((len(x) == 1 and x not in ("a", "i")) or x.isdigit() for x in t.split())


def doc_counts(text, long_terms):
    """Per-article counts of every 1-3-gram plus the long terms and frames (`_` = any one token)."""
    from collections import Counter
    c = Counter()
    n_tok = 0
    for toks in segments(text):
        n = len(toks)
        n_tok += n
        for i in range(n):
            g = toks[i]
            c[g] += 1
            if i + 1 < n:
                g2 = g + " " + toks[i + 1]
                c[g2] += 1
                if i + 2 < n:
                    c[g2 + " " + toks[i + 2]] += 1
            for parts, term in long_terms.get(toks[i], ()):
                k = len(parts)
                if i + k <= n and all(p == "_" or p == toks[i + j] for j, p in enumerate(parts)):
                    c[term] += 1
    return c, n_tok


def measure_api(api_out):
    from collections import Counter, defaultdict
    import yaml
    meta = api_meta()
    # A bridge run (a model Graphite also measured, under shibbo's prompt) feeds only the arena (scripts/arena.ts):
    # here it would clash with Graphite's entry of the same id.
    graphite_ids = {m["id"] for m in yaml.safe_load(open(os.path.join(root, "data", "models.yaml")))["models"] if m.get("graphite")}
    runs = {}
    for f in sorted(glob.glob(os.path.join(root, "measure", "runs", "api-*", "matched.jsonl"))):
        run = os.path.basename(os.path.dirname(f))
        if meta.get(run, {}).get("id", run[4:]) in graphite_ids:
            print(f"skip {run}: bridge run of a Graphite model (arena only)", file=sys.stderr)
            continue
        rows = [json.loads(l) for l in open(f) if l.strip()]
        rows = [r for r in rows if r.get("stop_reason") in ("end_turn", "max_tokens", "stop", "length") and r.get("text")]
        if len(rows) < MIN_API:
            print(f"skip {run}: {len(rows)} articles (needs {MIN_API})", file=sys.stderr)
            continue
        done = sorted(glob.glob(os.path.join(os.path.dirname(f), "*.done.json")))
        date = None
        if done:
            try:
                date = (json.load(open(done[-1])).get("ended_at") or "")[:10] or None
            except Exception:
                date = None
        if not date:
            import datetime
            date = datetime.date.fromtimestamp(os.path.getmtime(f)).isoformat()
        runs[run] = (rows, date)
    if not runs:
        json.dump({"models": []}, open(api_out, "w"))
        return
    need = {r["topic"] for rows, _ in runs.values() for r in rows}
    human, seen = {}, Counter()
    with gzip.open(articles, "rt") as fh:
        for line in fh:
            d = json.loads(line)
            t = d.get("human") or ""
            for l in {x.strip() for x in t.split("\n")}:
                if len(l) >= 15:
                    seen[l] += 1
            if d["url"] in need:
                human[d["url"]] = t
    rep = frozenset(l for l, n in seen.items() if n >= 3)  # lines on 3+ human pages: banners, nav (as dense_count.py)

    gterms = load_terms(graphite_csv, tells_yaml)
    gcount = make_counter(gterms)
    reg_tells = []
    for p in [tells_yaml, *glob.glob(os.path.join(os.path.dirname(tells_yaml), "tells.d", "*.yaml"))]:
        for t in yaml.safe_load(open(p)) or []:
            ms_ = (t.get("measure") or {})
            terms = [*(ms_.get("graphite") or []), *(ms_.get("graphite_absent") or [])]
            if terms:
                reg_tells.append((t["id"], terms, bool(ms_.get("graphite_absent"))))
    long_terms = defaultdict(list)
    for _, terms, _ in reg_tells:
        for term in terms:
            parts = tuple(term.split())
            if ("_" in parts or len(parts) > 3) and parts[0] != "_":
                long_terms[parts[0]].append((parts, term))

    out = {"source": {"title": "shibbo's own runs through maker APIs and OpenRouter on Graphite topics", "url": "https://github.com/xvr2e7/shibbo/tree/main/measure", "license": "derived rates"},
           "design": "Each model wrote an article with the same title and target length as one held-out human article from Graphite's topics (measure/generate-api.ts), compared with exactly those human articles. A few hundred articles per model, against Graphite's 9,974.",
           "method": {**API_CFG, "test": "paired sign test over topics (rate per token), Benjamini-Hochberg", "min_articles": MIN_API},
           "models": []}
    for run, (rows, date) in sorted(runs.items()):
        rows = [r for r in rows if human.get(r["topic"])]
        m = meta.get(run, {"id": run[4:], "name": rows[0]["model"], "family": "other", "released": "", "verified": False, "lab": ""})
        gen = [clean(strip_title(r["text"], r.get("title", ""))) for r in rows]
        hum = [clean(human[r["topic"]], rep) for r in rows]
        N = len(rows)
        pm = [doc_counts(t, long_terms) for t in gen]
        ph = [doc_counts(t, long_terms) for t in hum]
        cm, ch, dm, dh = Counter(), Counter(), Counter(), Counter()
        for c, _ in pm:
            cm.update(c); dm.update(c.keys())
        for c, _ in ph:
            ch.update(c); dh.update(c.keys())
        def positions(texts):
            p = Counter()
            for t in texts:
                for toks in segments(t):
                    for k in range(1, 8):
                        p[k] += max(0, len(toks) - k + 1)
            return p
        posm, posh = positions(gen), positions(hum)

        def l2(t):
            k = min(len(t.split()), 7)
            a, b = cm.get(t, 0), ch.get(t, 0)
            return math.log2(((a or 0.5) / max(posm[k], 1)) / ((b or 0.5) / max(posh[k], 1)))

        cand = [t for t in set(dm) | set(dh) if max(dm.get(t, 0), dh.get(t, 0)) >= API_CFG["cand_docs"] and abs(l2(t)) >= 1]
        ps = []
        for t in cand:
            up = down = 0
            for (a, la), (b, lb) in zip(pm, ph):
                ra, rb = a.get(t, 0) / max(la, 1), b.get(t, 0) / max(lb, 1)
                if ra > rb: up += 1
                elif rb > ra: down += 1
            ps.append(binom_two_sided(up, up + down))
        Q = dict(zip(cand, bh(ps)))

        def top5(t, side):
            v = sorted((c.get(t, 0) for c, _ in (pm if side == "m" else ph)), reverse=True)
            s = sum(v)
            return sum(v[:5]) / s if s else 1

        def echo(t):
            """Model phrase found mainly on topics where the human page used it too: content, not style."""
            shared = sum(1 for (a, _), (b, _) in zip(pm, ph) if a.get(t) and b.get(t))
            if shared < API_CFG["echo_topics"] or not dh.get(t):
                return False
            return (shared / dh[t]) / max(dm[t] / N, 1e-9) >= API_CFG["echo_lift"]

        def entry(t, over):
            r = 2 ** l2(t)
            a, b = cm.get(t, 0), ch.get(t, 0)
            e = {"term": t, "kind": "frame" if "_" in t.split() else "ngram", "ratio": round(r, 1 if r >= 1 else 4), "articles": dm.get(t, 0) if over else dh.get(t, 0), "count": a, "human_count": b, "human_articles": dh.get(t, 0)}
            if (over and b == 0) or (not over and a == 0):
                e["floor"] = True
                if not over:
                    e["count"] = b  # LexEntry: count is the side that used it
                    e["model_count"] = a
            return e

        score = lambda t: math.log(min(2 ** l2(t), 500)) * math.log(max(dm.get(t, 0), 1))
        over = [t for t in cand if "_" not in t and readable(t) and Q[t] < API_CFG["q"] and l2(t) >= math.log2(API_CFG["top_ratio"]) and dm.get(t, 0) >= API_CFG["top_docs"] and top5(t, "m") <= API_CFG["max_top5"] and not echo(t)]
        over.sort(key=lambda t: -score(t))
        keep = []
        for t in over:  # drop a fragment when a longer kept phrase holds most of its uses
            if any(len(s) > len(t) and f" {t} " in f" {s} " and cm[s] >= API_CFG["frag"] * cm[t] for s in over[:200] if s != t):
                continue
            keep.append(t)
        under = [t for t in cand if "_" not in t and readable(t) and Q[t] < API_CFG["q"] and l2(t) <= -math.log2(API_CFG["top_ratio"]) and dh.get(t, 0) >= API_CFG["under_docs"] and top5(t, "h") <= API_CFG["max_top5"]]
        under.sort(key=lambda t: (l2(t), -dh.get(t, 0)))
        # The checker's list stays strict at this size: phrases of two or more words with at least one content word
        # (single words such as "limits" and pairs such as "so a" misfire on everyday prose).
        lex = [t for t in over if 2 ** l2(t) >= API_CFG["lex_ratio"] and dm[t] >= API_CFG["lex_docs"] and " " in t and any(w not in LEX_STOP for w in t.split())]
        n_tells = sum(1 for t in cand if "_" not in t and l2(t) >= 1 and dm.get(t, 0) >= API_CFG["tell_docs"] and Q[t] < API_CFG["tell_q"])

        tells_out = {}
        for tid, terms, absent in reg_tells:
            cands = [x for x in terms if cm.get(x, 0) + ch.get(x, 0) >= 5]
            if not cands:
                continue
            pick = sorted(cands, key=lambda x: l2(x) if absent else -l2(x))[0]
            r = 2 ** l2(pick)
            q = Q.get(pick)
            if q is None:  # rare term outside the candidate set: test it on its own
                up = sum(1 for (a, la), (b, lb) in zip(pm, ph) if a.get(pick, 0) / max(la, 1) > b.get(pick, 0) / max(lb, 1))
                dn = sum(1 for (a, la), (b, lb) in zip(pm, ph) if a.get(pick, 0) / max(la, 1) < b.get(pick, 0) / max(lb, 1))
                q = binom_two_sided(up, up + dn)
            tells_out[tid] = {"ratio": round(r, 4 if r < 1 else 2), "rate": None, "human": None, "term": pick, "articles": dm.get(pick, 0),
                              "counts": {"model": cm.get(pick, 0), "human": ch.get(pick, 0)}, **({"floor": True} if not cm.get(pick) or not ch.get(pick) else {}),
                              "significant": bool(q < 0.01), "via": "shibbo",
                              "terms": [{"term": x, "ratio": round(2 ** l2(x), 4) if cm.get(x, 0) + ch.get(x, 0) >= 5 else None} for x in terms]}
        rec = {
            "id": m["id"], "name": m["name"], "family": m["family"], "lab": m.get("lab", ""), "released": m.get("released", ""), "verified": m.get("verified", False),
            "run": run, "api": m.get("api", rows[0]["model"]), "date": date, "docs": N, "human_docs": N,
            "words": sum(l for _, l in pm), "human_words": sum(l for _, l in ph),
            "style": style(gen), "human_style": style(hum),
            "tells_count": n_tells, "top": [entry(t, True) for t in keep[:60]], "under": [entry(t, False) for t in under[:30]],
            "lexicon": [{k: v for k, v in entry(t, True).items() if k in ("term", "kind", "ratio", "articles", "floor", "count")} for t in lex[:400]],
            "tells": tells_out,
            "log2ratio": log2ratios(gterms, gcount(gen), gcount(hum), min_total=3),
        }
        out["models"].append(rec)
        print(f"{run:24s} {N:4d} articles, {len(cand):6d} tested, top {len(keep):3d}, lexicon {len(lex):3d}, tells>=2x {n_tells}", file=sys.stderr)
        for e in rec["top"][:8]:
            print(f"    {e['term']!r:40s} {e['count']:4d} vs {e['human_count']:3d}  ({e['articles']} articles)", file=sys.stderr)
    json.dump(out, open(api_out, "w"))


measure_api(sys.argv[5] if len(sys.argv) > 5 else os.path.join(os.path.dirname(os.path.abspath(out_path)), "api.json"))

