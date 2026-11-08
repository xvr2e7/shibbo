# What shibbo does

<!-- shibbo-ignore-next-line -->
Shibbo catches the patterns that make writing and interfaces read as machine-made, and tells you what to write instead. It knows which model you're working with, because each model family has its own habits: Claude Opus 5 leans on “genuinely”, GPT-6 Astra on “rather than treating”, older GPT releases on em dashes.

It has three parts that share one registry of tells:

| Part | What it does | Where you meet it |
|---|---|---|
| Rules | A short list of the tells your model over-uses, with fixes, for its instructions file | `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, and the rest |
| Checker | Scores a draft from 0 to 100 and names each hit with its fix | The command line, an MCP tool, editor hooks, CI |
| Registry | Every tell, each with its sources, and per-model rates where measured | `data/tells.yaml`, browsable in the [field guide](/../#/tells) |

The rules steer the model before it writes. The checker catches what slips through after. You can use either one alone.

## Prior art

Many people have catalogued AI tells, each for one kind of work: Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) for prose, checkers such as [avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) and [slop-score](https://github.com/sam-paech/slop-score), design lists such as [Hallmark](https://github.com/Nutlope/hallmark) and [no-slop-ui](https://github.com/LeoStehlik/no-slop-ui), and studies such as Graphite's [AI Tells](https://graphite.io/research/ai-tells). Shibbo aims to be one source of truth across them. It gathers their findings into one registry, checks them against measured data where that exists, and dates and cites every entry. [Sources](/concepts/sources) lists all of them, from measured studies to agent bug reports.

## Who it's for

- People who write with an AI assistant and want to keep their own voice.
- Teams whose docs, changelogs, PR descriptions or landing pages go through an agent.
- Anyone running an agent harness who wants its prose held to a standard, the way a linter holds its code to one.

## What it won't do

Shibbo doesn't decide whether a person or a model wrote something. A clean score means the draft avoids the known tells. It says nothing about authorship, and plenty of human writing trips a rule or two. Use it as an editor, never as a detector.

## Next

- [Quick start](/guide/quick-start): check a file in under a minute.
- [How it fits your harness](/guide/how-it-fits): the three places shibbo plugs in.
- [Harness support table](/harnesses/): setup for Claude Code, Codex, Cursor, Copilot, Gemini CLI and more.
