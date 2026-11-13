# How it fits your harness

An agent harness gives you up to four places to step into the loop. Shibbo uses whichever your harness has, and `npx shibbo init <harness>` sets them up.

```text
   you ask ─▶ agent reads its rules ─▶ edits a file ─▶ sends its reply ─▶ you review / CI
                      ▲                      │                │                  │
                 1. rules              2. edit check    3. reply check      4. CI check
```

## 1. Rules before the work

Every harness reads a project instructions file: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CONVENTIONS.md` and so on. `init` writes a marked block into it with three lists:

1. How to [say it clearly](/concepts/clarity), in files and in reports.
2. The writing tells the chosen model over-uses most, with a fix for each.
3. Six agent habits to drop, such as claiming success without a test run.

In Claude Code, a session-start hook loads the same block for the session's own model and adds rules for interface work. Those open with what to settle before the first line of markup: start from the subject, throw out the idea any similar brief would get, and use only facts you were given. The twelve commonest interface tells follow.

Rules cost nothing at run time, but models still slip. The checks catch what gets through.

## 2. A check after each edit

Where the harness can run a command after an edit, shibbo checks the file and hands the hits in the new text back to the agent, which fixes them in the same turn. The check covers Markdown, text, HTML, CSS and component files (JSX, TSX, Vue, Svelte, Astro), so it catches interface tells as well as prose. It skips plain source files such as `.py` and `.ts`; run `shibbo check` on those yourself or in CI.

Codex, Gemini CLI and Cline have this hook too; Aider calls it a lint command. The [support table](/harnesses/) lists which harness has what.

## 3. A check on the final reply

Claude Code and Gemini CLI can run a command when the agent ends its turn. Shibbo scores the reply for writing tells. If a reply of 60 words or more scores under 50 with three or more hits, shibbo asks for one rewrite. It never asks twice in a row.

This check reads the wording of the reply. Set [`SHIBBO_JUDGE`](/reference/settings#a-judge-for-the-final-reply) and a small model also checks that the reply leads with its result and uses names the reader knows. Neither check can tell whether the reply's claims are true.

## 4. A check in CI

Whatever the harness, `shibbo check --threshold 80` in CI keeps pages and docs from slipping. See [Check in CI](/guide/ci).

## When the harness has no hooks

`init` registers shibbo as an MCP server where it can, and the rule block asks the agent to call `check_text` on anything a person will read. Agents follow this well for long documents, less reliably for short replies. See [Any MCP client](/harnesses/mcp).

## Measure it on your own work

Set `SHIBBO_LOG=<file>`, and each hook check adds one JSON line there: the event, the model, the file, the word count, the score and the hits. A week of lines shows which tells your agent still writes and how often a reply was held. See [Settings](/reference/settings#log-each-check).
