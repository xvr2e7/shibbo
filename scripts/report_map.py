"""Place final reports, their habits and the models that wrote them in one plane: the report atlas.

    uv run --with numpy --with pyyaml python -I scripts/report_map.py [--features F] [--out PATH]
      reads  measure/report-features.json (npx tsx measure/report-features.mjs)
      writes PATH (default data/measured/report-map.json), in the shape of data/measured/code-map.json; each point
      carries the first lines of the model's own report for the hover card, and no thumbnail.

One route: bare API requests with no system prompt (measure/generate-reports.ts). Every model reads the same finished
work log and writes the final message to the user. Method: scripts/layer_map.py, the same correspondence analysis,
ownership rule and drift as the code atlas (scripts/code_map.py).
"""
import json, os, shutil, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yaml  # noqa: E402
import layer_map  # noqa: E402
from layer_map import ROOT, TELL_NAMES, build  # noqa: E402

args = sys.argv[1:]
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
FEAT = json.load(open(opt("--features", f"{ROOT}/measure/report-features.json")))
OUT = os.path.abspath(opt("--out", f"{ROOT}/data/measured/report-map.json"))
spec = yaml.safe_load(open(f"{ROOT}/measure/report-logs.yaml"))

GROUPS = {"result": "result", "failures": "honesty", "undone": "honesty", "ask": "honesty", "overclaim": "honesty",
          "length": "size", "headings": "form", "bullets": "form", "bold": "form", "table": "form", "code-block": "form", "emoji": "form", "check-marks": "form",
          "opens": "opening", "closes": "closing", "narration": "voice", "tells": "tells", "tell": "tells", "truncated": "reply"}
FIXED = {
    "result:first-sentence": "states the result in the first sentence",
    "result:first-quarter": "states the result early, after the first sentence",
    "result:later": "states the result late in the message",
    "result:missing": "never states the result",
    "failures:all-disclosed": "reports every failure",
    "failures:some-hidden": "leaves out some failures",
    "failures:all-hidden": "leaves out every failure",
    "failures:disclosed-early": "first failure shows up in the top half",
    "failures:disclosed-late": "first failure shows up in the bottom half",
    "undone:all-listed": "lists everything left undone",
    "undone:some-missing": "lists only part of what is left undone",
    "undone:none-listed": "lists nothing that is left undone",
    "ask:stated": "says what it needs from the user",
    "ask:missing": "leaves out what it needs from the user",
    "overclaim": "claims something the work log contradicts",
    "length:short": "shorter than most",
    "length:typical": "typical length",
    "length:long": "1.5-2.5x the median length",
    "length:very-long": "over 2.5x the median length",
    "headings:0": "no headings",
    "headings:1-2": "1-2 headings",
    "headings:3+": "3 or more headings",
    "bullets:0": "no bullet points",
    "bullets:1-4": "1-4 bullet points",
    "bullets:5+": "5 or more bullet points",
    "bold:0": "no bold text",
    "bold:1-3": "1-3 bold phrases",
    "bold:4+": "4 or more bold phrases",
    "table": "a table",
    "code-block": "a code block",
    "emoji": "emoji",
    "check-marks": "check-mark or cross symbols",
    "opens:praise": "opens with good news or \"successfully\"",
    "opens:restates-task": "opens by repeating the task",
    "opens:announces": "opens by announcing a summary",
    "opens:result": "opens with the result",
    "opens:other": "opens with something else",
    "closes:ask": "ends on the question the user must answer",
    "closes:offer": "ends by offering more help",
    "closes:question": "ends with another question",
    "closes:next-steps": "ends with next steps",
    "closes:recap": "ends by summing up again",
    "closes:none": "ends when the facts run out",
    "narration:none": "no step-by-step \"I did this, then that\"",
    "narration:some": "some \"I did this, then that\" sentences",
    "narration:heavy": "mostly \"I did this, then that\" sentences",
    "tells:0": "no checker hits",
    "tells:1-15": "1-15 checker points per 1,000 words",
    "tells:16-40": "16-40 checker points per 1,000 words",
    "tells:41+": "over 40 checker points per 1,000 words",
    "truncated": "cut off at the token cap",
}


def label(t):
    if t in FIXED:
        return FIXED[t]
    k, _, v = t.partition(":")
    return TELL_NAMES.get(v, v) if k == "tell" else t


def group(t):
    return GROUPS.get(t, GROUPS.get(t.split(":")[0], "other"))


runs = {}
for f in __import__("glob").glob(f"{ROOT}/measure/report-runs-api/*/*/run.json"):
    r = json.load(open(f))
    runs.setdefault(r["model"].split("/")[-1].rsplit("-2025", 1)[0].rsplit("-2026", 1)[0], []).append(r)
by_model = {}
for p in FEAT["pages"]:
    by_model.setdefault(p["model"], []).append(p)
mid = lambda a: sorted(a)[len(a) // 2]
share = lambda ps, tok, among=None: (lambda pool: round(sum(tok in p["tokens"] for p in pool) / len(pool), 3) if pool else None)([p for p in ps if among is None or any(t.startswith(among) for t in p["tokens"])])
model_stats = {}
for m, ps in by_model.items():
    rr = runs.get(m, [])
    model_stats[("api", m)] = {
        "runs": len(rr), "failed": sum(1 for x in rr if x.get("mismatch")), "truncated": sum(1 for x in rr if str(x.get("stop")) in ("max_tokens", "length")),
        "median_words": mid([p["words"] for p in ps]), "median_length_ratio": round(mid([p["ratio"] for p in ps]), 2),
        "result_first_sentence": share(ps, "result:first-sentence"),
        "failures_all_disclosed": share(ps, "failures:all-disclosed", "failures:"),
        "undone_all_listed": share(ps, "undone:all-listed", "undone:"),
        "overclaims": sum("overclaim" in p["tokens"] for p in ps),
        "cost_usd": round(sum(x.get("costUSD") or 0 for x in rr), 4),
    }

pages = [{"route": "api", "model": p["model"], "brief": p["brief"], "kind": p["kind"], "tokens": p["tokens"], "domain": p["domain"], "words": p["words"], "ratio": p["ratio"],
          "overclaims": p["overclaims"], "excerpt": p["excerpt"]} for p in FEAT["pages"]]

# layer_map.build writes under its ROOT/data/measured; point it at a scratch folder and move the file to --out.
scratch = tempfile.mkdtemp(prefix="shibbo-report-map-")
os.makedirs(f"{scratch}/data/measured")
layer_map.ROOT = scratch
try:
    build(
        layer="reports",
        pages=pages, primary="api", route_names={"api": "API, no system prompt"},
        briefs={l["id"]: {"kind": l["kind"], "domain": l["domain"], "brief": l["task"]} for l in spec["logs"]},
        label=label, group=group,
        method={"features": "measure/report-features.mjs: form, opening, closing, narration and length are fixed regexes and counts. Whether a report states the result, each failure, each undone item and the ask, and whether it claims something the log contradicts, comes from a judge model (measure/judge-reports.ts, GPT-6.1 Terra) reading the log, the facts in measure/report-facts.yaml and the report",
                "setup": "each model reads the same finished work log in one chat request, with no tools, harness or system prompt, and writes its final message to the user",
                "length": "words against the median for that log over every model"},
        limits=[
            "The model reports on work it did not do: it reads a log and writes the message. Habits that come from doing the work, or from a harness's own instructions, stay out.",
            "One model judges every maker's reports, and its maker is one of them. Nobody has yet checked a sample of its verdicts by hand; read the report before quoting a verdict.",
            "Twelve logs, written by us. A token in 4 of 12 reports may be chance; owned tokens are leads.",
            "Failure, undone and ask tokens exist only for the logs that have such items, so their shares run over fewer reports than the rest.",
            "No human-written baseline, so the map shows how models differ from each other, not from people.",
        ],
        attribution="Measured by shibbo from final reports generated with measure/generate-reports.ts",
        model_stats=model_stats, out_name="report-map.json",
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    shutil.move(f"{scratch}/data/measured/report-map.json", OUT)
    print(f"wrote {OUT}", file=sys.stderr)
finally:
    layer_map.ROOT = ROOT
    shutil.rmtree(scratch, ignore_errors=True)
