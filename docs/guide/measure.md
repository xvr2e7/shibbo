# Measure a new model

Tells turn over fast: between a family's two newest versions, 39 to 49% of the newer model's prose tells are new. When a model ships, measure it.

You run every step on your own machine. The API routes spend API credit, so each generator can print its cost first and takes a spending cap. Keys come from the environment or from a git-ignored `.env` at the repo root: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`. What the models write stays local; only the derived numbers are committed.

Each layer has its own run, and you can do any one alone.

| Layer | Generate | Build the map |
|---|---|---|
| Prose | `measure/generate-api.ts` | `import:runs`, `dense_map.py`, `map`, `arena.ts` |
| Interface | `measure/generate-ui.ts` | `ui:features`, `ui:map` |
| Code | `code:gen` | `code:features`, `code:map` |
| Conduct | `conduct:gen` | `conduct:features`, `conduct:map` |

## Prose

Add the model to `measure/api-models.yaml` with its provider, API id and price. Then:

```bash
npx tsx measure/generate-api.ts --plan                          # cost of a full run for every listed model
npx tsx measure/generate-api.ts --model <id> --topics 10        # trial: prints the real tokens per word
npx tsx measure/generate-api.ts --model <id> --budget 20        # full run, stops before passing $20
```

The script asks the model for a web article on each topic in `measure/topics.jsonl`. That file pins 293 titles and target lengths from Graphite's held-out half, so every model answers the same list. Anthropic and OpenAI runs go through their batch APIs at half price: the first call submits, and the same command later collects. OpenRouter runs go request by request. Replies land in `measure/runs/api-<id>/matched.jsonl`.

Comparing a run with people needs Graphite's article file, which belongs to its publishers and stays in `.cache/`. With it in place:

```bash
npm run import:runs                              # -> data/measured/api.json
uv run --with numpy --with scipy --with pandas --with pyyaml python -I scripts/dense_map.py .cache/dense-55 <raid-dir>
npm run map                                      # -> data/measured/map.json
npx tsx scripts/arena.ts                         # -> data/measured/arena.json
```

`scripts/import_local.py`, behind `import:runs`, compares each run with the human articles on exactly its topics. Each step picks up every run with 100 or more articles and skips smaller trials.

Then add the model to `data/models.yaml` with `source: shibbo-api`, its run and its article count, so the checker and the rules tune to it. `npm run validate` checks the count against `api.json`. [Shibbo's own runs](/concepts/data#shibbo-s-own-runs) covers the thresholds a run of this size must pass.

## Interface

```bash
npx tsx measure/generate-ui.ts --model <id> --via openrouter --budget 5
npm run ui:features
npm run ui:map                                   # -> data/measured/ui-map.json
```

The model answers the 24 briefs in `measure/ui-briefs.yaml`, one page each. `--via` picks the route: `anthropic`, `openai` or `openrouter` call the API with no system prompt and save to `measure/ui-runs-api/`; `claude-cli` runs Claude Code with tools off and saves to `measure/ui-runs/`. For `claude-` ids the default is `claude-cli`, so pass `--via anthropic` to add a Claude model to the main set.

`ui:features` opens each page in headless Chrome and needs `playwright-core`; set `PW` to its path. `ui:map` also writes the web app's copy of the map and its thumbnails.

## Code

```bash
npm run code:gen -- --model <id> --brief py-csv-dedupe,readme-tool   # two-request trial
npm run code:gen -- --model <id> --plan                              # cost of the rest, from the trial
npm run code:gen -- --model <id> --budget 5
npm run code:features
npm run code:map                                 # -> data/measured/code-map.json
```

The model answers the 24 requests in `measure/code-briefs.yaml` through its API with no system prompt. `--batch` halves the price for Anthropic and OpenAI. Replies land in `measure/code-runs-api/`.

## Conduct

```bash
npm run conduct:gen -- --model <id>
npm run conduct:features
npm run conduct:map                              # -> data/measured/conduct-map.json
```

`measure/run-conduct.ts` hands the model the 12 tasks in `measure/conduct-tasks.yaml`, each in a fresh git repo under `/tmp`, through the Claude Code binary. So it measures Claude models only. It uses your Claude subscription in place of API credit and caps each run at $2 of reported usage. `--selftest` builds every repo and runs its hidden check untouched; all but one should fail.

## Show it in the web app

```bash
npm run web:dev
```

This runs `web:data` and `web:layers` first, which gather the registry, the prose map and the code and conduct maps into `web/src/data/`.

## Read the results first

A person should read the results before they go into a commit. One reply per brief makes a token a lead, and a run of 290 articles can't show rare phrases. Each generator saves a reply that came from a different model than you asked for, and flags it; look for those flags. [The add-a-tell guide](/guide/add-a-tell) covers the path from a finding to a registry entry.
