# GitHub Copilot

Covers agent mode in VS Code, the Copilot CLI and the cloud coding agent.

```bash
npx shibbo init copilot
```

## What it writes

The rules go into `AGENTS.md`. Copilot also reads `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` with an `applyTo` glob.

The MCP server for VS Code goes into `.vscode/mcp.json`. Note the `servers` key and `type`:

```json
{ "servers": { "shibbo": { "type": "stdio", "command": "npx", "args": ["shibbo", "mcp"] } } }
```

The CLI doesn't read that file, so its server entry goes into `.mcp.json` with the usual `mcpServers` key.

An experimental hook goes into `.github/hooks/shibbo.json`, the one location the cloud agent reads:

```json
{ "version": 1, "hooks": { "postToolUse": [{ "type": "command", "bash": "npx shibbo hook post-edit --for copilot", "timeoutSec": 30 }] } }
```

## The cloud coding agent

Set its MCP server in the repo's settings, under Copilot, then MCP servers. It requires a `tools` list:

```json
{ "mcpServers": { "shibbo": { "type": "local", "command": "npx", "args": ["shibbo", "mcp"], "tools": ["*"] } } }
```

## How feedback reaches the agent

`postToolUse` returns `{"additionalContext": ...}`, which Copilot appends to the tool result. Exit code 2 is only a warning in Copilot, so shibbo always answers through stdout JSON. The name and argument shape of the edit tool aren't documented; shibbo reads the path from `toolArgs`, which is why the hook is marked experimental.

Sources: [custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions), [VS Code MCP](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [CLI MCP](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [hooks reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-hooks-reference).
