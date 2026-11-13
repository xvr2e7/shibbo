"""Place agent transcripts, their conduct habits and the models behind them in one plane: the conduct atlas.

    uv run --with numpy --with pyyaml python -I scripts/conduct_map.py [--features F]
      reads  measure/conduct-features.json (node measure/conduct-features.mjs)
      writes data/measured/conduct-map.json, in the shape of data/measured/ui-map.json; each point carries a short
      transcript excerpt for the hover card, and whether the task succeeded.

Two routes. "tasks", the main set: 12 small coding tasks per model in throwaway repos (measure/run-conduct.ts).
"ui-build": the interface eval's page builds, base arm only (eval/ui/), placed in the same plane as comparison points.
Method: scripts/layer_map.py, the same correspondence analysis, ownership rule and drift as the interface atlas.
Success is the task's hidden check after the run; it stays out of the layout and is reported per model and per task.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yaml  # noqa: E402
from layer_map import ROOT, TELL_NAMES, build  # noqa: E402

args = sys.argv[1:]
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
FEAT = json.load(open(opt("--features", f"{ROOT}/measure/conduct-features.json")))
spec = yaml.safe_load(open(f"{ROOT}/measure/conduct-tasks.yaml"))

FIXED = {"narration:none": "no step narration", "narration:some": "some \"Let me…\" narration", "narration:heavy": "narrates most steps", "silent-work": "works without commentary",
         "status-exclaim": "\"Perfect!\" status lines", "apology": "apologies", "final:headers": "headings in the final reply", "final:bullets": "bullets in the final reply", "final:table": "a table in the final reply",
         "final:bold-labels": "bold labels in the final reply", "final:code-block": "code in the final reply", "final:recap": "a closing recap", "final:words:<=40": "final reply of 40 words or fewer",
         "final:words:41-120": "final reply of 41-120 words", "final:words:121+": "final reply over 120 words", "ran-check": "runs the code or tests", "claims-pass": "says it works or passes",
         "claims-pass:unverified": "says it passes without a run", "asks-question": "ends with a question", "offers-more": "offers more help", "asked-instead": "asks instead of acting",
         "created:0": "creates no files", "created:1": "creates one file", "created:2+": "creates two or more files", "edited:0": "edits no files", "edited:1": "edits one file", "edited:2+": "edits two or more files",
         "scratch-files": "leaves scratch or report files", "commits": "commits unasked", "todo-list": "keeps a todo list", "subagent": "spawns a subagent", "permission-wall": "hits a permission wall",
         "bash:none": "no shell commands", "bash:some": "some shell commands", "bash:most": "mostly shell commands"}


def label(t):
    if t in FIXED:
        return FIXED[t]
    k, _, v = t.partition(":")
    if k == "tell":
        return TELL_NAMES.get(v, v)
    return {"turns": f"{v} turns", "tools": f"{v} tool calls"}.get(k, t)


def group(t):
    k = t.split(":")[0]
    return {"narration": "narration", "silent-work": "narration", "status-exclaim": "tone", "apology": "tone", "final": "final reply", "ran-check": "verification", "claims-pass": "verification",
            "asks-question": "asking", "offers-more": "asking", "asked-instead": "asking", "created": "files", "edited": "files", "scratch-files": "files", "commits": "files",
            "turns": "effort", "tools": "effort", "bash": "effort", "todo-list": "effort", "subagent": "effort", "permission-wall": "effort", "tell": "tell"}.get(k, "other")


pts = FEAT["pages"]
stats = {}
for p in pts:
    s = stats.setdefault((p["route"], p["model"]), {"n": 0, "ok": 0, "turns": [], "tools": [], "cost": 0.0, "words": []})
    s["n"] += 1
    s["ok"] += 1 if p["success"] else 0
    s["turns"].append(p["turns"] or 0)
    s["tools"].append(p["tool_calls"])
    s["words"].append(p["final_words"])
    s["cost"] += p["cost_usd"] or 0
mean = lambda a: round(sum(a) / len(a), 2) if a else None
model_stats = {k: {"success": s["ok"] if k[0] == "tasks" else None, "success_rate": round(s["ok"] / s["n"], 3) if k[0] == "tasks" else None,
                   "mean_turns": mean(s["turns"]), "mean_tool_calls": mean(s["tools"]), "mean_final_words": mean(s["words"]), "reported_cost_usd": round(s["cost"], 3)} for k, s in stats.items()}
by_task = {}
for p in pts:
    if p["route"] == "tasks":
        t = by_task.setdefault(p["brief"], {"runs": 0, "success": 0, "failed_by": []})
        t["runs"] += 1
        t["success"] += 1 if p["success"] else 0
        if not p["success"]:
            t["failed_by"].append(p["model"])

briefs = {t["id"]: {"kind": t["lang"], "brief": t["task"]} for t in spec["tasks"]}
for b in sorted({p["brief"] for p in pts if p["route"] == "ui-build"}):
    briefs[f"ui:{b}"] = {"kind": "page", "brief": f"interface eval brief '{b}' (eval/ui/briefs.json)", "route": "ui-build"}
pages = [{"route": p["route"], "model": p["model"], "brief": p["brief"] if p["route"] == "tasks" else f"ui:{p['brief']}", "kind": p["kind"], "tokens": p["tokens"],
          "success": p["success"], "turns": p["turns"], "tool_calls": p["tool_calls"], "excerpt": p["excerpt"]} for p in pts]
build(
    layer="conduct",
    pages=pages, primary="tasks", route_names={"tasks": "small coding tasks in Claude Code", "ui-build": "interface eval page builds, base arm"},
    briefs=briefs, label=label, group=group,
    method={"features": "measure/conduct-features.mjs: Claude Code stream-json transcripts, thresholds documented at the top of the file; tell:<id> from shibbo's checker (agent and chat domains) on the assistant text",
            "runs": "measure/run-conduct.ts: claude -p in a fresh git repo under /tmp, project settings only, acceptEdits, Read/Write/Edit/Glob/Grep plus Bash for npm, node, python3, pytest, git status/diff and ls, $2 cap per run",
            "success": "the task's hidden check after the run (exit 0); kept out of the layout"},
    limits=[
        "Conduct covers Claude models only for now: no other agent CLI is installed, so GPT, Gemini and open models have no transcripts.",
        "One harness, Claude Code, shapes all of it: its system prompt, tool set and permission rules. A model may act differently in another harness.",
        "The task route allows only python3, node, npm, pytest, ls and git status/diff in the shell, and pytest isn't installed; a model that reaches for `python` or `cat` hits a permission wall, which the map records.",
        "One run per task and model, so a token in 4 of 12 runs may be chance; owned tokens are leads.",
        "The ui-build points come from a different job (one long page build per brief) and only for Fable 5.1, Opus 5.5 and Sonnet 5.5; they sit in the plane for comparison and take no part in the layout. Only their base arm counts, since the other arms load shibbo.",
        "Tokens come from fixed rules on the transcript text; a claim that tests pass counts as verified when any run of python3, node, npm or pytest came before the final reply, whatever that run showed.",
    ],
    attribution="Measured by shibbo from Claude Code transcripts (measure/run-conduct.ts; eval/ui base arm)",
    model_stats=model_stats, extra={"tasks": by_task}, out_name="conduct-map.json",
)
