# Node API

```bash
npm install shibbo
```

```ts
import { check, rulesMarkdown, tells, resolveModel } from "shibbo";

const report = check(markdownText, "post.md", { model: "claude-opus-5-5" });
console.log(report.score, report.band);
for (const f of report.findings.filter((f) => f.counted)) {
  console.log(`${f.line}:${f.col} ${f.id} "${f.match}" → ${f.fix ?? f.name}`);
}

const block = rulesMarkdown({ model: "gpt-6", limit: 10 });
```

## check(text, file?, options?)

`file` sets the file kind from its extension (`"-"` means plain text). Options:

| Option | Type | Does |
|---|---|---|
| `model` | `string \| null` | The writing model |
| `kind` | `"markdown" \| "text" \| "html" \| "css" \| "markup-code" \| "code"` | Override the kind |
| `disable` | `string[]` | Tell ids to skip |
| `only` | `string[]` | Run only these tell ids |
| `lexicon` | `boolean` | `false` turns off measured phrases |
| `domains` | `string[]` | Override which domains apply |

Returns a [report](/reference/report).

## Other exports

- `rulesMarkdown({ model, domains, limit, phrases })` returns the rule block as Markdown.
- `rank(options)` returns the ranked tells behind that block.
- `tells()`, `models()`, `sources()`, `graphite()` return the registry and measurements.
- `resolveModel(id)` maps any model id to a measured model, or `null`.
