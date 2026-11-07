# Gemini CLI

```bash
npx shibbo init gemini
```

## What it writes

- **Rules:** `GEMINI.md`. Gemini CLI doesn't read `AGENTS.md` unless you add it to `context.fileName` in settings.
- **MCP and hooks:** both in `.gemini/settings.json`:

```json
{
  "mcpServers": { "shibbo": { "command": "npx", "args": ["shibbo", "mcp"] } },
  "hooks": {
    "AfterTool": [
      { "matcher": "write_file|replace",
        "hooks": [{ "name": "shibbo-check", "type": "command", "command": "npx shibbo hook post-edit --for gemini", "timeout": 30000 }] }
    ],
    "AfterAgent": [
      { "hooks": [{ "name": "shibbo-reply", "type": "command", "command": "npx shibbo hook stop --for gemini", "timeout": 30000 }] }
    ]
  }
}
```

## How feedback reaches the agent

After `write_file` or `replace`, shibbo answers with `hookSpecificOutput.additionalContext`, which Gemini appends to the tool result. When the agent finishes, shibbo checks `prompt_response` and, for heavy slop, answers `{"decision": "deny", "reason": ...}`, which asks for a retry with that reason. It skips the check when `stop_hook_active` is set.

## Note

For unpaid-tier and Google One users, Google replaced Gemini CLI with Antigravity CLI on 18 June 2026. The setup above applies to Gemini CLI.

Sources: [GEMINI.md](https://geminicli.com/docs/cli/gemini-md/), [MCP](https://geminicli.com/docs/tools/mcp-server/), [hooks reference](https://geminicli.com/docs/hooks/reference/).
