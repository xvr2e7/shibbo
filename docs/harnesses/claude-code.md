# Claude Code

Claude Code supports every way shibbo plugs in, from the instructions file to hooks that run during a session.

## Plugin (recommended)

```text
/plugin marketplace add xvr2e7/shibbo
/plugin install shibbo@shibbo
```

The plugin bundles the engine and data, so nothing else needs installing. It adds the MCP server and three hooks. Its `shibbo` skill loads when Claude writes for a reader or builds a page.

| When | What shibbo does |
|---|---|
| Session start | Loads the [Say it clearly](/concepts/clarity) rules, the ten writing tells the session's model over-uses most, six agent habits to drop, and the rules for interface work |
| After each Write or Edit | Checks a doc, page, stylesheet or component and reports hits in the text that edit wrote. Claude gets each hit with its fix and repairs it in the same turn. Plain source files are skipped |
| When Claude finishes | Checks the final reply. If a reply of 60 words or more scores under 50 with three or more hits, shibbo asks Claude to rewrite it once, and never twice in a row |

## Without the plugin

```bash
npx shibbo init claude
```

This writes a rule block into `CLAUDE.md` and the server into `.mcp.json`. The three hooks go into `.claude/settings.json`, next to any hooks already there:

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
| `SHIBBO_LOG` | unset | A file that gets one JSON line per check; see [Settings](/reference/settings#log-each-check) |

Sources: [memory](https://code.claude.com/docs/en/memory), [MCP](https://code.claude.com/docs/en/mcp), [hooks](https://code.claude.com/docs/en/hooks).
