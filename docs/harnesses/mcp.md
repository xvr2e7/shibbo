# Any MCP client

```bash
npx shibbo mcp
```

Starts a stdio MCP server. Most clients take the same entry:

```json
{ "mcpServers": { "shibbo": { "command": "npx", "args": ["shibbo", "mcp"] } } }
```

The tools are listed in the [MCP reference](/reference/mcp).

## Getting the agent to use it

An MCP tool only helps if the agent calls it. Add this line to your instructions file (`shibbo export` and `shibbo init` add it for you):

```text
After writing prose a person will read (docs, READMEs, PR text, UI copy), call the shibbo
check_text tool or run `npx shibbo check <file>`, and fix what it reports.
```

Agents follow this well for documents and less reliably for short chat replies. Where your harness has hooks, prefer them, since a hook runs every time.
