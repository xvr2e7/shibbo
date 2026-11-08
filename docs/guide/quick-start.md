# Quick start

You need Node.js 20 or later.

## Check a file

```bash
npx shibbo check README.md
```

```text
README.md: 51/100 [moderate] (167 words)
  3:60     high contrastive-negation     "isn't just a tool, it's"
                → State the real claim. Keep a contrast only when someone holds the other view.
  13:17    low  measured                 "useful"
                → "useful" (GPT-6 Astra uses it 17× as often as human writers)
  21:126   med  x-matters                "that distinction matters"
                → Show what goes wrong without it. Readers will see that it matters.
```

Each line gives the position, the weight, the tell's id and the matched text, then the fix. Lines marked `measured` come from phrases one model writes many times as often as people do. [Read a report](/guide/reading-reports) explains the rest.

## Tell it which model wrote the text

```bash
npx shibbo check post.md --model claude-opus-5-5
```

The checker then gives that model's own habits more weight. Model ids from your harness work as they are. Newer or smaller models that shibbo hasn't measured borrow the data of the nearest measured model in the same family.

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
