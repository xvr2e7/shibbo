# What shibbo does

A tell is a habit that marks work as machine-made. Shibbo keeps a registry of 374 tells, each with a date and its sources. They fall into four layers:

| Layer | Where it shows | Example | Tells |
|---|---|---|---|
| Prose | Docs, articles, chat replies | A stock phrase, or a view defined by the wrong view it replaces | 179 |
| Interface | Pages, stylesheets, components | Inter set everywhere; a made-up “10,000+ teams” | 121 |
| Code | Source files, tests, commits | A comment that narrates the edit; a blanket `except` | 44 |
| Behavior | How an agent works and reports | “All tests pass” with no test run | 30 |

Shibbo does two jobs with the registry.

## An atlas

The [atlas](/../#/) maps which models show which habits, release by release. Tells turn over fast, and each model family has its own, so a list from last year misses the newest ones. Shibbo compares prose with people writing on the same topics. For the other three layers, it gives all models the same fixed briefs and compares their answers. [Data, tests and limits](/concepts/data) says what each number rests on.

## A harness

`npx shibbo init <harness>` sets up a coding agent to avoid the tells while it works. The agent gets rules before it starts, and where the harness has hooks, a check after each edit and a check on its final reply. The rules open with a [Say it clearly](/concepts/clarity) section. A stock phrase gives text away, but the reader can still follow it. A draft with no tells can hide who did what and bury its point, and then the reader has to dig. So shibbo asks for clear work first. The tells for the chosen model come second, then the agent habits to drop.

## The parts

| Part | What it does | Where you meet it |
|---|---|---|
| Registry | Every tell with its fix and sources, plus per-model rates where measured | `data/tells.yaml`, `data/tells.d/`, the [field guide](/../#/tells) |
| Rules | How to say it clearly, then the tells your model over-uses, with fixes | `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the rest |
| Checker | Scores a file from 0 to 100 and names each hit with its fix | The command line, hooks, an MCP tool, CI |
| Hooks | Run the checker on each edit and on the final reply | Harnesses that support them; see the [support table](/harnesses/) |

Each part works alone.

## Prior art

Many people have catalogued AI tells, each for one kind of work: Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) for prose, checkers such as [avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) and [slop-score](https://github.com/sam-paech/slop-score), design lists such as [Hallmark](https://github.com/Nutlope/hallmark) and [no-slop-ui](https://github.com/LeoStehlik/no-slop-ui), and studies such as Graphite's [AI Tells](https://graphite.io/research/ai-tells). Shibbo aims to be one source of truth across them. It gathers their findings into one registry, checks them against measured data where that exists, and dates and cites every entry. [Sources](/concepts/sources) lists all of them, from measured studies to agent bug reports.

## Who it's for

- Teams that send pages, code, docs or pull requests through a coding agent and hold the output to a standard.
- People who write with an AI assistant and want to keep their own voice.
- Anyone choosing between models who wants to see how each one's habits changed across releases.

## What it won't do

Shibbo can't tell you who made something. A clean score means the file avoids the known tells. It says nothing about authorship, and plenty of human writing trips a rule or two. Use it as an editor, never as a detector.

The checker can't score how clear a text is either. It lists questions for a reader to answer, and the rules ask the agent to follow them.

## What's measured so far

- Prose has a human baseline: people's web articles on the same topics. Shibbo's own runs on newer models use about 290 topics each, against Graphite's 9,974.
- Interface and code have no human baseline. Their maps show how models differ from each other.
- Behavior maps one part of an agent's work, the final report: 23 models write up the same 12 finished work logs. A judge model decides whether each report tells the user what the log shows, and nobody has checked its verdicts by hand yet. What an agent does during the work has no map.

## Next

- [Quick start](/guide/quick-start): set up an agent, then check a file.
- [How it fits your harness](/guide/how-it-fits): the four places shibbo plugs in.
- [Say it clearly](/concepts/clarity): the rules that come before the tells.
- [Harness support table](/harnesses/): setup for 17 harnesses.
