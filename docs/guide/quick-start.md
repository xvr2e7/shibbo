# Quick start

You need Node.js 20 or later.

## Check a file

```bash
npx shibbo check README.md
```

```text
README.md: 62/100 [light] (412 words)
  3:41     high contrastive-negation     "isn't just a tool, it's"
                → State the real claim. Keep a contrast only when someone holds the other view.
  9:12     med  genuinely                "genuinely"
                → Delete it. If the claim needs it to be believed, add evidence instead.
  14:1     low  measured                 "that distinction matters"
                → "that distinction matters" (GPT-6 Astra used it 564 times in Graphite's articles; people, never)
```

Each line gives the position, the weight, the tell's id and the matched text, then the fix. Lines marked `measured` come from phrases one model writes many times as often as people do. [Read a report](/guide/reading-reports) explains the rest.

## Tell it which model wrote the text

```bash
npx shibbo check post.md --model claude-opus-5-5
```

The checker then gives that model's own habits more weight. Model ids from your harness work as they are; newer ids resolve to the nearest measured model in the same family.

## Give your agent the rules up front

```bash
npx shibbo rules --model gpt-6
```

This prints a short block, ranked by what that model over-uses most. Paste it into your instructions file, or let `shibbo export` write it for you:

```bash
npx shibbo export agents --model gpt-6   # writes a marked block into AGENTS.md
```

Running the export again replaces its own block and leaves the rest of the file alone.

## Next

Set up your harness so this happens on every edit: [support table](/harnesses/).
