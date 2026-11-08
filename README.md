<h1 align="center"><i>shibbo</i></h1>

<p align="center">
  <b>Catch what gives AI work away, before anyone else does.</b><br>
  A field guide to AI tells, tracked model by model, with a checker for your own work.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-it-checks">What it checks</a> ·
  <a href="#the-atlas">The atlas</a> ·
  <a href="docs/guide/quick-start.md">Docs</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/atlas-dark.gif">
  <img width="720" alt="The shibbo atlas playing from November 2022 to November 2026: each model family's phrases spread across the map as new releases arrive and fade as newer ones replace them, with human writing on the far shore." src=".github/assets/atlas-light.gif">
</picture>
</p>

People have learned to spot AI work: a stock phrase in an essay, say, or a purple gradient on a landing page. Once they spot one, they trust the rest less.

<!-- shibbo-ignore -->
These tells shift with each release. In 2024, "delve" gave away GPT-4; today most models use it about as often as people do. Newer models have their own habits, such as Claude Opus 5's "genuinely useful" and GPT-6 Astra's "rather than treating", which people writing on the same topics never used. A list of tells from last year misses them.
<!-- /shibbo-ignore -->

Shibbo tracks each tell over time and measures which models over-use it. Run it on your work to see which ones show up.

The name comes from *shibboleth*: a small sign, like a word said wrong, that gives away where someone comes from.

## Quick start

```console
$ npx shibbo check draft.md --model gpt-6

draft.md: 17/100 [saturated] (29 words)
  1:1   high sycophantic-opener     "Great question"
          → Start with the answer.
  1:33  med  delve                  "delve"
          → Say what you will do ("look at", "compare", "list").
  1:44  med  x-matters              "why the distinction matters"
          → Show what goes wrong without it. Readers will see that it matters.
  3:4   high contrastive-negation   "is not a tool, it is"
          → State the real claim. Keep a contrast only when someone holds the other view.
  3:36  med  corrective-rather-than "Rather than treating"
          → Say what to do. Skip the straw version.
```

Each hit comes with a fix. `--model` weights the score toward the phrases that model over-uses, and `--threshold 80` fails a CI run when a file scores lower.

To catch tells while an agent works, set up its harness:

```bash
npx shibbo init <harness>
```

This adds shibbo's rules and checks to the harness, so the agent hears about tells as it edits. It works with Claude Code, Codex, Cursor, Copilot, Gemini CLI, Devin, Cline, Roo, Aider, Kiro, Junie, Amp, opencode, Goose, Zed, Continue and Warp.

## What it checks

| Files | Tells |
|---|---|
| Markdown, text | Stock phrases and "not X, it's Y" frames |
| HTML, SVG | Prose tells in the visible text; interface tells in the markup |
| CSS, Sass, Less | Purple gradients, or Inter set everywhere |
| JSX, TSX, Vue, Svelte, Astro | Interface and code tells |
| JS, TS, Python, Go, Rust, … | Comments that narrate the edit, or tests skipped to go green |

Agent tells, such as "All tests pass" without running them, happen during the work, so no file shows them. Shibbo puts the top ones in the agent's rules instead. Tells that need human judgment show up as questions: `check --all` and the MCP server list them.

## The atlas

The web app maps how machine writing has shifted with each release, on a timeline that cites every date back to 1966. Run it with `npm run web:dev`.

<table>
<tr>
<td width="50%">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/tells-dark.png">
  <img alt="The field guide: tells on five shelves, each card showing the tell as a small mockup with its fix." src=".github/assets/tells-light.png">
</picture>
<p><b>Tells.</b> Every tell, sorted by kind of work. Each card shows the tell itself, so an interface tell appears as a small mockup.</p>
</td>
<td width="50%">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/arena-dark.png">
  <img alt="The tell arena: human writing rated far ahead of every measured model." src=".github/assets/arena-light.png">
</picture>
<p><b>Arena.</b> Humans and models write on the same topics, and the article with fewer tells wins each round. Humans lead by a wide margin.</p>
</td>
</tr>
</table>

## The data

<!-- shibbo-ignore -->
| Tell | 2024 | 2026 |
|---|---|---|
| "delves" | 28× its expected rate in PubMed abstracts | under 2× the human rate in four of five models |
| Em dashes | GPT-4.1 and GPT-5: 2.2× the human rate | GPT-6 Astra 0.12×, Gemini 3.1 almost none |
| "not a _, it is" | | Claude Opus 5: 445 uses, people 1 |
| "that distinction matters" | | GPT-6 Astra: 564 uses, people 0 |
| "it's" | | people: 14,540 uses, Claude Opus 4.6: 7 |
<!-- /shibbo-ignore -->

Shibbo measures each model against people writing on the same topics. The data comes from Graphite's [AI Tells](https://graphite.io/research/ai-tells) study for 2025–26 models, and from shibbo's own runs on [RAID](https://github.com/liamdugan/raid) for 2022–23 chat models. Measurements of open-weight models are under way in [`measure/`](measure/HANDOFF.md).

To test the checker, shibbo scores a person's article and a model's article on the same topic, across topics it never trained on, and counts how often the model's scores worse. [The data docs](docs/concepts/data.md) have the latest results and their limits.

## Contributing

Each tell is a YAML entry in `data/tells.yaml` or `data/tells.d/`, with a fix and at least one source. The guides cover [adding a tell](docs/guide/add-a-tell.md) and [measuring a new model](docs/guide/measure.md).

```bash
npm install
npm test && npm run validate
npm run web:dev
```

## Credits

Most measurements come from Graphite's "AI Tells" (2026, CC BY 4.0); its article texts belong to their publishers and stay out of the repo. The PubMed figures come from [Kobak et al.](https://arxiv.org/abs/2406.07016) (2025). Every other source is listed in [`data/sources.yaml`](data/sources.yaml). The code is MIT-licensed, and the data keeps each source's license.
