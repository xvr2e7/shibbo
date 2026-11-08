# Measure a new model

Tells turn over fast: between a family's two newest versions, 39 to 54% of the newer model's tells are new. When a model ships, measure it.

## 1. Build the human baseline (once)

```bash
npx tsx measure/analyze.ts --baseline <ai_tells_articles.jsonl.gz>
```

This counts word sequences in the human half of Graphite's articles and keeps the counts in `.cache/`. The articles belong to their publishers, so neither they nor the counts are committed.

## 2. Generate outputs

```bash
npm run measure -- --model claude-opus-5-5
```

This sends 30 fixed article prompts (`measure/prompts.yaml`) to the model, about 40,000 output tokens, and saves the replies to `measure/runs/<model>/<date>.jsonl`. It needs `ANTHROPIC_API_KEY`. For other providers, save outputs in the same JSONL shape (`{"model","topic","text","stop_reason"}`) with their own tools and skip to step 3.

## 3. Analyze

```bash
npm run analyze -- measure/runs/claude-opus-5-5/*.jsonl
```

The report in `measure/reports/` has three tables: each registry tell's rate against people and against the previous model in the family; candidate new tells (phrases in at least a tenth of the outputs at 8× the human rate or more); and old tells the model dropped.

## 4. Review

New candidates go to a person before they enter the registry. The prompts match Graphite's genre (web articles) but not its topics, and 30 articles is a small sample, so treat small ratios with caution. The `measure` workflow in `.github/workflows` runs steps 1 to 3 and opens a pull request with the report.
