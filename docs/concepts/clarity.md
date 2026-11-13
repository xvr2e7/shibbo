# Clarity

<!-- shibbo-ignore-next-line -->
Surface marks such as “delve” or an em dash give text away. They aren't what makes it hard to read. A draft can avoid every stock phrase and still leave its reader to work out who did what, what a term means, or where the answer is.

So the registry has a clarity group of five entries, and the rules shibbo hands an agent open with them, ahead of any list of tells. The group draws on Joseph Williams's *Style* and on Zonder Labs's [Slop](https://zonderlabs.com/slop) (November 2026), which marked unclear passages in AI articles and Claude Code output against Williams's principles.

## Three faults in prose

### The hidden actor

The sentence turns its verb into a noun and drops the person who acts.

<!-- shibbo-ignore -->
| Before | After |
|---|---|
| Upon arrival at the counter, a request for a refund was made. | She walked up to the counter and asked for a refund. |
<!-- /shibbo-ignore -->

Make the actor the subject and the action the verb.

### Unnatural wording

An odd pairing of words, a stack of nouns or a made-up term stands where a common name exists.

<!-- shibbo-ignore -->
| Before | After |
|---|---|
| The kids opened a beverage retailer on the corner. | The kids opened a lemonade stand on the corner. |
<!-- /shibbo-ignore -->

Use the name people use, and unpack a stack of nouns into a clause.

### The buried point

Every word is plain, but the answer comes in the last line or never comes.

<!-- shibbo-ignore -->
| Before | After |
|---|---|
| There are several factors worth weighing here, and the picture is nuanced. Ultimately the cache is the cause. | The cache is the cause. |
<!-- /shibbo-ignore -->

Put the point first, and cut each sentence that adds no fact.

## Two faults in reports

An agent's final message has the same faults in its own forms.

**A report that retells the work before the result.** Asked “Did the import fix work?”, the agent walks through the loader, the parser and the fixtures, and says “The import now runs” last. Lead with the result. Then say what you checked, what you left undone, and what you need from the reader.

**Names the reader never saw.** The agent coins labels while it works (“Phase 2”, “the B-path fallback”) and reports in them as if the reader shared them. Say the longer thing the label stands for, or define it once.

## Why patterns can't find them

A tell such as a stock phrase has a fixed form, so a pattern matches it. These faults have none. A passive sentence can be the right choice when nobody knows the actor. A noun stack can be a term of art the reader knows. A story holds its point back on purpose. Deciding takes a reader who knows the subject and the audience.

## How shibbo uses them

Rules come first. Every rule block from `shibbo rules`, `shibbo init`, `shibbo export` and the session-start hook opens with a “Say it clearly” section built from these five entries, with the fix and example for each. The tells follow.

In reports, the three prose entries appear as questions to answer by reading:

```text
judge    hidden-actor: In each sentence, is the one who acts the subject and the action the verb?
judge    unnatural-wording: Would a person describing this out loud use these words for it?
judge    buried-point: Does the first sentence give the point, and does each later sentence add a fact the reader needs?
```

`shibbo check --all` prints them, the MCP tools return them with every check, and the JSON report holds them under `judge`.

## A judge for the final reply

The reply hook can put all five questions to a small model. This is off by default. Set [`SHIBBO_JUDGE`](/reference/settings#a-judge-for-the-final-reply) to a provider and a model, and the hook sends each final reply of 80 words or more, with the five questions, to that model. The judge must quote the words that show a fault, and shibbo drops any fail whose quote the reply doesn't hold.

Shibbo asks the agent for one rewrite when the reply buries its result, or when it fails two or more questions. The note looks like this:

```text
shibbo: a reader would trip on this reply (a report that retells the work before the result). Rewrite it before finishing:
- "I began by opening the upload handler" (report-buries-result) → State in the first sentence what changed and whether it worked.
Open with something like: Wide photos now upload without being squashed, and all 31 tests pass.
```

A judge that times out or errors holds nothing.

## Limits

The checker can't score clarity, and a file can score 100 and fail all three questions. `shibbo check` and the edit hook never call a model. Without a judge set, no hook holds a reply for an unclear report, and the two report entries reach the agent through the rules alone.

A judge is a model reading once. It can pass a muddled reply or fail a clear one, and shibbo hasn't yet measured how often it does either.

Shibbo hasn't measured how often any model commits these faults. The entries carry `confidence: medium` and rest on the two sources above.
