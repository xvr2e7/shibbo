# Scoring

## Hits and weights

Each curated tell has a severity: 3 for high, 2 for medium, 1 for low, 0 for advice that never scores. A hit adds its severity to the penalty. Measured phrases add 0.5, 1 or 1.5, depending on how far the measuring model exceeded people (under 25 times, 25 to 100 times, over 100). When you name the writing model and shibbo has measured it, its own phrases weigh 8 times as much. An unmeasured model borrows the rule order of the newest measured model in its family and gets no extra weight, since a sibling's phrases are a guess.

Some tells only count past a rate. One “crucial” in a long page adds nothing; two in 300 words do. The rate scales with length and never drops below the stated count.

## From penalty to score

```text
per1k = penalty / max(words, 150) × 1000
score = 100 × 0.5 ^ (per1k / 33.96)
```

Every 34 points per 1,000 words halves the score. The constant comes from the evaluation's training half, where it was set so that 90% of human articles score 80 or more. That run used a phrase list built from the training half alone, and the shipped checker uses the full list, so the 90% holds only roughly for the checker you install. Short texts count as at least 150 words, so one hit in a sentence doesn't sink the score.

## Files that aren't prose

Interface and code rules read the whole file, so their hits count against every word in it, markup and code included:

```text
per1k = prose penalty / max(prose words, 150) × 1000
      + interface and code penalty / max(all words, 150) × 1000
```

A stylesheet or source file has no prose, so only the second line applies. A page has both. The scale was set on web articles, and no human-built pages or human-written code have been scored, so a band means less there: read the hits.

Behavior has no score, since no file records how an agent worked. The [Say it clearly](/concepts/clarity) questions have none either; the report lists them and leaves the answers to a reader.

## Why these weights

The weights favor curated rules because each one was checked against human web articles: a common rule that fired on people nearly as often as on models was rewritten or set to severity 0. Rules too rare in web articles to judge, mostly patterns from chat replies, keep their weight, and a few that people also use, such as `vague-authority` and `colon-reveal`, still score. Measured phrases are weaker evidence one at a time but add up; on held-out articles they carry most of the signal. [Data, tests and limits](/concepts/data) has the numbers.
