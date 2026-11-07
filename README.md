# shibbo

Guards at the Jordan caught outsiders with one word: *shibboleth*. Language models have words like that too.
<!-- shibbo-ignore -->
"Delve" gave away GPT-4 in 2024. In a 2026 study of the same 9,984 topics written by people and by models, Claude Opus 5 wrote "genuinely useful" 411 times and GPT-6 Astra wrote "rather than treating" 1,473 times. The people wrote each of those zero times.
<!-- /shibbo-ignore -->

Shibbo keeps a dated record of these tells for each model, draws them as a map, and checks your text against them. You can run it from the command line, from Claude Code, or from any agent that speaks MCP.

## The app

`npm run web:dev` starts it; `npm run web:build` writes the app and its docs to `web/dist`.

- **Atlas.** A dialect map of machine writing. Phrases form the terrain, habits such as em dashes or echo endings stand as landmarks, and each family's releases trace a route from ChatGPT's launch to 2026. The timeline holds 194 dated releases from open and closed labs, each cited. Claude moves toward people with each release; GPT moves away.
- **Tells.** A field guide of 362 tells on five shelves: interfaces and type, code, agents, prose and chat replies. Interface tells render as small mockups, code tells mark the bad lines, agent tells replay the exchange, and prose tells highlight the pattern. Measured ones show per-model rates.
- **Models.** An arena where people and nine models meet on 5,044 matched topics (people rate 1615, the best model 1022), every measured model, and outside boards for more open and closed models.
- **Docs.** A VitePress site with setup for 17 agent harnesses.

## Measured history

| Era | Source | Models |
|---|---|---|
| 2025–26 | Graphite's AI Tells (CC BY 4.0), 9,984 matched topics | GPT-4.1 to GPT-6 Astra, Claude Opus 4 to 5, Gemini 2.5 and 3.1 Pro |
| 2022–23 | RAID (MIT), measured by shibbo against the human text each generation was prompted from | text-davinci-003, ChatGPT, GPT-4, Llama 2 70B Chat, Mistral 7B, MPT-30B, Cohere Command |
| 2024 onward, open models | our own runs on Graphite's topics (`measure/generate-local.ts`) | in progress; see `measure/HANDOFF.md` |

## What the data says

The numbers come from Graphite's [AI Tells](https://graphite.io/research/ai-tells) study (CC BY 4.0): 9,984 topics, each written once by a person and once by each of nine models.

<!-- shibbo-ignore -->
| Tell | Then | Now |
|---|---|---|
| "delves" | 28× its expected rate in 2024 PubMed abstracts ([Kobak et al.](https://arxiv.org/abs/2406.07016)) | under 2× the human rate in four of five 2026 models |
| Em dashes | GPT-4.1 and GPT-5: 2.2× the human rate | GPT-6 Astra 0.12×, Gemini 3.1 almost none |
| "not a _, it is" | | Claude Opus 5: 445 uses, people 1 |
| "that distinction matters" | | GPT-6 Astra: 564 uses, people 0 |
| "it's" | | people: 14,540 uses, Claude Opus 4.6: 7 |
<!-- /shibbo-ignore -->

Most of what people list as AI tells in 2024 has faded. The new ones are frames and habits, so a ban list from two years ago aims at the wrong targets.

## Install

```bash
npm install -g shibbo        # or use npx shibbo
```

Set up any agent harness with one command; it writes the rules, the MCP server and the hooks that harness supports:

```bash
npx shibbo init cursor     # or claude, codex, copilot, gemini, devin, cline, roo, aider, kiro, junie, amp, ...
```

For Claude Code, the plugin bundles all of it:

```text
/plugin marketplace add <owner>/shibbo
/plugin install shibbo@shibbo
```

The plugin does three things. At session start it adds the tells your model over-uses most. After each Write or Edit to a doc, page or stylesheet, it checks the changed text and hands hits back to Claude with fixes. When Claude ends a long reply that scores as heavy slop, it asks for one rewrite. Set `SHIBBO_STOP=off` or `SHIBBO_EDIT=off` to turn either check off.

## Use

```bash
shibbo check README.md                  # score 0-100 and list hits with fixes
shibbo check docs/ --threshold 80       # exit 1 if any file scores under 80
shibbo check post.md --model gpt-6      # weight the phrases that model over-uses
shibbo rules --model claude-opus-5      # a short rule block for a prompt
shibbo show contrastive-negation        # evidence for one tell
shibbo export claude                    # or agents, cursor, vale
shibbo mcp                              # MCP server with check_text, check_file, rules, tell
```

It reads Markdown, HTML, stylesheets and JSX, and skips code and URLs. On an HTML page the visible text gets the prose checks and the markup gets the UI checks, such as purple gradients or Inter set everywhere.

## How it works

`data/tells.yaml` and the files in `data/tells.d/` hold 362 tells, from prose to UI, each with at least one source. Each entry names its pattern, a fix, examples, its status, what it turns into once banned, and links to measured terms. `SCHEMA.md` covers the format.

`npm run import:graphite` turns Graphite's tables into `data/measured/graphite.json`: per-model rates for each tell, and a list of the 400 strongest phrases per model. The checker runs curated rules first, then looks for measured phrases, and scores penalty per 1,000 words.

## Does it work?

`npm run eval -- <articles.jsonl.gz>` tests the checker on Graphite's articles. Topics split in half by URL hash. The phrase list, the score scale and the model weighting all come from the training half. Every reported number comes from the other 5,044 topics.

With default settings, a model's article scores worse than a person's on the same test set 95 to 98 times in 100, depending on the model. One human article in nine still gets flagged; that is the price of the threshold. The curated rules alone reach 0.67 to 0.89, so most of the signal comes from the measured phrases. Passing `--model` sharpens the ranking to 97.6 to 99.2 in 100, with human articles checked under the same setting. The cost: about one human article in four then scores under 80, because the score scale was calibrated without a model. Recalibrating it for that mode is the next fix. The site's Test section and `data/measured/eval.json` hold the per-model table.

Two caveats. I wrote the curated rules after reading Graphite's full tell lists, so the rules-only figures run high. And the whole test covers one genre, web articles. Chat replies, code comments and UI copy have no human baseline yet.

## Keeping up with new models

Tells turn over fast. Between a family's two newest versions, Graphite found more than half of each model's tells were new. To measure a model when it ships:

```bash
npx tsx measure/analyze.ts --baseline <ai_tells_articles.jsonl.gz>   # once: human n-gram counts, kept in .cache
npm run measure -- --model claude-opus-5-5                          # 30 article prompts, about 40k output tokens
npm run analyze -- measure/runs/claude-opus-5-5/*.jsonl
```

The report compares each registry tell with people and with the previous model in the family. It also lists phrases that look like new tells and old ones the model dropped. The `measure` workflow does the same in CI and opens a pull request, so a person reviews each new tell before it enters `data/tells.yaml`. For other providers, save outputs in the same JSONL shape and run only the analyzer.

<!-- shibbo-ignore-next-line -->
As a check, the analyzer was run on 30 of Graphite's Claude Opus 5 articles as if Opus 5 were new. Without hints, it surfaced "is genuinely", "this matters" and "is precisely", along with candidates outside the registry.

## Develop

```bash
npm install
npm test
npm run import:graphite && npm run map && npm run web:build
npm run plugin          # bundle the engine and data into plugins/shibbo
```

## Credits

Measurements: Graphite, "AI Tells" (2026), CC BY 4.0. The raw tables ship in `data/raw/graphite` with their license. Graphite's article texts belong to their publishers and are not included. PubMed figures: Kobak et al. (2025). Rule ideas also came from Wikipedia's "Signs of AI writing" and the open-source checkers listed in `data/sources.yaml`.
