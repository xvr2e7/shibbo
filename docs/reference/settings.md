# Settings

Shibbo reads environment variables; there's no config file.

| Variable | Used by | Default | Effect |
|---|---|---|---|
| `SHIBBO_MODEL` | `check`, `rules`, hooks | none | The model that writes, for model-ranked rules and phrase weights |
| `SHIBBO_DISABLE` | hooks | none | Tell ids to skip, comma-separated |
| `SHIBBO_EDIT` | hooks | `on` | `off` turns off the after-edit check |
| `SHIBBO_STOP` | hooks | `block` | `warn` notes reply hits without asking for a rewrite; `off` skips the reply check |
| `SHIBBO_STOP_SCORE` | hooks | `50` | Replies of 60+ words scoring under this, with 3+ hits, get one rewrite request |
| `SHIBBO_JUDGE` | reply hook | unset | A provider and model, such as `openai:<model>`, that reads each long reply for clarity |
| `SHIBBO_LOG` | hooks | unset | A file path; each hook check adds one JSON line to it |
| `SHIBBO_LOG_TEXT` | hooks | unset | `1` adds the reply's text to its log line |
| `NO_COLOR` | `check` | unset | Plain output |

## Log each check

Set `SHIBBO_LOG` to a file path to measure the harness on your own work. The after-edit hook adds a line for each file it checks, and the reply hook adds a line for each reply of 60 words or more:

```json
{"at":"2026-11-13T01:46:31.843Z","event":"edit","model":"gemini-4-argon","file":"/repo/docs/intro.md","words":412,"score":91,"hits":["x-matters","phrase:for anyone"]}
{"at":"2026-11-13T01:52:10.270Z","event":"reply","model":"gpt-6.1-sol","words":85,"score":15,"hits":["sycophantic-opener","contrastive-negation","delve"],"held":true}
{"at":"2026-11-13T02:30:23.999Z","event":"reply","model":null,"words":122,"score":100,"hits":[],"held":true,"judge":{"failed":["buried-point","report-buries-result"]}}
```

| Field | Meaning |
|---|---|
| `at` | Time of the check, in UTC |
| `event` | `edit` or `reply` |
| `model` | The session's model as the harness reported it, or `null` |
| `file` | The edited file (`edit` lines only) |
| `words`, `score` | Word count and score of the whole file or reply |
| `hits` | Ids of the scored hits; a measured phrase reads `phrase:<text>`. For an edit, only hits in the new text |
| `held` | `true` when shibbo asked for a rewrite (`reply` lines only) |
| `judge` | With a judge set and a reply of 80+ words: `{"failed": [ids]}`, or `null` when the judge gave no verdict |
| `judge_error` | Why the judge gave no verdict, such as `HTTP 404` and the start of the provider's answer |
| `text` | The reply, when `SHIBBO_LOG_TEXT=1` |

Shibbo creates the file's folder if it's missing. A log that can't be written never stops a hook. The log holds file paths, and reply text if you ask for it, so keep it out of version control.

## A judge for the final reply

The reply check reads wording. It can't see that a report retells the work and names its result last. Set `SHIBBO_JUDGE` and a small model answers the five [clarity](/concepts/clarity) questions about each final reply.

| Value | Key read from the environment |
|---|---|
| `anthropic:<model>` | `ANTHROPIC_API_KEY` |
| `openai:<model>` | `OPENAI_API_KEY` |
| `openrouter:<model>` | `OPENROUTER_API_KEY` |

Shibbo ships no default model, so the judge stays off until you name one. It reads keys from the environment only and never opens a `.env` file. To use one, load it in the hook command:

```sh
set -a; [ -f .env ] && . ./.env; set +a; SHIBBO_JUDGE=openai:<model> npx shibbo hook stop
```

The judge runs when the wording check passes a reply of 80 words or more. Shibbo asks for one rewrite when the reply buries its result (`report-buries-result`), or when it fails two or more questions. The note quotes the words that show each fault, gives a fix, and offers a sentence to open with. `SHIBBO_STOP=warn` and `off` apply as they do to the wording check.

Each reply costs one request, sent straight to the provider you named. It holds a fixed prompt, the five questions and the reply text. Shibbo cuts the middle from a reply over 12,000 characters. It sends no file, path, session id or earlier message.

A 300-word reply comes to about 1,000 tokens in and 200 out. On a model priced at $1 and $5 per million tokens, that is about a fifth of a cent per reply.

A judge that fails never holds a reply. The call stops after 8 seconds. After a timeout, a missing key, a refused model id or an answer that isn't the JSON shibbo asked for, the hook lets the reply through and logs `judge: null`. A fail counts only when the judge quotes words that appear in the reply.

## Turning off one tell

On the command line, `--disable id,id`. In hooks, `SHIBBO_DISABLE`. For a passage you're quoting, use an [ignore block](/guide/quoting).

## Model ids

Ids your harness reports work as they are. `shibbo resolve <id>` shows which measured model an id maps to: exact matches first, then known aliases, then the newest measured model in the same family.
