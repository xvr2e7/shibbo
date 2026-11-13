# Data, tests and limits

## Where the measurements come from

| Era | Source | Design | Models |
|---|---|---|---|
| 2026 | shibbo's own runs through each maker's API or OpenRouter | 286 to 292 articles per model on held-out Graphite topics, each compared with the human article on the same topic (see below) | Claude Fable 5.2, Haiku 5.5 and Sonnet 5.5, GPT-6.1 Sol and Terra, Gemini 4 Argon, DeepSeek-V4.1-Flash, MiMo-V2.6 Pro, MiniMax-M3.1 Flash, Nemotron 3.5 Super |
| 2025 to 2026 | Graphite, AI Tells (CC BY 4.0) | 9,974 human web articles published before ChatGPT's launch (30 Nov 2022); each model wrote one article per topic from the same summary. Graphite's Opus 5.5 update dropped 10 of the first release's 9,984 topics | GPT-4.1, GPT-5, GPT-5.6 Sol, GPT-6 Astra, Claude Opus 4, 4.6, 5 and 5.5, Gemini 2.5 Pro and 3.1 Pro |
| 2022 to 2023 | RAID (Dugan et al., ACL 2024; MIT), measured by shibbo | 11,600 generations per model across 7 genres, each compared with the human text it was prompted from. RAID queried the OpenAI and Cohere models in November 2023 | Instruct and chat models: GPT-3 (text-davinci-002 per the RAID paper; RAID's README says text-davinci-003), ChatGPT (gpt-3.5-turbo-0613), GPT-4 (gpt-4-0613), Llama 2 70B Chat, Mistral 7B Instruct, MPT-30B Chat, Cohere Command (unversioned) |
| 2023 to 2024 | Cited studies | Excess-word counts in published papers and reviews | Whole corpora, without model labels |

The texts behind both measured sources stay local; only derived rates are published. When people never used a phrase, the ratio is undefined, so shibbo reports the raw counts (“411 vs 0”).

## Shibbo's own runs

Graphite's data stops at Claude Opus 5.5 and GPT-6 Astra, so shibbo measures newer releases itself. `measure/generate-api.ts` asks each model for a web article on 293 topics from the held-out half (the half the test and the arena use), through the maker's API for Claude and GPT and through OpenRouter for the rest. `measure/topics.jsonl` pins the topic list, so every run gets the same titles. Each prompt gives a title for the topic and the length of the human article; the title is GPT-4.1's, from Graphite's data, so shibbo drops the echoed title line before counting. `scripts/import_local.py` then compares each model with the human articles on exactly its topics and writes `data/measured/api.json`.

A run of about 290 articles is small next to Graphite's 9,974, so the thresholds scale down and the caveats grow:

| Check | Rule for a run |
|---|---|
| Test | Paired sign test over topics, Benjamini-Hochberg q < 0.01 |
| Over-used phrase | 4× the human rate or more, in at least 15 of the model's articles, the five heaviest topics holding at most half its uses |
| Phrase people use more | 4× or more, in at least 30 human articles |
| Checker phrase list | Two or more words, at least one of them a content word; 8× or more, in at least 20 articles |
| Tell reading | The registry tell's strongest linked phrase, shown only when the sign test backs it and both sides together used it 10 or more times |

Rare phrases and small gaps don't show up at this size. A run reaches the atlas, the arena and the Models page once it holds 100 articles; the atlas places it like a RAID model, against its own human texts, and it leaves the terrain where it was. Its arena rating rests on 3,146 to 3,212 rated battles, against 50,410 for each Graphite model, so its interval runs about five times as wide.

<!-- shibbo-ignore -->
The first four runs, from Claude Fable 5.2, Claude Sonnet 5.5, GPT-6.1 Sol and GPT-6.1 Terra in November 2026, show the newest habits. Every one writes "practical" 69 to 231 times where people on the same topics wrote it 4 times. Claude Fable 5.2 says "the bottom line" (58 vs 4) and "carries" (44 vs 0); Claude Sonnet 5.5 says "looking ahead" (35 vs 1) and "patience" (32 vs 0); GPT-6.1 Sol says "not simply" (103 vs 0) and "not automatically" (77 vs 0). Both Claude runs all but drop the em dash (0.03 and 0.02 per 1,000 words, against people's 1.05); GPT-6.1 Sol uses twice the human rate.
<!-- /shibbo-ignore -->

## How shibbo counts

Graphite's published table lists each phrase only for the models where it passed Graphite's own cut, so a blank cell means "not listed" and says nothing about size. In the old atlas those blanks counted as "no difference", though about two in five of them hid gaps of 4× or more. Shibbo now counts every phrase of one to three words, plus Graphite's gapped frames, straight from the paired articles (`scripts/dense_count.py`). Its counts match Graphite's to within 5% for 97% of listed model cells.

Before counting, every text loses web-page clutter: lines found on three or more human pages (cookie banners, sign-up boxes), lines with page-chrome words, and bare nav words. This removes boilerplate such as "skip to content" and "all rights reserved" that people's pages carried and models never wrote.

A phrase reaches the atlas when, for at least one model (`scripts/dense_map.py`):

| Check | Rule |
|---|---|
| Size | One side uses it at least 4× as often, per position of that phrase length |
| Test | A paired sign test over topics, model article against its human twin, Benjamini-Hochberg q < 0.01 |
| Reach | The side that uses it more does so in at least 150 articles (1.5% of topics) |
| Spread | The five heaviest topics hold at most 25% of its uses |
| Topic echo | A model phrase found mainly on topics where the human page used it too is content, so it's dropped |
| Readable | No stray letters or numbers; a gapped frame needs enough fixed words and must beat its strongest single word by 1.5× |
| Not a fragment | A phrase whose uses mostly sit inside a longer mapped phrase gives way to it |

About 11,000 phrases pass; the atlas draws the 5,000 most lopsided and common.

**Layout.** A correspondence analysis of the phrase × corpus count table, with people as one of eleven corpora, places people, models and phrases in one plane (the first two axes hold 50% of the variation). Each phrase lands at the average of the corpus points weighted by who uses it, so a phrase people and models share lands between them. People carry 18% of the variation, the most of any corpus. RAID models and shibbo's own runs are placed as extra corpora, each relative to its own human texts.

**How much is shared.** Models and people share most of their words. On the same topics, 70 to 80% of each model's word use matches people's; for two-word phrases, 52 to 66%; for three-word phrases, 37 to 54%. People's pages on *different* topics match each other more closely still (about 95% for single words), so models do write differently; the atlas shows only the most lopsided phrases.

### Prose map limits

- The map draws only phrases one side uses at least 4× as often. People and models share most other words, and the map leaves those out.
- Its two axes hold 50% of the variation in the count table. The other half doesn't show.
- Positions come from 2025–26 usage. Graphite's ten models and people set the terrain; RAID's 2022–23 models and shibbo's own runs are placed on it afterwards.
- A RAID model's marker sits relative to its own human texts, but its phrases sit where 2025–26 usage puts them, often far from the marker. RAID's genres also differ from Graphite's.
- A run of about 290 articles can't show rare phrases or small gaps.

## The held-out test

Topics split in half by a hash of the URL. The phrase list, score scale and model weighting came from the training half; results come from the other 5,041 topics. On the same topic, a model's article scored worse than the person's 96 to 99 times in 100, and one human article in nine still scored under 80. Pooled across topics (AUC), a random model article scored worse than a random human one 94 to 98 times in 100; the curated rules alone reached 0.84 to 0.93. Naming the model ranks articles better (0.96 to 0.99) but flags about one human article in five, because the score scale wasn't refit for that mode.

The curated rules run in every one of these setups, and they were written after reading Graphite's full tell lists, test half included. So every figure here runs somewhat high, not just the rules-only one.

## Interface pages

The interface layer of the atlas measures pages, not words. Each model gets the same 24 one-line briefs (`measure/ui-briefs.yaml`): landing pages, app screens, local shops, personal sites, a product page, a pricing page, docs and a newsletter sign-up. The briefs give no style hints, so each page shows what the model picks when nobody tells it. Each model answers each brief once (`measure/generate-ui.ts`).

Pages come by two routes, and shibbo keeps them apart. The main set asks each model through its API with no system prompt (`measure/ui-runs-api/`). A second set asks Claude models through Claude Code (`measure/ui-runs/`), whose own system prompt wraps every request. The map stands on the API set and can lay the Claude Code pages over it, so you can see how far the wrapper moves each model. The API set holds 707 pages from 30 models: 10 Claude, 5 GPT, Gemini 3.1 Pro, 3.8 Flash and 4 Argon, Gemma 4, and DeepSeek V4 Pro and V4.1 Flash, GLM-5.3, Grok 4.7, Kimi K3.1 Pro, MiMo-V2.6 Pro, MiniMax-M3.1 Flash, Mistral Large 4, Muse Wonder, Nemotron 3.5 Super and Qwen3.8 Max. The Claude Code set holds 310 pages from 13 Claude models. Sets of fewer than 10 pages, from trial runs, stay off the map, and so does LFM3 (about 2B), whose pages were mostly broken.

**Tokens.** `npm run ui:features` opens each page in headless Chrome at 1440 × 900 and at 390 wide, and records its design choices as short tokens: the heading and body fonts, the page ground (cream, off-white, dark and so on), the accent hue, button and card corners, shadows and glows, centred or left-aligned heroes, rows of three cards, sticky nav, eyebrow labels, motion, and how the page behaves on a phone. It also runs shibbo's checker on the source and adds each interface tell it finds. The page may load fonts and CSS from the common CDNs; Chrome blocks every other request, so photos never load. The thresholds sit at the top of `measure/ui-features.mjs`.

**Layout.** `npm run ui:map` builds a model × token table and runs the same correspondence analysis as the prose atlas. Every model answered the same briefs, so the brief mix cancels out and what separates the models is their own habits. Each page lands among the tokens it uses, and each model sits at the average of its pages. A model *owns* a token when it shows up in at least 4 of its pages, at twice the other models' share and 25 points more, with a one-sided Fisher test under 0.05. With one page per brief, read owned tokens as leads.

### What the interface map shows

The makers split cleanly. GPT sets almost every page in DM Sans (98%), where Claude uses it on 6%; Claude sets 68% in Inter, against 2% for GPT. Claude draws every gradient at 135 degrees on 63% of its pages, Google on 34%, GPT on 2%. GPT puts text under 11 px on 99% of its pages, the open models on 57%, Claude on 25%. The open models stack six or more eyebrow labels on 78% of pages and pick a cream ground on 52%. The Claude Code wrapper moves a model 4.49 map units on average, where API models sit 24.16 apart, so the wrapper matters far less than the model.

### Interface limits

- The map's two axes hold 47% of the spread between models (28.7% and 18.5%).
- Thirteen makers sit in the main set: Anthropic's Claude, DeepSeek, Google's Gemini, OpenAI's GPT, Meta, MiniMax, Mistral, Moonshot, Nvidia, Qwen, xAI, Xiaomi and Zhipu.
- Each model answered each brief once, through OpenRouter for the open models and Gemini. A token in 4 of a model's 24 pages may be chance, and the Fisher test isn't adjusted for the number of tokens.
- A few replies ran out of tokens and count as missing (Qwen3.8 Max lost 6, Kimi K3.1 Pro 4).
- No human-built pages sit on the map yet, so it compares models with each other and can't say how far any model sits from people.
- Tokens come from fixed thresholds on computed styles, so a page can meet a rule in letter and miss it in spirit.
- Pages render without network images, so a photo-led design reads by what is left.
- Eight replies, all from Claude Opus 4.6, came back JSON-escaped, with literal `\n` and quotes. Shibbo measured an unescaped copy.

## Code

The code layer measures what a model writes when someone asks for a small program. Each model gets the same 24 one-line requests (`measure/code-briefs.yaml`), worded the way people ask: Python scripts and CLIs, a Flask and a FastAPI endpoint, React components in TypeScript, Node, Go, Rust, SQL and shell, a bug fix and a refactor of a short snippet, tests for a given function, a README and a commit message. The requests give no style hints. Each one ends by asking for only the code and its file name, so habits in the prose around code stay out. Each model answers once through its API, with no system prompt (`npm run code:gen -- --model <id>`; `--batch` for Anthropic and OpenAI).

**Tokens.** `npm run code:features` reads every file in a reply and records its habits as tokens: how much it comments, comments that narrate the next line, banner comments, docstrings on every function or on trivial ones, emoji and other non-ASCII symbols in code, type hints and `any`, try blocks and catch-all `except`, repeated null checks, guard clauses, nesting depth, function length, main guards, prints against logging, and its length against the median reply to the same request. Tests, READMEs and commit messages get their own tokens (assert counts and mocks; badges and section counts; subject length, conventional prefixes, bodies). It also runs shibbo's checker on each file and adds each code tell it finds. The thresholds sit at the top of `measure/code-features.mjs`.

**Layout.** `npm run code:map` runs the same correspondence analysis and ownership rule as the interface map, and writes `data/measured/code-map.json`. Each point carries up to 12 lines of the model's own reply.

### What the code map shows

26 models answered all 24 requests (GLM-5.3 and Qwen 3.8 Max each ran out of tokens once). Length splits the makers most. The median reply from Opus 5.5 runs 1.83 times the median for its request, Sonnet 5.5 1.66, Fable 5.2 1.63 and Opus 5 1.61; Claude's 4.x releases sit between 0.83 and 1.24, GPT between 0.76 and 1.0, and Gemini 3.1 Pro and Gemma 4 at 0.7. Across Claude releases the code also gained structure: guard clauses rose from 9% of replies in the four earliest releases to 29% in the four latest, module docstrings from 3% to 16%, and named constants from 4% to 16%. Most models leave most replies with no comments at all; Haiku 4.5 (6 of 24 bare) and Fable 5.2 (10) comment the most. Owned tokens are few: short replies for Gemini 3.1 Pro (11 of 24), GPT-6 Sol (11) and Gemma 4 (10); long ones for Fable 5.2 (11) and Sonnet 5.5 (10); and Opus 4.5 leaves out the file name in 9 of 24. The checker's code tells fire rarely here, at most twice per model.

### Code limits

- The map's two axes hold 44% of the spread between models (28.3% and 15.8%).
- Nine makers sit in the main set: Anthropic's Claude, DeepSeek, Google's Gemini, OpenAI's GPT, Mistral, Moonshot, Qwen, xAI and Zhipu.
- Each model answered each request once. A token in 4 of a model's 24 replies may be chance, so owned tokens are leads.
- The requests ask for code only. A habit that shows in the explanation around code stays out; one inside README or commit text stays in.
- No human-written code sits on the map yet, so it compares models with each other and says nothing about people.
- The rules read source text with no parser, so a reply can meet a rule in letter and miss it in spirit.
- Replies in different languages share some tokens (comments, length, nesting). Every model got the same mix of languages, so the mix affects a model's place only through its own habits.

## Conduct

The conduct layer measures what a model does while it works as an agent: whether it narrates each step ("Let me…"), cheers itself on ("Perfect!"), says the tests pass without running them, ends on a recap or a table, asks or acts, and how many turns and tool calls a small job takes.

**Runs.** `npm run conduct:gen -- --model <id>` hands each model the same 12 small coding tasks (`measure/conduct-tasks.yaml`): fix a failing test, add a CLI flag, rename a function across files, write tests, fix a crash from its error message, update a README, and so on. Each task is a tiny repo in python3 stdlib or plain node, built fresh under `/tmp` as a clean git repo. Claude Code runs it headless with project settings only, edits accepted, a short tool list, and a $2 cap. When the agent stops, shibbo records which files it made, changed or deleted, then runs a hidden check the agent never saw. Exit 0 counts as success.

A second, smaller set reuses the page builds from the interface eval (`eval/ui/`), for Fable 5.1, Opus 5.5 and Sonnet 5.5. Only their `base` arm counts: the other arms load shibbo, which steers these very habits. These builds are a different job, so they sit on the map as extra points and take no part in the layout.

**Tokens.** `npm run conduct:features` reads each transcript and records narration rate, status lines, apologies, the shape and length of the final reply, claims that the code works and whether a run came before them, questions to the user, files made and changed, scratch files left behind, turns, tool calls and the share of shell calls. It also runs shibbo's checker over the assistant text and adds each agent and chat tell it finds. The thresholds sit at the top of `measure/conduct-features.mjs`. Success stays out of the tokens.

**Layout.** `npm run conduct:map` runs the same correspondence analysis and ownership rule as the interface map, and writes `data/measured/conduct-map.json`, which stays local.

### What the conduct runs show

The conduct map is off the site. Every run came from one maker's models in one agent, which is no basis for a map of models. The runs and their map stay off the repo, since they hold excerpts of real sessions. The findings below hold for Claude models in Claude Code only.

Claude's agent manner changed more across releases than its success did. In the four earliest releases (Sonnet 4.5 to Opus 4.6), 8% of runs went without "Let me…" narration; in the four latest (Opus 5.5 to Fable 5.2), 98% did, and 75% worked with no text at all until the final reply. The latest releases run the code more often (33% of runs against 73%), and their final replies grew from 40 words or fewer in two runs of three to 41–120 words in most. Haiku 4.5 owns the "Perfect!" status line (7 of 12 runs, against 2% for the rest). No model asked a question instead of acting, left a scratch file, or committed unasked. 142 of 144 runs passed their check; the two failures were test suites from Haiku 4.5 and Sonnet 5.5 that failed their own assertions.

### Conduct limits

- The map's two axes hold 63% of the spread between models (41.3% and 21.3%).
- Conduct covers Claude models only for now. No other agent CLI is installed here, so GPT, Gemini and the open models have no transcripts.
- One harness, Claude Code, shapes every run through its system prompt, tools and permission rules. Another harness may draw different conduct from the same model.
- The shell allows only python3, node, npm, pytest, ls, git status and git diff, and pytest isn't installed there (the write-tests check brings its own). A model that reaches for `python` or `cat` hits a permission wall, and the map records that.
- Each model ran each task once. A token in 4 of a model's 12 runs may be chance, so owned tokens are leads.
- The tasks are small, so success rates sit near the ceiling and say little about skill.
- The page-build points come from a different job, one long build per brief, and only from Fable 5.1, Opus 5.5 and Sonnet 5.5. They sit on the map for comparison and take no part in the layout.
- A claim that tests pass counts as verified when any run of python3, node, npm or pytest came before the final reply, whatever that run showed.

## The arena

People and every measured model meet on the held-out topics: on each topic, the article with fewer tell points per 1,000 words wins. A Bradley–Terry fit turns the wins into ratings, with 95% intervals from 200 topic resamples. People and Graphite's models play all 5,041 topics and are fit together; each of shibbo's runs plays only its own 286 to 292 topics and is fit against their fixed ratings, so a new run never moves the board. A writer's battles and wins count only the battles its rating used. People lead at 1565. Of the models, Claude Fable 5.2 rates highest at 1115 (1088 to 1149), then Claude Opus 5.5 at 1050 (1044 to 1055) and Gemini 4 Argon at 1001 (973 to 1031). Of the open models, Nemotron 3.5 Super rates highest at 889 and MiMo-V2.6 Pro lowest at 747; GPT-6.1 Sol rates lowest of all at 709 (674 to 737).

### Leave-own-out

The arena's checker learns its phrase list from the training half of Graphite's models. An earlier board scored each Graphite model with phrases learned from that model's own training-half articles, while the list held no phrases from shibbo's runs. That tilted the board toward shibbo's runs by about 50 points. Now each Graphite model is scored with its own entries removed, so no writer is scored on phrases learned from its own model's text. Against the old board, shibbo's runs fell 41 to 52 points and Claude Opus 4 rose 91.

### The bridge

Graphite and shibbo prompt in different ways, so shibbo ran two of Graphite's models again under its own prompt and scored each the same way as Graphite's row.

| Model | Graphite's prompt | Shibbo's prompt | Gap | Shared topics | Bridge article had fewer tell points |
|---|---|---|---|---|---|
| Claude Opus 5.5 | 1050 | 1045 | −5 (−39 to +27) | 239 | 54% (48% to 59%) |
| GPT-6 Astra | 857 | 786 | −71 (−103 to −43) | 292 | 38% (33% to 44%) |

The prompt's effect differs by model. Claude Opus 5.5 shows none; GPT-6 Astra scores 71 points worse under shibbo's prompt. Two models can't say which is the rule, so a shibbo run and a Graphite model within 103 points of each other stay unresolved. Pairs that wrote under the same prompt compare cleanly: two Graphite models, or two shibbo runs, with the bridge rows among the shibbo runs.

### Three scorings

The checker has two halves, the curated rules and the measured phrase list. Rated on each half alone, the 20 models fall in unrelated orders (Spearman 0.04). The board therefore gives each writer's best and worst rank under all points, rules alone and phrases alone. Claude Opus 4 ranks 2nd on rules and 20th on phrases; GPT-5 ranks 17th and 3rd. Claude Fable 5.2 holds 2nd or 3rd and Claude Opus 5.5 holds 3rd to 5th. The rule for lists of three carries 41% of the models' rule points, from 13% to 68% by model.

### The human row

People rank first under every scoring, because the checker is built from what separates models from people. The row shows that the checker works; people entered no contest. The curated rules were written after reading all of Graphite's data, so the human lead runs somewhat high.

## Limits across layers

Graphite's test covers one genre, web articles; chat replies, code comments and UI copy have no matched human baseline yet.

The atlas axes come from 2025–26 vocabulary. RAID models sit on them relative to their own human texts, but their phrases sit where 2025–26 usage puts them, often far from the model's marker. RAID's genres also differ from Graphite's.

Shibbo's counts split text at sentence ends and line breaks, while Graphite's don't, so a few listed figures differ slightly. Tell pages keep Graphite's figure where Graphite lists one and fill the rest from shibbo's count, marked †.

Code habits are measured from one-shot API replies, and conduct from Claude Code transcripts of Claude models only (see above); neither has a human baseline. Interface pages have no human baseline (see above).

No layer measures how clear the work is. The checker lists the [Say it clearly](/concepts/clarity) questions for a reader and can't score them.

A score describes the tells in a draft. It can't say who wrote the draft, so treat shibbo as an editor and never as a detector.
