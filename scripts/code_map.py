"""Place one-shot code replies, their code habits and the models that wrote them in one plane: the code atlas.

    uv run --with numpy --with pyyaml python -I scripts/code_map.py [--features F]
      reads  measure/code-features.json (node measure/code-features.mjs)
      writes data/measured/code-map.json, in the shape of data/measured/ui-map.json; each point carries a code excerpt
      of up to 12 lines from the model's own reply for the hover card, and no thumbnail.

One route: bare API requests with no system prompt (measure/generate-code.ts). Method: scripts/layer_map.py, the same
correspondence analysis, ownership rule and drift as the interface atlas (scripts/ui_map.py).
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yaml  # noqa: E402
from layer_map import ROOT, TELL_NAMES, build  # noqa: E402

args = sys.argv[1:]
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
FEAT = json.load(open(opt("--features", f"{ROOT}/measure/code-features.json")))
spec = yaml.safe_load(open(f"{ROOT}/measure/code-briefs.yaml"))

GROUPS = {"comments": "comments", "narrating-comments": "comments", "section-banners": "comments", "docs": "comments", "example-usage": "comments",
          "length": "size", "fn-length": "size", "functions": "size", "files": "size", "nesting": "shape", "guard-clauses": "shape", "classes": "shape", "named-constants": "shape",
          "try": "safety", "py:broad-except": "safety", "none-checks": "safety", "optional-chaining": "safety", "exit-codes": "safety",
          "py:type-hints": "types", "py:no-type-hints": "types", "ts:any": "types", "ts:ignore": "types", "ts:return-types": "types", "ts:declared-types": "types", "py:dataclass": "types",
          "emoji": "glyphs", "non-ascii": "glyphs", "logging": "output", "prints": "output", "main-guard": "scripts", "shebang": "scripts", "py:argparse": "scripts", "py:sys-argv": "scripts",
          "tests": "tests", "asserts": "tests", "test-cases": "tests", "readme": "readme", "commit": "commit", "tell": "tell", "react": "react",
          "prose-outside-code": "reply", "unnamed-file": "reply", "truncated": "reply"}
FIXED = {"narrating-comments": "comments that narrate the next line", "section-banners": "section banner comments", "example-usage": "example-usage block", "docs:every-function": "a docstring on every function",
         "docs:trivial-function": "docstring on a trivial function", "docs:module": "module docstring or header", "guard-clauses": "guard clauses", "classes": "classes", "named-constants": "named constants",
         "py:broad-except": "catch-all except", "none-checks": "repeated null checks", "optional-chaining": "optional chaining", "exit-codes": "explicit exit codes", "py:type-hints": "Python type hints",
         "py:no-type-hints": "no Python type hints", "ts:any": "TypeScript any", "ts:ignore": "ts-ignore or eslint-disable", "ts:return-types": "declared return types", "ts:declared-types": "interfaces and type aliases",
         "py:dataclass": "dataclasses", "emoji": "emoji in code", "non-ascii": "non-ASCII symbols in code", "logging": "a logging module", "main-guard": "a main guard", "shebang": "a shebang line",
         "py:argparse": "argparse", "py:sys-argv": "raw sys.argv", "py:f-strings": "f-strings", "py:str-format": "str.format", "py:percent-format": "% formatting", "py:pathlib": "pathlib", "py:os-path": "os.path",
         "js:var": "var declarations", "js:semicolons": "semicolons", "js:semicolons-off": "no semicolons", "js:single-quotes": "single quotes", "js:double-quotes": "double quotes",
         "react:memo": "useMemo or useCallback", "react:aria": "ARIA attributes", "react:inline-styles": "inline styles", "react:tailwind": "Tailwind classes", "react:portal": "a portal", "react:escape-key": "closes on Escape",
         "react:forward-ref": "forwardRef", "go:error-wrap": "wrapped Go errors", "sql:cte": "a CTE", "sql:upper-keywords": "upper-case SQL", "sql:comments": "SQL comments", "sh:strict-mode": "set -e strict mode",
         "sh:functions": "shell functions", "tests:mocks": "mocks", "tests:parametrized": "parametrized tests", "tests:classes": "test classes", "readme:badges": "README badges", "readme:emoji-headers": "emoji in README headings",
         "readme:toc": "README table of contents", "readme:features": "README Features section", "readme:license": "README License section", "readme:contributing": "README Contributing section",
         "readme:tables": "README tables", "commit:conventional": "conventional-commit prefix", "commit:body": "a commit body", "commit:bullets": "bullets in the commit body", "commit:period": "subject ends in a period",
         "commit:lowercase": "lower-case subject", "prose-outside-code": "prose outside the code", "unnamed-file": "no file name", "files:2+": "two or more files", "truncated": "cut off at max tokens"}


def label(t):
    if t in FIXED:
        return FIXED[t]
    k, _, v = t.partition(":")
    if k == "tell":
        return TELL_NAMES.get(v, v)
    if k == "readme" and v.startswith("sections:"):
        return f"{v.split(':')[1]} README sections"
    if k == "readme" and v.startswith("words:"):
        return f"README of {v.split(':')[1]} words"
    if k == "commit" and v.startswith("subject:"):
        return f"commit subject {v.split(':')[1]} chars"
    return {"comments": f"{v} comments" if v != "none" else "no comments", "length": {"short": "shorter than most", "typical": "typical length", "long": "1.5-2.5x the median length", "very-long": "over 2.5x the median length"}.get(v, v),
            "fn-length": f"{v} functions", "functions": f"{v} functions" if v != "1" else "one function", "nesting": f"nesting depth {v}", "try": "no try blocks" if v == "0" else f"{v} try blocks",
            "prints": "no prints" if v == "0" else f"{v} prints", "indent": "tab indent" if v == "tabs" else f"{v}-space indent", "tests": f"{v} tests", "asserts": f"{v} assertions", "test-cases": f"{v} test cases"}.get(k, t)


def group(t):
    k = t.split(":")[0]
    return GROUPS.get(t, GROUPS.get(k, {"py": "python", "js": "javascript", "ts": "types", "go": "go", "sql": "sql", "sh": "shell"}.get(k, "other")))


runs = {}
for f in __import__("glob").glob(f"{ROOT}/measure/code-runs-api/*/*/run.json"):
    r = json.load(open(f))
    runs.setdefault(r["model"].split("/")[-1].rsplit("-2025", 1)[0].rsplit("-2026", 1)[0], []).append(r)
stats = {}
for p in FEAT["pages"]:
    s = stats.setdefault(("api", p["model"]), {"ratios": [], "truncated": 0})
    s["ratios"].append(p["ratio"])
model_stats = {}
for (rt, m), s in stats.items():
    rr = runs.get(m, [])
    model_stats[(rt, m)] = {"runs": len(rr), "failed": sum(1 for x in rr if not x.get("ok") or x.get("mismatch")), "truncated": sum(1 for x in rr if str(x.get("stop")) in ("max_tokens", "length")),
                            "median_length_ratio": round(sorted(s["ratios"])[len(s["ratios"]) // 2], 2),
                            "cost_usd": round(sum(x.get("costUSD") or 0 for x in rr), 4)}

pages = [{"route": "api", "model": p["model"], "brief": p["brief"], "kind": p["kind"], "tokens": p["tokens"], "lang": p["lang"], "lines": p["lines"], "ratio": p["ratio"], "excerpt": p["excerpt"]} for p in FEAT["pages"]]
build(
    layer="code",
    pages=pages, primary="api", route_names={"api": "API, no system prompt"},
    briefs={b["id"]: {"kind": b["kind"], "lang": b["lang"], "brief": b["brief"]} for b in spec["briefs"]},
    label=label, group=group,
    method={"features": "measure/code-features.mjs: static reading of each reply's files, thresholds documented at the top of the file; tell:<id> from shibbo's checker (code domain)",
            "verbosity": "non-blank code lines against the median for that brief over every model"},
    limits=[
        "One reply per brief and model, so a token in 4 of 24 replies may be chance; owned tokens are leads.",
        "The briefs ask for code only, so habits that show in explanations around code stay out; habits inside README and commit text stay in.",
        "No human-written baseline yet, so the map shows how models differ from each other, not from people.",
        "Tokens come from fixed rules on the source text, with no parser; a reply can meet a rule in letter and miss it in spirit. Rules sit at the top of measure/code-features.mjs.",
        "Replies from different brief languages share some tokens (comments, length, nesting), so a model's language mix matters only through its own habits; every model got the same mix.",
    ],
    attribution="Measured by shibbo from one-shot code replies generated with measure/generate-code.ts",
    model_stats=model_stats, out_name="code-map.json",
)
