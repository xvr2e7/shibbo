# How it fits your harness

Every agent harness, whether Claude Code, Codex, Cursor or Copilot, gives you some of the same three hooks into the loop. Shibbo uses whichever ones your harness has.

```text
   you ask ─▶ agent reads its instructions ─▶ writes a file ─▶ finishes the reply ─▶ you review / CI
                        ▲                            │                  │                 │
                   1. rules                     2. edit check      3. reply check     4. CI check
             (instructions file)          (hook, lint command, or MCP tool)        (shibbo check)
```

## 1. Rules in the instructions file

Every harness reads a project instructions file: `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `GEMINI.md` and so on. `shibbo export` writes a short, model-ranked rule block into it. This costs nothing at run time and prevents the most tells, but models still slip.

## 2. A check after each edit

Where the harness can run a command after the agent edits a file, shibbo checks the text that edit wrote and hands the hits back to the agent, which then fixes them in the same turn. Claude Code, Cursor, Gemini CLI and others call these hooks; Aider calls it a lint command. The [support table](/harnesses/) lists which harness has what.

## 3. A check when the agent finishes

Some harnesses can also run a command when the agent ends its turn. Shibbo checks the final reply and asks for one rewrite when it scores as heavy slop. It never asks twice in a row.

## 4. A check in CI

Whatever the harness, `shibbo check --threshold 80` in CI keeps docs and pages from regressing. See [Check in CI](/guide/ci).

## When the harness has no hooks

Register shibbo as an MCP server and add one line to the instructions file asking the agent to call `check_text` on prose before showing it to you. Agents follow this well for long writing, less reliably for short replies. See [Any MCP client](/harnesses/mcp).
