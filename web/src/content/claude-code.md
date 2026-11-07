# Claude Code

The plugin lives in `plugins/shibbo` and runs without an install step: the engine and data ship bundled.

```text
/plugin marketplace add <owner>/shibbo
/plugin install shibbo@shibbo
```

## What it does

At session start, it adds the ten tells your model over-uses most to Claude's context, ranked from measured rates.
<!-- shibbo-ignore-next-line -->
Opus models get warned about "less like X and more like Y"; GPT models about "rather than treating".

After each Write or Edit to a doc, page, stylesheet or component, it checks only the text that edit wrote and hands any hits back to Claude with their fixes. Code files are left alone.

When Claude ends a reply of 60 words or more that scores under 50 with three or more hits, it asks for one rewrite. It never asks twice in a row.

## Settings

| Variable | Default | Effect |
|---|---|---|
| `SHIBBO_EDIT` | `on` | `off` stops the after-edit check. |
| `SHIBBO_STOP` | `block` | `warn` notes the hits without asking for a rewrite; `off` skips the check. |
| `SHIBBO_STOP_SCORE` | `50` | The reply score that triggers a rewrite. |
| `SHIBBO_DISABLE` | none | Tell ids to skip, comma-separated. |
| `SHIBBO_MODEL` | from the session | Force the rules for one model. |

The plugin also registers the MCP server. Its `shibbo` skill loads when you ask Claude to clean up writing.
