# Cursor

```bash
npx shibbo init cursor
```

## What it writes

The rules go into `AGENTS.md`, which Cursor reads natively, including nested files. If you prefer Cursor's own format, `npx shibbo export cursor` writes `.cursor/rules/shibbo.mdc` with `alwaysApply: true`. The MCP server goes into `.cursor/mcp.json`:

```json
{ "mcpServers": { "shibbo": { "type": "stdio", "command": "npx", "args": ["shibbo", "mcp"] } } }
```

And an experimental hook goes into `.cursor/hooks.json`:

```json
{ "version": 1, "hooks": { "postToolUse": [{ "matcher": "Write", "command": "npx shibbo hook post-edit --for cursor" }] } }
```

## How feedback reaches the agent

Cursor's `afterFileEdit` hook can't send anything back, so shibbo uses `postToolUse`, which returns `{"additional_context": ...}` after the tool result. Cursor documents that event's `tool_input` only in general terms; shibbo looks for the path under `file_path`, `path` or `target_file`. If the hook stays quiet after an edit, the rule block still tells the agent to call `check_text`.

Sources: [rules](https://cursor.com/docs/context/rules), [MCP](https://cursor.com/docs/context/mcp), [hooks](https://cursor.com/docs/agent/hooks).
