# Devin Desktop (formerly Windsurf)

Windsurf is now Devin Desktop, and its docs moved to docs.devin.ai. The old Cascade hooks and `~/.codeium` paths no longer appear in the docs.

```bash
npx shibbo init devin
```

## What it writes

Rules go into `AGENTS.md`, which Devin Desktop reads natively alongside `.devin/rules/*.md` and the legacy `.windsurf/rules/`. The MCP server goes into `.devin/mcp_config.json` with the usual `mcpServers` shape, and an experimental hook into `.devin/hooks.v1.json`, in Claude Code's format:

```json
{ "PostToolUse": [{ "matcher": "write|edit|apply_patch", "hooks": [{ "type": "command", "command": "npx shibbo hook post-edit --for devin" }] }] }
```

## How feedback reaches the agent

Shibbo answers with `{"decision": "block", "reason": ...}`, which Devin shows to the agent. Devin Desktop also imports Claude Code's `.claude/settings.json` hooks, so `shibbo init claude` works here too. The field holding the file path isn't documented; shibbo tries `file_path`, then `path`.

Sources: [rules](https://docs.devin.ai/desktop/cascade/memories), [MCP](https://docs.devin.ai/cli/extensibility/mcp/configuration.md), [hooks](https://docs.devin.ai/cli/extensibility/hooks/overview.md).
