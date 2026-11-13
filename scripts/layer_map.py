"""Shared method for the code and conduct atlases: the same correspondence analysis as the interface atlas
(scripts/ui_map.py), on a model x token table, with each reply or transcript placed as a supplementary point.

Called by scripts/code_map.py and scripts/conduct_map.py; not run on its own. The JSON it writes has the shape of
data/measured/ui-map.json, except that points carry a short text excerpt for the hover card instead of thumbnails
("sprite" is null, each point has "excerpt").

Method:
  table     model x token counts for the main route: how many of a model's points show each token. Every model gets
            the same briefs or tasks, so their mix cancels out of the model rows. Tokens in fewer than 3 main-route
            points, or in all but 2, stay out of the layout. Models with fewer than 6 points are placed, not used.
  layout    CA of that table (symmetric map). Each point, and each model of another route, is a supplementary row:
            its token profile times the token standard coordinates. The x axis is turned so the earliest release of
            the largest family sits left.
  owns      a model owns a token when it shows in 4+ of its points, in at least twice the share of the other models'
            points and 25 points more, with a one-sided Fisher exact test p < 0.05 (unadjusted; read as leads).
  drift     per family with 4+ released models: share of each token in the first third of releases against the
            last third, and Spearman's rho of share against release order.
"""
import glob, json, math, os, re, sys
from datetime import date

import numpy as np
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_PAGES = 3
MIN_MODEL_PAGES = 6


def releases():
    out = {}
    for rel in ("data/chronology-releases.yaml", "data/chronology.yaml"):
        if not os.path.exists(f"{ROOT}/{rel}"):
            continue
        lines = open(f"{ROOT}/{rel}").read().split("\n")
        for i, l in enumerate(lines):
            m = re.match(r"\s*- id: ([\w.-]+)\s*$", l)
            if not m or m.group(1) in out:
                continue
            rec = {"line": f"{rel}:{i + 1}"}
            for l2 in lines[i + 1:i + 25]:
                if re.match(r"\s*- id: ", l2):
                    break
                if (d := re.match(r'\s*date: "?([\d-]+)"?', l2)) and "date" not in rec:
                    rec["date"] = d.group(1)
                if (n := re.match(r'\s*name: "?([^"]+?)"?\s*$', l2)) and "name" not in rec:
                    rec["name"] = n.group(1)
                if (u := re.match(r'\s*url: "?([^"]+?)"?\s*$', l2)) and "url" not in rec:
                    rec["url"] = u.group(1)
            out[m.group(1)] = rec
    return out


REL = releases()
key = lambda mid: re.sub(r"-\d{8}$", "", mid.split("/")[-1]).replace(".", "-").lower()


def release_by_id(mid):
    parts = re.sub(r"-\d{8}$", "", mid.split("/")[-1]).lower().split("-")
    while parts:
        k = "-".join(parts).replace(".", "-")
        if k in REL:
            return REL[k]
        if len(parts) < 2 or (parts[-1].isdigit() and parts[-1] != "0"):
            return {}
        parts = parts[:-1]
    return {}


def family(mid):
    for f, pat in (("claude", r"^claude"), ("gpt", r"^(gpt|o\d|openai)"), ("gemini", r"^(gemini|gemma|google)"), ("meta", r"llama"), ("mistral", r"mistral"), ("qwen", r"qwen"), ("deepseek", r"deepseek"), ("moonshot", r"kimi|moonshot"), ("zhipu", r"glm|zhipu"), ("xai", r"grok")):
        if re.search(pat, mid.split("/")[-1]):
            return f
    return "other"


def pretty(mid):
    base = re.sub(r"-\d{8}$", "", mid.split("/")[-1])
    parts = base.split("-")
    if base.startswith("claude"):
        words = [x.capitalize() for x in parts if not x.isdigit()]
        nums = [x for x in parts if x.isdigit()]
        return f"{' '.join(words)} {'.'.join(nums)}".strip()
    if base.startswith("gpt"):
        return "GPT-" + parts[1] + "".join(" " + x.capitalize() for x in parts[2:])
    if base.startswith("glm"):
        return "GLM-" + "-".join(parts[1:])
    special = {"glm": "GLM", "deepseek": "DeepSeek", "kimi": "Kimi", "qwen": "Qwen", "grok": "Grok", "gemma": "Gemma", "gemini": "Gemini", "mistral": "Mistral"}
    out = []
    for x in parts:
        m = re.match(r"([a-z]+)([\d.]*)$", x)
        if m and m.group(1) in special:
            out.append(special[m.group(1)] + (" " + m.group(2) if m.group(2) and m.group(1) in ("grok", "gemma", "gemini") else m.group(2)))
        elif re.match(r"^v?\d", x) or re.match(r"^[a-z]\d", x):
            out.append(x.upper())
        else:
            out.append(x.capitalize())
    return " ".join(out)


def name_of(m):
    r = release_by_id(m)
    if r.get("name") and " and " not in r["name"] and key(r["name"].replace(" ", "-")).startswith(key(m).split("-")[0][:4]):
        return re.sub(r"\s*\(.*?\)", "", r["name"])
    return pretty(m)


def fisher_greater(a, b, c_, d):
    n1, n2, k = a + b, c_ + d, a + c_
    return sum(math.comb(n1, x) * math.comb(n2, k - x) for x in range(a, min(n1, k) + 1)) / math.comb(n1 + n2, k)


def spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    if np.std(ra) == 0 or np.std(rb) == 0:
        return 0.0
    return float(np.corrcoef(ra, rb)[0, 1])


TELL_NAMES = {}
for f in [f"{ROOT}/data/tells.yaml", *glob.glob(f"{ROOT}/data/tells.d/*.yaml")]:
    for t in yaml.safe_load(open(f)) or []:
        TELL_NAMES[t["id"]] = t.get("name", t["id"])


def build(*, layer, pages, primary, route_names, briefs, label, group, method, limits, attribution, model_stats=None, extra=None, out_name):
    """pages: [{route, model, brief, kind, tokens, excerpt, ...extra point fields}]."""
    pages = [p for p in pages if p["tokens"]]
    mkeys = sorted({(p["route"], p["model"]) for p in pages})
    models = []
    for route, m in mkeys:
        r = release_by_id(m)
        models.append({"id": m, "route": route, "name": name_of(m), "family": family(m), "released": r.get("date"), "date_source": r.get("line"), "date_url": r.get("url"),
                       "pages": sum(p["model"] == m and p["route"] == route for p in pages), **((model_stats or {}).get((route, m), {}))})
    models.sort(key=lambda m: (m["route"] != primary, m["released"] or "9999", m["id"]))
    midx = {(m["route"], m["id"]): i for i, m in enumerate(models)}
    NM = len(models)
    PRI = [i for i, m in enumerate(models) if m["route"] == primary and m["pages"] >= MIN_MODEL_PAGES]
    if len(PRI) < 3:
        sys.exit(f"need {MIN_MODEL_PAGES}+ points from 3+ models in route {primary} for a map, have {len(PRI)}")

    vocab = sorted({t for p in pages for t in p["tokens"]})
    tix = {t: j for j, t in enumerate(vocab)}
    X = np.zeros((len(pages), len(vocab)))
    for i, p in enumerate(pages):
        for t in p["tokens"]:
            X[i, tix[t]] = 1
    pmodel = np.array([midx[(p["route"], p["model"])] for p in pages])
    ppri = np.isin(pmodel, PRI)
    npg_pri = X[ppri].sum(0)
    active = np.flatnonzero((npg_pri >= MIN_PAGES) & (npg_pri <= ppri.sum() - 2))
    M = np.zeros((NM, len(vocab)))
    for i in range(len(pages)):
        M[pmodel[i]] += X[i]
    size = np.array([max(m["pages"], 1) for m in models], float)
    share = M / size[:, None]

    F = M[np.ix_(PRI, active)]
    P = F / F.sum()
    r, c = P.sum(1), P.sum(0)
    S = (P - np.outer(r, c)) / np.sqrt(np.outer(r, c))
    U, sv, Vt = np.linalg.svd(S, full_matrices=False)
    ev = sv ** 2
    explained = ev[:2] / ev.sum()
    Gs = Vt[:2].T / np.sqrt(c)[:, None]
    Gp = Gs * sv[:2]
    rowprof = lambda A: A / np.maximum(A.sum(1, keepdims=True), 1e-12)
    Fall = rowprof(M[:, active]) @ Gs
    Fpri = (U[:, :2] * sv[:2]) / np.sqrt(r)[:, None]
    assert np.allclose(Fall[PRI], Fpri, atol=1e-8), "supplementary placement must reproduce the active model rows"
    Fp = rowprof(X[:, active]) @ Gs

    fam_count = {}
    for i in PRI:
        fam_count[models[i]["family"]] = fam_count.get(models[i]["family"], 0) + 1
    big = max(fam_count, key=fam_count.get)
    seq = sorted([i for i in PRI if models[i]["family"] == big and models[i]["released"]], key=lambda i: models[i]["released"])
    flip = np.array([1.0, 1.0])
    if len(seq) >= 3:
        rk = np.arange(len(seq))
        if np.corrcoef(rk, Fall[seq, 0])[0, 1] < 0:
            flip[0] = -1
        if np.corrcoef(rk, Fall[seq, 1])[0, 1] < 0:
            flip[1] = -1
    scale = 100 / max(np.abs(Fp[ppri]).max(), np.abs(Gp).max(), 1e-9)
    place = lambda a: a * flip * scale

    owns = {i: [] for i in range(NM)}
    tot_pri = M[PRI].sum(0)
    n_pri = size[PRI].sum()
    for j, t in enumerate(vocab):
        for i in PRI:
            k, n = int(M[i, j]), int(size[i])
            ko, no = int(tot_pri[j] - k), int(n_pri - n)
            if no == 0:
                continue
            so = ko / no
            if k >= 4 and share[i, j] >= 2 * so and share[i, j] - so >= 0.25:
                p = fisher_greater(k, n - k, ko, no - ko)
                if p < 0.05:
                    owns[i].append({"token": t, "pages": k, "of": n, "others": round(so, 3), "p": float(f"{p:.2g}")})
    for i in owns:
        owns[i].sort(key=lambda o: o["p"])

    drift = {}
    for f in fam_count:
        seq = sorted([i for i in PRI if models[i]["family"] == f and models[i]["released"]], key=lambda i: models[i]["released"])
        if len(seq) < 4:
            continue
        third = max(1, len(seq) // 3)
        early, late = seq[:third], seq[-third:]
        rows = []
        for j, t in enumerate(vocab):
            if npg_pri[j] < MIN_PAGES:
                continue
            e = M[early, j].sum() / size[early].sum()
            l = M[late, j].sum() / size[late].sum()
            rows.append({"token": t, "early": round(float(e), 3), "late": round(float(l), 3), "rho": round(spearman(np.arange(len(seq)), share[seq, j]), 2)})
        rows.sort(key=lambda d: -abs(d["late"] - d["early"]))
        drift[f] = {"order": [models[i]["id"] for i in seq], "early": [models[i]["id"] for i in early], "late": [models[i]["id"] for i in late], "tokens": rows[:40]}

    xy = place(Fall)
    pos = {j: n for n, j in enumerate(active)}
    gp = place(Gp)
    fp = place(Fp)
    fams = sorted({models[i]["family"] for i in PRI})
    out = {
        "generated": date.today().isoformat(),
        "layer": layer,
        "attribution": attribution,
        "primary": primary,
        "routes": {rt: {"name": nm, "models": sum(m["route"] == rt for m in models), "pages": sum(p["route"] == rt for p in pages)} for rt, nm in route_names.items()},
        "method": {**method, "layout": f"correspondence analysis of the {route_names[primary]} model x token table (symmetric map); points and other routes' models placed as supplementary rows",
                   "owns": "4+ of the model's points, 2x and +25 points over the other models' share, one-sided Fisher p < 0.05 (unadjusted)",
                   "drift": "per family with 4+ releases: token share in the first third of releases against the last third; Spearman rho of share against release order",
                   "min_pages": MIN_PAGES},
        "explained": [round(float(e) * 100, 1) for e in explained],
        "limits": [f"Makers in the main set: {', '.join(fams)}." if len(fams) > 1 else f"Only {fams[0].capitalize()} models in the main set.", *limits],
        "briefs": briefs,
        "models": [{**m, "x": round(float(xy[i, 0]), 2), "y": round(float(xy[i, 1]), 2), "complete": m["pages"] >= len(briefs), "active": i in PRI, "owns": owns[i]} for i, m in enumerate(models)],
        "tokens": [
            {"id": t, "label": label(t), "group": group(t), "pages": int(npg_pri[j]),
             "x": round(float(gp[pos[j], 0]), 2) if j in pos else None, "y": round(float(gp[pos[j], 1]), 2) if j in pos else None,
             "share": [round(float(share[i, j]), 3) for i in range(NM)]}
            for j, t in enumerate(vocab)
        ],
        "pages": [
            {"model": int(pmodel[i]), "brief": p["brief"], "kind": p["kind"], "x": round(float(fp[i, 0]), 2), "y": round(float(fp[i, 1]), 2), "t": sorted(tix[t] for t in p["tokens"]),
             **{k: v for k, v in p.items() if k not in ("route", "model", "brief", "kind", "tokens")}}
            for i, p in enumerate(pages)
        ],
        "sprite": None,
        "drift": drift,
        "wrapper": None,
        **(extra or {}),
    }
    for dest in (f"{ROOT}/data/measured/{out_name}",):
        json.dump(out, open(dest, "w"), separators=(",", ":"))

    pct = lambda v: f"{v * 100:.0f}%"
    print(f"{layer}: {len(pages)} points ({int(ppri.sum())} main), {NM} model entries, {len(vocab)} tokens ({len(active)} in the layout); axes 1-2 hold {explained[0] * 100:.1f}% + {explained[1] * 100:.1f}%", file=sys.stderr)
    for i, m in enumerate(models):
        print(f"  {m['route']:8s} {m['id']:26s} {m['released'] or '?':10s} ({xy[i, 0]:6.1f},{xy[i, 1]:6.1f}) {m['pages']:2d} pts  owns: {', '.join(o['token'] + ' ' + str(o['pages']) + '/' + str(o['of']) + ' vs ' + pct(o['others']) for o in owns[i][:8])}", file=sys.stderr)
    for f, d in drift.items():
        print(f"drift, {f} ({', '.join(d['early'])} -> {', '.join(d['late'])}):", file=sys.stderr)
        for x in d["tokens"][:14]:
            print(f"  {x['token']:32s} {pct(x['early'])} -> {pct(x['late'])}  rho {x['rho']}", file=sys.stderr)
    return out
