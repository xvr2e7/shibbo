# Quick start

You need Node.js 20 or later.

## Set up your agent

Run this from the root of your project:

```bash
npx shibbo init <harness>
```

Use the id of your harness: `claude`, `codex`, `cursor`, `copilot`, `gemini`, or one of [twelve more](/harnesses/). Add `--dry-run` to see what it would write, and `--model <id>` to tune the rules to the model you use:

```bash
npx shibbo init codex --model gpt-6.1-sol
npx shibbo init gemini --model gemini-4-argon --dry-run
```

`init` writes up to three things, depending on what the harness supports:

| What | Effect |
|---|---|
| A rule block in the instructions file | The agent reads how to [say it clearly](/concepts/clarity), then the writing tells its model over-uses and the agent habits to drop |
| The MCP server entry | The agent can check a draft and look up a tell |
| Hooks | Shibbo checks each edit, and in Claude Code and Gemini CLI the final reply |

It merges into files you already have, and your own hooks stay. Running it again replaces shibbo's block and leaves the rest alone.

## Check files

```bash
npx shibbo check src docs
```

The checker picks its rules from each file's type. A stylesheet or page gets interface tells, and a page's visible text gets prose tells too:

```text
landing.html: 17/100 [saturated] (19 words)
  5:8      med  inter-everywhere         "font-family: Inter"
                → Pair a display face with a text face, or commit to one with real weight contrast.
  6:21     low  gradient-135deg          "linear-gradient(135deg"
                → Use flat fills unless the gradient means something.
  7:54     low  same-soft-shadow         "rgba(0,0,0,.1)"
                → Pick border or shadow for an edge. Save shadow for things that float.
  12:7     med  marketing-verbs          "Supercharge"
                → Use the plain verb ("use", "speed up", "let you", "help").
  12:7     med  verb-your-workflow       "Supercharge your workflow"
                → Say what the product does for whom, with a number if you have one.
  13:17    med  invented-metrics         "10,000+ teams"
                → Cite a real figure, or cut the claim.
  13:35    high contrastive-negation     "isn't just a tool, it's"
                → State the real claim. Keep a contrast only when someone holds the other view.
```

A source file gets code tells:

```text
job.py: 66/100 [light] (3 words)
  8:5      med  defensive-swallow        "except Exception:\n        pass"
                → Let it raise, or catch the specific error you can handle.
  11:8     low  emoji-logs               "✅"
                → Plain text. Use exit codes and log levels.
```

Markdown and text get prose tells:

```text
notes.md: 36/100 [heavy] (39 words)
  3:14     high contrastive-negation     "isn't just a patch, it's"
                → State the real claim. Keep a contrast only when someone holds the other view.
  3:79     med  delve                    "delve"
                → Say what you will do ("look at", "compare", "list").
  5:41     med  x-matters                "That distinction matters"
                → Show what goes wrong without it. Readers will see that it matters.
  5:66     low  measured                 "for anyone"
                → "for anyone" (Claude Opus 4.6 uses it 9.6× as often as human writers)
```

Each hit gives the position, the weight, the tell's id and the matched text, then the fix. Lines marked `measured` are phrases one model writes many times as often as people do. [Read a report](/guide/reading-reports) explains the rest.

## Name the model

```bash
npx shibbo check notes.md --model gemini-4-argon
```

The checker then gives that model's own phrases more weight. Model ids from your harness work as they are. A model shibbo hasn't measured borrows the rule order of the newest measured model in its family, with no extra weight.

## Conduct

No file records how an agent worked, so the checker has no conduct score. Conduct tells reach the agent through the rules:

```bash
npx shibbo rules --model gpt-6.1-sol
```

The block ends its tell list with habits such as claiming that tests pass without running them, and its opening section says how to report: result first, in names the reader knows. Where the harness has a reply hook, shibbo also checks the final message for writing tells and asks for one rewrite when it scores under 50.

## Next

- [How it fits your harness](/guide/how-it-fits) shows where each piece runs.
- [Check in CI](/guide/ci) fails a pull request when a file scores too low.
- [Settings](/reference/settings) covers the hook switches and the log.
