# MCP tools

`npx shibbo mcp` serves four tools over stdio. All four are read-only and say so in their annotations (`readOnlyHint`), so a client can see that none of them changes anything.

| Tool | Input | Returns |
|---|---|---|
| `check_text` | `text`; optional `model`, `kind` (`markdown`, `text`, `html`, `css`, `markup-code`, `code`) | Score, band, word count, up to 40 hits with fixes, and questions to judge by reading |
| `check_file` | `path`; optional `model` | The same for a file on disk, read by its extension |
| `rules` | optional `model`, `domains` | The rule block: a “Say it clearly” section, then tells ranked for the model |
| `tell` | `id` | The registry entry as JSON, with per-model measurements |

`check_text` treats input as Markdown unless `kind` says otherwise. Pass `html`, `css` or `markup-code` to check a page or component for interface tells, and `code` for code tells.

`check_file` reads any path you pass, so give the server only to agents you'd let read those files.

The questions cover what patterns can't settle: the three questions from [Say it clearly](/concepts/clarity), and others such as “are three-item lists used where one or two items would carry the point?”. An agent can answer them by rereading its draft.
