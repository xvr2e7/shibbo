# Settings

Shibbo reads environment variables; there's no config file.

| Variable | Used by | Default | Effect |
|---|---|---|---|
| `SHIBBO_MODEL` | `check`, `rules`, hooks | none | The model that writes, for model-ranked rules and phrase weights |
| `SHIBBO_DISABLE` | hooks | none | Tell ids to skip, comma-separated |
| `SHIBBO_EDIT` | hooks | `on` | `off` turns off the after-edit check |
| `SHIBBO_STOP` | hooks | `block` | `warn` notes reply hits without asking for a rewrite; `off` skips the reply check |
| `SHIBBO_STOP_SCORE` | hooks | `50` | Replies of 60+ words scoring under this, with 3+ hits, get one rewrite request |
| `NO_COLOR` | `check` | unset | Plain output |

## Turning off one tell

On the command line, `--disable id,id`. In hooks, `SHIBBO_DISABLE`. For a passage you're quoting, use an [ignore block](/guide/quoting).

## Model ids

Ids your harness reports work as they are. `shibbo resolve <id>` shows which measured model an id maps to: exact matches first, then known aliases, then the newest measured model in the same family.
