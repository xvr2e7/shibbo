# Scoring

## Hits and weights

Each curated tell has a severity: 3 for high, 2 for medium, 1 for low, 0 for advice that never scores. A hit adds its severity to the penalty. Measured phrases add 0.5, 1 or 1.5, depending on how far the measuring model exceeded people (under 25 times, 25 to 100 times, over 100). When you name the writing model, its own measured phrases weigh 8 times as much.

Some tells only count past a rate. One “crucial” in a long page adds nothing; two in 300 words do. The rate scales with length and never drops below the stated count.

## From penalty to score

```text
per1k = penalty / max(words, 150) × 1000
score = 100 × 0.5 ^ (per1k / 33.96)
```

Every 34 points per 1,000 words halves the score. The constant comes from the evaluation's training half, where it was set so that 90% of human articles score 80 or more. That run used a phrase list built from the training half alone, and the shipped checker uses the full list, so the 90% holds only roughly for the checker you install. Short texts count as at least 150 words, so one hit in a sentence doesn't sink the score.

## Why these weights

The weights favor curated rules because each one was checked against human web articles: a common rule that fired on people nearly as often as on models was rewritten or set to severity 0. Rules too rare in web articles to judge, mostly patterns from chat replies, keep their weight, and a few that people also use, such as `vague-authority` and `colon-reveal`, still score. Measured phrases are weaker evidence one at a time but add up; on held-out articles they carry most of the signal. [Data, tests and limits](/concepts/data) has the numbers.
