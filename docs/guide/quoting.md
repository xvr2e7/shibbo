# Quote a tell on purpose

Writing about AI writing means quoting tells. Wrap the quote so it doesn't count against you:

```markdown
<!-- shibbo-ignore -->
"Delve" gave away GPT-4 in 2024.
<!-- /shibbo-ignore -->
```

For a single line:

```markdown
<!-- shibbo-ignore-next-line -->
Opus models over-use "less like X and more like Y".
```

The same comments work in HTML. Every report prints how many hits these blocks held back, so a reviewer can see how much was set aside:

```text
README.md: 100/100 [clean] (656 words, 5 hits in shibbo-ignore blocks)
```

Keep the blocks tight around the quote. A block around a whole section hides your own writing too.
