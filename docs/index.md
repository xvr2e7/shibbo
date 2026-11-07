# What shibbo does

<!-- shibbo-ignore-next-line -->
Shibbo catches the patterns that make writing and interfaces read as machine-made, and tells you what to write instead. It knows which model you're working with, because each model family has its own habits: Claude Opus 5 leans on “genuinely”, GPT-6 Astra on “rather than treating”, older GPT releases on em dashes.

It has three parts that share one registry of tells:

| Part | What it does | Where you meet it |
|---|---|---|
| Rules | A short list of the tells your model over-uses, with fixes, for its instructions file | `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, and the rest |
| Checker | Scores a draft from 0 to 100 and names each hit with its fix | The command line, an MCP tool, editor hooks, CI |
| Registry | 50 tells, each with evidence and per-model measurements | `data/tells.yaml`, browsable in the [field guide](/../#/tells) |

The rules steer the model before it writes. The checker catches what slips through after. You can use either one alone.

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
