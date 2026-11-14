"""Place one-shot pages, their design tokens and the models that made them in one plane: the interface atlas.

    uv run --with numpy --with pillow --with pyyaml python -I scripts/ui_map.py [--features F] [--out DIR] [--no-images]
      reads  measure/ui-features.json (node measure/ui-features.mjs)
      writes data/measured/ui-map.json, web/src/data/ui-map.json, web/public/ui-atlas/{sprite.webp, <route>__<model>__<brief>.webp and .html}
      (--out writes ui-map.json to DIR only, for trial runs)

Two routes, kept apart. "api": bare API requests, the main, like-for-like set. "cli": Claude models through the
Claude Code CLI, whose system prompt wraps every request. The map is built from the API set; the CLI set is a
comparison layer placed in the same plane. Until the API set holds 3+ models with 6+ pages each, the CLI set
stands in as the main set, and the JSON says so ("primary").

Method (the same correspondence analysis, CA, as the prose atlas in scripts/dense_map.py):
  table     model x token counts for the main set: how many of a model's pages show each token. Every model answers
            the same briefs, so brief effects cancel out of the model rows, and what separates models is their own
            habits. Tokens in fewer than 3 main-set pages, or in all but 2, stay out of the layout.
  layout    CA of that table. Models and tokens take principal coordinates (a symmetric map). Each page, and each
            model of the comparison set, is a supplementary row: its token profile times the token standard
            coordinates. So a model sits at the average of its own pages, and a page sits toward the tokens it uses.
            The x axis is turned so the earliest release of the largest family sits left.
  owns      within the main set, a model owns a token when it shows in 4+ of its pages, in at least twice the share
            of the other models' pages and 25 points more, with a one-sided Fisher exact test p < 0.05 (not adjusted
            for the number of tokens; read owned tokens as leads, not proof).
  drift     per family with 4+ released models: share of each token in the first third of releases against the
            last third, and Spearman's rho of share against release order.
  wrapper   for each model in both sets: the distance between its two points in the plane, the mean absolute change
            in token share over the layout tokens, and the tokens that moved most. Pooled over models, the mean
            change per token and how many models moved the same way.
"""
import glob, json, math, os, re, shutil, sys
from datetime import date

import numpy as np
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
FEAT = json.load(open(opt("--features", f"{ROOT}/measure/ui-features.json")))
OUT_DIR = opt("--out")
IMAGES = "--no-images" not in args and not OUT_DIR
pages = [p for p in FEAT["pages"] if p["tokens"]]
# Drop trial sets (a few pages from a pilot run): too few to place a model.
MIN_PAGES = 10
_n = {}
for p in pages:
    _n[(p["route"], p["model"])] = _n.get((p["route"], p["model"]), 0) + 1
pages = [p for p in pages if _n[(p["route"], p["model"])] >= MIN_PAGES]
# Models whose pages are mostly broken, so they show breakage, not design choices. LFM3 (about 2B) cut off or
# skipped the page on many briefs and alone stretched the first axis.
SKIP = {"lfm-3-1.7b"}
pages = [p for p in pages if p["model"].split("/")[-1] not in SKIP]
for p in pages:
    p.setdefault("route", "cli")
MIN_PAGES = 3
TRUNCATED = ("max_tokens", "length")  # a reply cut off at the token limit holds half a page; ui-features.mjs skips it
ROUTE_NAME = {"api": "API, no system prompt", "cli": "via Claude Code"}

# ── release dates, from the chronology files, with the line they came from ──
def releases():
    out = {}
    for rel in ("data/chronology-releases.yaml", "data/chronology.yaml"):
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


# Dated API snapshots, mapped to the release they serve.
SNAPSHOT = {"deepseek-v4-pro-0813": "deepseek-v4-pro-ga", "qwen3.8-max-0902": "qwen3-8-max", "lfm-3-1.7b": "lfm3"}


def release(mid):
    if (s := SNAPSHOT.get(mid.split("/")[-1])) and s in REL:
        return REL[s]
    return release_by_id(mid) or next((r for r in REL.values() if re.search(rf"(^|\s){re.escape(pretty(mid))}(\s|$)", r.get("name", ""))), {})


def release_by_id(mid):
    """Match by id; else drop trailing qualifiers (pro, preview, a95b, a lone 0), never a version number."""
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
    for f, pat in (("claude", r"^claude"), ("gpt", r"^(gpt|o\d|openai)"), ("gemini", r"^(gemini|gemma|google)"), ("meta", r"llama|muse"), ("xai", r"grok"), ("mistral", r"mistral"), ("qwen", r"qwen"), ("deepseek", r"deepseek"), ("moonshot", r"kimi|moonshot"), ("zhipu", r"glm|zhipu"), ("minimax", r"minimax"), ("xiaomi", r"mimo"), ("nvidia", r"nemotron"), ("liquid", r"lfm")):
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
    special = {"glm": "GLM", "deepseek": "DeepSeek", "kimi": "Kimi", "qwen": "Qwen"}
    out = []
    for x in parts:
        m = re.match(r"([a-z]+)([\d.]*)$", x)
        if m and m.group(1) in special:
            out.append(special[m.group(1)] + m.group(2))
        elif re.match(r"^v?\d", x) or re.match(r"^[a-z]\d", x):
            out.append(x.upper())
        else:
            out.append(x.capitalize())
    return " ".join(out)


# ── models: one entry per (route, model) ──
mkeys = sorted({(p["route"], p["model"]) for p in pages})
models = []
for route, m in mkeys:
    r = release(m)
    nm = re.sub(r"\s*\(.*?\)", "", r["name"]) if r.get("name") and " and " not in r["name"] and key(r["name"].replace(" ", "-")).startswith(key(m).split("-")[0][:4]) else pretty(m)
    root_dir = "ui-runs-api" if route == "api" else "ui-runs"
    runs = [json.load(open(f)) for f in glob.glob(f"{ROOT}/measure/{root_dir}/**/run.json", recursive=True)]
    runs = [x for x in runs if re.sub(r"-\d{8}$", "", str(x.get("model", "")).split("/")[-1]) == m]
    models.append({"id": m, "route": route, "name": nm, "family": family(m), "released": r.get("date"), "date_source": r.get("line"), "date_url": r.get("url"),
                   "pages": sum(p["model"] == m and p["route"] == route for p in pages), "runs": len(runs), "failed": sum(1 for x in runs if not x.get("ok") or x.get("mismatch") or x.get("stop") in TRUNCATED),
                   "truncated": sum(1 for x in runs if x.get("ok") and not x.get("mismatch") and x.get("stop") in TRUNCATED),
                   "repaired": sum(1 for p in pages if p["model"] == m and p["route"] == route and p.get("repaired"))})
models.sort(key=lambda m: (m["route"], m["released"] or "9999", m["id"]))
midx = {(m["route"], m["id"]): i for i, m in enumerate(models)}
NM = len(models)
api_ok = [m for m in models if m["route"] == "api" and m["pages"] >= 6]
primary = "api" if len(api_ok) >= 3 else "cli"
# Models with fewer than 6 pages (a batch just starting) stay out of the layout and get placed like the others.
PRI = [i for i, m in enumerate(models) if m["route"] == primary and m["pages"] >= 6]
SEC = [i for i, m in enumerate(models) if m["route"] != primary]
if len(PRI) < 3:
    sys.exit(f"need pages from 3+ models in one route for a map, have {len(PRI)}")

# ── tokens ──
vocab = sorted({t for p in pages for t in p["tokens"]})
tix = {t: j for j, t in enumerate(vocab)}
X = np.zeros((len(pages), len(vocab)))
for i, p in enumerate(pages):
    for t in p["tokens"]:
        X[i, tix[t]] = 1
pmodel = np.array([midx[(p["route"], p["model"])] for p in pages])
ppri = np.isin(pmodel, PRI)
npg_pri = X[ppri].sum(0)
npg = X.sum(0)
active = np.flatnonzero((npg_pri >= MIN_PAGES) & (npg_pri <= ppri.sum() - 2))
M = np.zeros((NM, len(vocab)))
for i in range(len(pages)):
    M[pmodel[i]] += X[i]
size = np.array([max(m["pages"], 1) for m in models], float)
share = M / size[:, None]

# ── correspondence analysis on the main set's model x token table ──
F = M[np.ix_(PRI, active)]
P = F / F.sum()
r, c = P.sum(1), P.sum(0)
S = (P - np.outer(r, c)) / np.sqrt(np.outer(r, c))
U, sv, Vt = np.linalg.svd(S, full_matrices=False)
ev = sv ** 2
explained = ev[:2] / ev.sum()
Gs = Vt[:2].T / np.sqrt(c)[:, None]  # tokens, standard
Gp = Gs * sv[:2]  # tokens, principal
rowprof = lambda A: A / np.maximum(A.sum(1, keepdims=True), 1e-12)
Fall = rowprof(M[:, active]) @ Gs  # every model (main set active, comparison set supplementary), principal
Fpri = (U[:, :2] * sv[:2]) / np.sqrt(r)[:, None]
assert np.allclose(Fall[PRI], Fpri, atol=1e-8), "supplementary placement must reproduce the active model rows"
Fp = rowprof(X[:, active]) @ Gs  # pages

# Turn the plane: in the largest family of the main set, the earliest release sits left.
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

# ── who owns what (main set) ──
def fisher_greater(a, b, c_, d):
    """One-sided Fisher exact p: P(X >= a) for the 2x2 table [[a, b], [c_, d]]."""
    n1, n2, k = a + b, c_ + d, a + c_
    return sum(math.comb(n1, x) * math.comb(n2, k - x) for x in range(a, min(n1, k) + 1)) / math.comb(n1 + n2, k)


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

# ── drift across release order, per family (main set) ──
def spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    if np.std(ra) == 0 or np.std(rb) == 0:
        return 0.0
    return float(np.corrcoef(ra, rb)[0, 1])


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
    drift[f] = {"early": [models[i]["id"] for i in early], "late": [models[i]["id"] for i in late], "tokens": rows[:40]}

# ── the wrapper: the same model through the API and through Claude Code ──
xy = place(Fall)
pairs = []
for i in range(NM):
    if models[i]["route"] != "api":
        continue
    j = midx.get(("cli", models[i]["id"]))
    if j is None:
        continue
    # Compare on the briefs both routes answered, so a half-finished batch doesn't skew the shares.
    bi = {pages[k]["brief"]: k for k in np.flatnonzero(pmodel == i)}
    bj = {pages[k]["brief"]: k for k in np.flatnonzero(pmodel == j)}
    common = sorted(set(bi) & set(bj))
    if len(common) < 6:
        continue
    sa = X[[bi[b] for b in common]][:, active].mean(0)
    sc = X[[bj[b] for b in common]][:, active].mean(0)
    pa, pc = rowprof(X[[bi[b] for b in common]][:, active].sum(0, keepdims=True)) @ Gs, rowprof(X[[bj[b] for b in common]][:, active].sum(0, keepdims=True)) @ Gs
    d = sc - sa
    top = np.argsort(-np.abs(d))[:8]
    pairs.append({"model": models[i]["id"], "api": i, "cli": j, "briefs": len(common), "distance": round(float(np.hypot(*((pa - pc)[0] * flip * scale))), 2),
                  "mean_change": round(float(np.abs(d).mean()), 3), "sa": sa, "sc": sc,
                  "moved": [{"token": vocab[active[k]], "api": round(float(sa[k]), 3), "cli": round(float(sc[k]), 3)} for k in top]})
wrapper = None
if pairs:
    D = np.array([p["sc"] - p["sa"] for p in pairs])
    SA, SC = np.array([p["sa"] for p in pairs]), np.array([p["sc"] for p in pairs])
    md = D.mean(0)
    order = np.argsort(-np.abs(md))[:16]
    between = [float(np.hypot(*(xy[a] - xy[b]))) for a in [p["api"] for p in pairs] for b in [p["api"] for p in pairs] if a < b]
    wrapper = {
        "models": len(pairs), "pairs": [{k: v for k, v in p.items() if k not in ("sa", "sc")} for p in pairs],
        "mean_distance": round(float(np.mean([p["distance"] for p in pairs])), 2),
        "mean_distance_between_api_models": round(float(np.mean(between)), 2) if between else None,
        "mean_change": round(float(np.mean([p["mean_change"] for p in pairs])), 3),
        "tokens": [{"token": vocab[active[k]], "api": round(float(SA[:, k].mean()), 3), "cli": round(float(SC[:, k].mean()), 3),
                    "same_way": int((np.sign(D[:, k]) == np.sign(md[k])).sum())} for k in order],
    }

# ── readable labels ──
GROUPS = {"font": "type", "heading": "type", "body": "type", "two-families": "type", "h1": "type", "h1-size": "type", "eyebrows": "type", "mono-labels": "type", "type-steps": "type",
          "ground": "colour", "accent": "colour", "hues": "colour", "gradient-fill": "colour", "gradient-text": "colour", "radial-glow": "colour", "dot-grid": "colour", "grain": "colour",
          "button-radius": "shape", "card-radius": "shape", "card-style": "shape", "shadows": "shape", "glow": "shape", "backdrop-blur": "shape",
          "hero": "layout", "hero-badge": "layout", "cards": "layout", "row-of-3": "layout", "row-of-4": "layout", "bento": "layout", "nav": "layout", "sections": "layout", "length": "layout", "max-width": "layout", "emoji": "layout", "icon-tiles": "layout", "big-stats": "layout",
          "transitions": "motion", "keyframes": "motion", "scroll-reveal": "motion", "hover-lift": "motion", "reduced-motion": "motion", "mobile": "mobile", "tell": "tell"}
FIXED = {"two-families": "two typefaces", "mono-labels": "mono labels", "gradient-fill": "gradient fills", "gradient-text": "gradient text", "radial-glow": "radial glow", "dot-grid": "dot grid", "grain": "grain overlay",
         "shadows": "drop shadows", "glow": "coloured glow", "backdrop-blur": "backdrop blur", "hero-badge": "badge over the headline", "row-of-3": "rows of three", "row-of-4": "rows of four", "bento": "bento grid",
         "nav:sticky": "sticky nav", "emoji": "emoji", "icon-tiles": "icon tiles", "big-stats": "big numbers", "transitions": "transitions", "keyframes": "keyframe animation", "scroll-reveal": "scroll reveal",
         "hover-lift": "lift on hover", "reduced-motion": "reduced-motion rule", "mobile:overflow": "sideways scroll on phones", "mobile:menu-button": "menu button on phones", "mobile:small-text": "small text on phones",
         "h1:tight-tracking": "tight headline tracking", "h1:italic-accent": "italic word in headline", "h1:serif-accent": "serif word in headline", "h1:colour-accent": "coloured word in headline",
         "hero:centred": "centred hero", "hero:left": "left-aligned hero", "hero:split": "split hero", "eyebrows:none": "no eyebrow labels"}
TELL_NAMES = {}
for f in [f"{ROOT}/data/tells.yaml", *glob.glob(f"{ROOT}/data/tells.d/*.yaml")]:
    for t in yaml.safe_load(open(f)) or []:
        TELL_NAMES[t["id"]] = t.get("name", t["id"])


def label(t):
    if t in FIXED:
        return FIXED[t]
    k, _, v = t.partition(":")
    v_ = v.replace("-plus", "+").replace("-or-fewer", " or fewer").replace("-", "–") if k not in ("font", "tell") else v
    corner = lambda: "pill" if v == "pill" else "square" if v == "0" else v_ + " px"
    return {
        "font": v, "heading": f"{v} headings", "body": f"{v} body text", "h1": f"{v} headline", "h1-size": f"headline {v_} px", "eyebrows": f"{v_} eyebrow labels", "type-steps": f"{v_} type sizes",
        "ground": {"cream": "cream ground", "off-white": "off-white ground", "white": "pure white ground", "black": "pure black ground", "dark": "dark ground", "cool-tint": "cool-tinted ground", "tinted": "tinted ground", "mid": "mid-tone ground"}.get(v, f"{v} ground"),
        "accent": f"{v} accent" if v != "neutral" else "no colour accent", "hues": {"0": "no hues", "1": "one hue", "2": "two hues", "3-plus": "three or more hues"}.get(v, f"{v} hues"),
        "button-radius": f"{corner()} buttons", "card-radius": f"{corner()} cards",
        "card-style": {"shadow": "shadowed cards", "outline": "outlined cards", "fill": "filled cards"}.get(v, v), "cards": f"{'no' if v == '0' else v_} cards",
        "sections": f"{v_} sections", "length": v_.replace("–screens", " screens").replace("–screen", " screen"),
        "max-width": {"none": "no max width", "under-1100": "max width under 1100 px", "1100-1199": "max width 1100–1199 px", "1200": "1200 px max width", "over-1200": "max width over 1200 px"}.get(v, f"{v} px max width"),
        "tell": TELL_NAMES.get(v, v),
    }.get(k, t)


def group(t):
    return GROUPS.get(t.split(":")[0], GROUPS.get(t, "other"))


# ── thumbnails: one sprite for the map, one small view per page ──
TW, TH, COLS = 160, 100, 24
slug = lambda p: f"{p['route']}__{p['model'].replace('/', '_')}__{p['brief']}"
total = 0
if IMAGES:
    from PIL import Image
    OUT = f"{ROOT}/web/public/ui-atlas"
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    sheet = Image.new("RGB", (TW * COLS, TH * math.ceil(len(pages) / COLS)), (255, 255, 255))
    for i, p in enumerate(pages):
        try:
            sheet.paste(Image.open(f"{ROOT}/{p['thumb']}").convert("RGB").resize((TW, TH), Image.LANCZOS), ((i % COLS) * TW, (i // COLS) * TH))
        except OSError:
            pass
        if os.path.exists(f"{ROOT}/{p['view']}"):
            shutil.copy(f"{ROOT}/{p['view']}", f"{OUT}/{slug(p)}.webp")
        # The page itself, for the atlas's live view (drawn in a sandboxed frame).
        html = os.path.join(os.path.dirname(f"{ROOT}/{p['view']}"), "index.html")
        if os.path.exists(html):
            shutil.copy(html, f"{OUT}/{slug(p)}.html")
    sheet.save(f"{OUT}/sprite.webp", "WEBP", quality=72, method=6)
    total = sum(os.path.getsize(f) for f in glob.glob(f"{OUT}/*"))

# ── write ──
briefs = {b["id"]: b for b in yaml.safe_load(open(f"{ROOT}/measure/ui-briefs.yaml"))["briefs"]}
pos = {j: n for n, j in enumerate(active)}
gp = place(Gp)
fams = sorted({models[i]["family"] for i in PRI})
out = {
    "generated": date.today().isoformat(),
    "attribution": "Measured by shibbo from one-shot pages generated with measure/generate-ui.ts",
    "primary": primary,
    "routes": {r: {"name": ROUTE_NAME[r], "models": sum(m["route"] == r for m in models), "pages": sum(p["route"] == r for p in pages)} for r in ("api", "cli")},
    "method": {
        "features": "measure/ui-features.mjs: headless Chrome at 1440x900 and 390x844, thresholds documented at the top of the file",
        "layout": f"correspondence analysis of the {ROUTE_NAME[primary]} model x token table (symmetric map); pages and the other route's models placed as supplementary rows",
        "owns": "4+ of the model's pages, 2x and +25 points over the other models' share, one-sided Fisher p < 0.05 (unadjusted)",
        "drift": "per family with 4+ releases: token share in the first third of releases against the last third; Spearman rho of share against release order",
        "wrapper": "same model through the API and through Claude Code: distance between its two points, mean absolute change in token share, tokens that moved most",
        "min_pages": MIN_PAGES,
    },
    "explained": [round(float(e) * 100, 1) for e in explained],
    "limits": [
        *([f"Only Claude so far in the main set." if fams == ["claude"] else f"Makers in the main set: {', '.join(fams)}."]),
        *([] if primary == "api" else ["The bare-API pages are still arriving, so the map stands on the Claude Code pages for now; its system prompt wraps every request."]),
        "One page per brief and model, so a token in 4 of 24 pages may be chance; owned tokens are leads.",
        "No human-built baseline yet, so the map shows how models differ from each other, not from people.",
        "Tokens come from fixed thresholds on computed styles; a page can meet a rule in letter and miss it in spirit. Thresholds sit at the top of measure/ui-features.mjs.",
        "Pages render without network images, so photo-led designs read by what is left.",
        *([f"Replies cut off at the 32,000-token limit hold half a page, so shibbo drops them: " + ", ".join(f"{m['name']} {m['truncated']} of {m['runs']}" for m in models if m["truncated"]) + ". Out-of-tokens replies with no page at all count as failed too."] if any(m["truncated"] for m in models) else []),
        *([f"{sum(m['repaired'] for m in models)} replies came back JSON-escaped (literal \\n and quotes); shibbo measured an unescaped copy: " + ", ".join(f"{m['name']} {m['repaired']}" for m in models if m["repaired"]) + "."] if any(m["repaired"] for m in models) else []),
    ],
    "briefs": {k: {"kind": b["kind"], "brief": b["brief"]} for k, b in briefs.items()},
    "models": [{**m, "x": round(float(xy[i, 0]), 2), "y": round(float(xy[i, 1]), 2), "complete": m["runs"] >= len(briefs), "active": i in PRI, "owns": owns[i]} for i, m in enumerate(models)],
    "tokens": [
        {"id": t, "label": label(t), "group": group(t), "pages": int(npg_pri[j]),
         "x": round(float(gp[pos[j], 0]), 2) if j in pos else None, "y": round(float(gp[pos[j], 1]), 2) if j in pos else None,
         "share": [round(float(share[i, j]), 3) for i in range(NM)]}
        for j, t in enumerate(vocab)
    ],
    "pages": [
        {"model": int(pmodel[i]), "brief": p["brief"], "kind": p["kind"], "h1": p.get("h1"), "ground": p.get("ground"),
         "x": round(float(place(Fp)[i, 0]), 2), "y": round(float(place(Fp)[i, 1]), 2), "sprite": i, "t": sorted(tix[t] for t in p["tokens"]),
         "view": f"ui-atlas/{slug(p)}.webp"}
        for i, p in enumerate(pages)
    ],
    "sprite": {"src": "ui-atlas/sprite.webp", "w": TW, "h": TH, "cols": COLS},
    "drift": drift,
    "wrapper": wrapper,
}
for dest in ([f"{OUT_DIR}/ui-map.json"] if OUT_DIR else [f"{ROOT}/data/measured/ui-map.json", f"{ROOT}/web/src/data/ui-map.json"]):
    json.dump(out, open(dest, "w"), separators=(",", ":"))

pct = lambda v: f"{v * 100:.0f}%"
print(f"main set: {ROUTE_NAME[primary]}. {len(pages)} pages ({int(ppri.sum())} main), {NM} model entries, {len(vocab)} tokens ({len(active)} in the layout); axes 1-2 hold {explained[0] * 100:.1f}% + {explained[1] * 100:.1f}%", file=sys.stderr)
if IMAGES:
    print(f"thumbnails: {total / 1e6:.2f} MB in web/public/ui-atlas", file=sys.stderr)
for i, m in enumerate(models):
    print(f"  {m['route']} {m['id']:24s} {m['released'] or '?':10s} ({xy[i, 0]:6.1f},{xy[i, 1]:6.1f}) {m['pages']:2d} pages  owns: {', '.join(o['token'] + ' ' + str(o['pages']) + '/' + str(o['of']) + ' vs ' + pct(o['others']) for o in owns[i][:8])}", file=sys.stderr)
for f, d in drift.items():
    print(f"drift, {f} ({', '.join(d['early'])} -> {', '.join(d['late'])}):", file=sys.stderr)
    for x in d["tokens"][:14]:
        print(f"  {x['token']:32s} {pct(x['early'])} -> {pct(x['late'])}  rho {x['rho']}", file=sys.stderr)
if wrapper:
    print(f"wrapper: {wrapper['models']} models; mean distance {wrapper['mean_distance']} (between API models {wrapper['mean_distance_between_api_models']}); mean token-share change {pct(wrapper['mean_change'])}", file=sys.stderr)
    for x in wrapper["tokens"][:12]:
        print(f"  {x['token']:32s} api {pct(x['api'])} -> cli {pct(x['cli'])}  same way in {x['same_way']}/{wrapper['models']}", file=sys.stderr)
