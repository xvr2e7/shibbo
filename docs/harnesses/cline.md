# Cline and Roo Code

## Cline

```bash
npx shibbo init cline
```

Rules go into `AGENTS.md`, which Cline reads natively along with `.clinerules/`. The hook is an executable script at `.clinerules/hooks/PostToolUse`:

```bash
#!/usr/bin/env bash
exec npx shibbo hook post-edit --for cline
```

Cline passes the edited path in `postToolUse.parameters.path`. Shibbo answers `{"cancel": false, "contextModification": ...}`, which the model sees on its next request. Turn hooks on in Cline's settings or with `cline config set hooks-enabled=true`.

Cline has no project-level MCP file. Add the server under MCP Servers → Configure with command `npx` and args `["shibbo", "mcp"]`.

Cline's own hooks page now points to SDK plugins; the file hooks above still exist in Cline's code and README.

## Roo Code

```bash
npx shibbo init roo
```

Roo Code reads `AGENTS.md` and takes MCP servers from `.roo/mcp.json`. It has no hooks, so the rule block asks the agent to call `check_text` itself. Roo Code's repository has been archived since May 2026.

Sources: [Cline rules](https://docs.cline.bot/customization/cline-rules), [Cline MCP](https://docs.cline.bot/mcp/configuring-mcp-servers), [Cline hooks README](https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md), [Roo instructions](https://roocodeinc.github.io/Roo-Code/features/custom-instructions), [Roo MCP](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo).
