# MCP tools

`npx shibbo mcp` serves four tools over stdio.

| Tool | Input | Returns |
|---|---|---|
| `check_text` | `text`; optional `model`, `kind` (`markdown`, `text`, `html`, `css`, `markup-code`, `code`) | Score, band, word count, up to 40 hits with fixes, and questions for a reader |
| `check_file` | `path`; optional `model` | The same for a file on disk |
| `rules` | optional `model`, `domains` | The model-ranked rule block |
| `tell` | `id` | The registry entry as JSON, with per-model measurements |

`check_text` treats input as Markdown unless `kind` says otherwise. The reader questions cover what patterns can't settle, such as whether a list of three needed all three items; an agent can answer them by rereading its draft.
