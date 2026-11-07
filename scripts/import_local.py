"""Measure local runs (measure/runs/local-*/matched.jsonl) against the human articles of the same topics.

    uv run --with pandas python -I scripts/import_local.py <ai_tells_articles.jsonl.gz> <graphite tells csv.gz> <tells.yaml> <out.json>

Each local run answered the same title, at the same length, as a human article from Graphite's held-out topics
(measure/generate-local.ts). This compares each model with exactly those human articles. Texts stay local;
only derived rates are written. Models and their labs/release months come from measure/local-models.yaml.
"""
import glob, gzip, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # explicit: shared counting module
from tellcount import load_terms, make_counter, log2ratios, style  # noqa: E402

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
out = {"source": {"title": "Local runs by shibbo on Graphite topics (open-weight models via Ollama)", "url": "https://github.com/", "license": "derived rates"},
       "design": "Each model wrote an article with the same title and target length as one held-out human article from Graphite's topics, compared with exactly those human articles.",
       "models": []}
for model, rows in sorted(runs.items()):
    hum = [human[r["topic"]] for r in rows if human.get(r["topic"])]
    gen = [r["text"] for r in rows if human.get(r["topic"])]
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
