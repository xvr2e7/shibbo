# Node API

```bash
npm install shibbo
```

```ts
import { check, rulesMarkdown, interfaceMarkdown, tells, resolveModel } from "shibbo";

const report = check(pageSource, "landing.html", { model: "gemini-4-argon" });
console.log(report.score, report.band);
for (const f of report.findings.filter((f) => f.counted)) {
  console.log(`${f.line}:${f.col} ${f.id} "${f.match}" → ${f.fix ?? f.name}`);
}

const block = rulesMarkdown({ model: "gpt-6.1-sol", limit: 10 });
```

## check(text, file?, options?)

`file` sets the file kind from its extension (`"-"` means plain text), which decides the tells that run: prose, interface or code. Options:

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

- `rulesMarkdown({ model, domains, limit, phrases, agentLimit, clarity })` returns the rule block as Markdown. It opens with the [Say it clearly](/concepts/clarity) section unless `clarity` is `false`, and lists `agentLimit` agent habits (default 6).
- `interfaceMarkdown({ limit })` returns the rules for interface work: what to settle before building, then the commonest interface tells.
- `rank(options)` returns the ranked tells behind that block.
- `tells()`, `models()`, `sources()`, `graphite()` return the registry and measurements.
- `resolveModel(id)` maps any model id to a measured model, or `null`.
