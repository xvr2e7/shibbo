# Get started

Shibbo checks your writing for the patterns readers now spot as machine-made, using measured rates for each model. Start in whichever tool you write in.

## In a terminal

```bash
npx shibbo check README.md
```

You get a score from 0 to 100 and a list of hits, each with a fix. A score of 80 or more counts as clean. Point it at a folder to check every doc, page and stylesheet inside.

```bash
npx shibbo check docs/ --threshold 80   # exit 1 if any file scores under 80
```

## In Claude Code

```text
/plugin marketplace add <owner>/shibbo
/plugin install shibbo@shibbo
```

From then on, Claude sees the tells its own model over-uses at the start of each session, and gets the hits back after it edits a doc, page or stylesheet. See [Claude Code](#/docs/claude-code).

## In any agent

Run `npx shibbo mcp` and add it as an MCP server. Agents can then call `check_text` on a draft before they show it to you. See [MCP](#/docs/mcp).

## What the score means

The score falls as hits pile up per 1,000 words. On Graphite's held-out articles, a model's article scored worse than a person's on the same topic 95 to 98 times in 100. One human article in nine still scores under 80, so treat a low score as a reason to reread the draft. [Method](#/docs/method) has the details.
