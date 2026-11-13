# Interface eval

Does the harness make agent-built pages better? This folder builds the same briefs with and without shibbo, using the real Claude Code binary, then has a person judge the pages blind.

## Steps

```sh
# 1. Build. Each cell is a clean scratch project; user-level settings, plugins and CLAUDE.md stay out.
node eval/ui/gen.mjs --tag v2 --model claude-fable-5-1 --arm base,shibbo --reps 2 --jobs 4
node eval/ui/gen.mjs --tag sonnet --model claude-sonnet-5-5 --arm base,shibbo

# 2. Screenshot and run the rendered checks (needs Chrome and playwright-core; set PW to its path).
node eval/ui/shot.mjs --tag v2
node eval/ui/render.mjs --tag v2

# 3. Build the blind page and the key.
node eval/ui/report.mjs --tag v2
open eval/ui/blind-v2.html

# 4. After judging, save the export as eval/ui/picks-v2.json and total it.
node eval/ui/tally.mjs --tag v2
```

## Arms

| Arm | What the build session gets |
|---|---|
| `base` | Nothing. |
| `shibbo` | The plugin in this checkout: rules at session start, checker feedback after each edit, a check on the final reply. |
| `shibbo-v1` | An older copy of the plugin (set `SHIBBO_V1`), to compare versions. |
| `shibbo-ui` | The plugin, plus the interface rules appended to the system prompt. |
| `hallmark` | Hallmark's skill copied into the project and called by name. Runs Hallmark's own scripts, so it is off unless asked for. |

## Briefs

`briefs.json` holds six briefs: a SaaS landing page, a clinic dashboard, a bakery, a personal site, a launch with no numbers given (any statistic on the page is invented), and a vague one-liner. Add briefs there; ids become folder names.

## Reading the results

- **Blind ratings** are the measure that counts. Letters are shuffled per brief and stay stable between rebuilds. Page links use the letter too (`runs/<tag>/p/<brief>/<letter>`, and `/p/...` in `rate.mjs`), so no URL names the arm; rerun `report.mjs` to refresh a blind page built before this.
- **shibbo hits** come from shibbo's own checker. The shibbo arms were steered against those same patterns, so this column favours them.
- **Rendered checks** (`render.mjs`) open each page in Chrome at 390 and 1440 px: text contrast against its resolved background, text under 12 px, controls with no visible focus change, sideways scroll, and text cut off at the edge. Tiny text and focus overlap two shibbo tells; the other three don't.
- **Sameness** compares two builds of one brief by one arm: shared headline words and matching headline fonts. The key also lists every headline per brief, which shows when all arms reach for the same hook.

Run outputs, screenshots and the generated pages stay out of git (see `.gitignore`).
