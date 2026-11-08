# Claude Code

Claude Code supports every way shibbo plugs in, from the instructions file to hooks that run during a session.

## Plugin (recommended)

```text
/plugin marketplace add xvr2e7/shibbo
/plugin install shibbo@shibbo
```

The plugin bundles the engine and data, so nothing else needs installing. It adds:

- **At session start:** the ten tells the session's model over-uses most, ranked from measured rates.
- **After each Write or Edit** to a doc, page, stylesheet or component: a check of only the text that edit wrote. Hits go back to Claude with their fixes, and Claude fixes them in the same turn. Code files are left alone.
- **When Claude finishes:** a check of the final reply. If a reply of 60 words or more scores under 50 with three or more hits, Claude is asked to rewrite it once. It never asks twice in a row.
- **The MCP server** and a `shibbo` skill that loads when you ask Claude to clean up writing.

## Without the plugin

```bash
npx shibbo init claude
```

This writes a rule block into `CLAUDE.md`, the server into `.mcp.json`, and the three hooks into `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "npx shibbo hook session-start", "timeout": 10 }] }],
    "PostToolUse": [{ "matcher": "Write|Edit|MultiEdit", "hooks": [{ "type": "command", "command": "npx shibbo hook post-edit", "timeout": 15 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "npx shibbo hook stop", "timeout": 15 }] }]
  }
}
```

## How feedback reaches Claude

The after-edit hook answers with `hookSpecificOutput.additionalContext`, which Claude Code adds next to the tool result. The reply hook answers with `{"decision": "block", "reason": ...}` and respects `stop_hook_active`, so it can't loop.

## Settings

| Variable | Default | Effect |
|---|---|---|
| `SHIBBO_EDIT` | `on` | `off` stops the after-edit check |
| `SHIBBO_STOP` | `block` | `warn` notes hits without asking for a rewrite; `off` skips the check |
| `SHIBBO_STOP_SCORE` | `50` | Reply score that triggers a rewrite |
| `SHIBBO_DISABLE` | none | Tell ids to skip, comma-separated |
| `SHIBBO_MODEL` | from the session | Force the rules for one model |

Sources: [memory](https://code.claude.com/docs/en/memory), [MCP](https://code.claude.com/docs/en/mcp), [hooks](https://code.claude.com/docs/en/hooks).
