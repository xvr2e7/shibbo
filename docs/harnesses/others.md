# Other harnesses

These all read `AGENTS.md`, so `npx shibbo export agents` gives them the rules. `npx shibbo init <id>` adds the MCP server where the harness has a project file.

## Kiro

`init kiro` writes `AGENTS.md`, `.kiro/settings/mcp.json`, and an experimental hook in `.kiro/hooks/shibbo.json` that fires on `PostFileSave` for Markdown and HTML. A command hook's output on exit 0 goes into the agent's context. Kiro doesn't document the payload of a save event, so shibbo checks the prose files changed in the working tree. Kiro's own steering files live in `.kiro/steering/`. Sources: [steering](https://kiro.dev/docs/steering/), [MCP](https://kiro.dev/docs/mcp/configuration/), [hooks](https://kiro.dev/docs/hooks/types/).

## JetBrains Junie

`init junie` writes `AGENTS.md` and `.junie/mcp/mcp.json`. Junie CLI reads hooks only from your user config, `~/.junie/config.json`; add a `PostToolUse` hook running `npx shibbo hook post-edit --for junie`. Its feedback channel matches Claude Code's (`additionalContext`). Sources: [guidelines](https://junie.jetbrains.com/docs/guidelines-and-memory.html), [MCP](https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html), [hooks](https://junie.jetbrains.com/docs/junie-cli-hooks.html).

## Amp

`init amp` writes `AGENTS.md` and adds the server under `amp.mcpServers` in `.amp/settings.json`. Approve it once with `amp mcp approve shibbo`. Amp has plugins rather than hooks; a `tool.result` plugin can append shibbo's output to what the model sees. Sources: [AGENTS.md](https://ampcode.com/docs/customize/agents-md), [MCP](https://ampcode.com/docs/customize/mcp), [plugins](https://ampcode.com/docs/customize/plugins).

## OpenCode

Rules come from `AGENTS.md`. Add the server with `opencode mcp add shibbo -- npx shibbo mcp`. OpenCode's plugins and formatters can run a command after edits, but its docs don't confirm that their output reaches the model, so shibbo doesn't rely on them. Sources: [rules](https://docs.opencode.ai/docs/rules/), [MCP](https://opencode.ai/docs/mcp-servers/).

## Goose

Goose reads `AGENTS.md` and `.goosehints`. Add shibbo as an extension: `goose session --with-extension "npx shibbo mcp"`, or under `extensions` in `~/.config/goose/config.yaml`. Goose only logs the output of its after-edit hooks, so it can't feed findings back; rely on the rules and the MCP tool. Sources: [goosehints](https://goose-docs.ai/docs/guides/context-engineering/using-goosehints), [extensions](https://goose-docs.ai/docs/getting-started/using-extensions).

## Zed

Zed reads the first file it finds among `.rules`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`, `AGENT.md`, `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`. Put the rules in whichever of those your project already has. Add the server to your settings:

```json
{ "context_servers": { "shibbo": { "command": "npx", "args": ["shibbo", "mcp"], "env": {} } } }
```

Zed has no hooks. Sources: [instructions](https://zed.dev/docs/ai/instructions.md), [MCP](https://zed.dev/docs/ai/mcp.md).

## Continue

`init continue` writes `.continue/rules/shibbo.md` and `.continue/mcpServers/shibbo.yaml`. MCP works in agent mode only. Continue has no documented hooks. Sources: [rules](https://docs.continue.dev/customize/deep-dives/rules), [MCP](https://docs.continue.dev/customize/deep-dives/mcp).

## Warp

Warp's default project rules file is `AGENTS.md`. `init warp` writes it and `.warp/.mcp.json`. Warp also picks up MCP servers from Claude Code and Codex config files. It has no hooks. Sources: [MCP](https://docs.warp.dev/agents/capabilities/mcp.md).
