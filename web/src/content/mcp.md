# MCP

```bash
npx shibbo mcp
```

Starts a stdio MCP server. Add it to any client that speaks MCP.

| Tool | Input | Returns |
|---|---|---|
| `check_text` | `text`, optional `model` and `kind` | Score, hits with fixes, and questions for a reader |
| `check_file` | `path`, optional `model` | The same, for a file on disk |
| `rules` | optional `model` and `domains` | The rule block for that model |
| `tell` | `id` | One registry entry with its measurements |

An agent does best when it calls `check_text` on any draft a person will read, fixes the hits, then answers the reader questions it returns, such as whether a list of three needed all three items.
