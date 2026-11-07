# Data, tests and limits

## Where the measurements come from

| Era | Source | Design | Models |
|---|---|---|---|
| 2025 to 2026 | Graphite, AI Tells (CC BY 4.0) | 9,984 human web articles from before Nov 2022; each model wrote one article per topic from the same summary | GPT-4.1, GPT-5, GPT-5.6 Sol, GPT-6 Astra, Claude Opus 4, 4.6 and 5, Gemini 2.5 Pro and 3.1 Pro |
| 2022 to 2023 | RAID (Dugan et al., ACL 2024; MIT), measured by shibbo | 11,600 generations per model across 7 genres, each compared with the human text it was prompted from | text-davinci-003, ChatGPT (GPT-3.5), GPT-4, Llama 2 70B Chat, Mistral 7B Instruct, MPT-30B Chat, Cohere Command |
| 2023 to 2024 | Cited studies | Excess-word counts in published papers and reviews | Whole corpora, without model labels |

The texts behind both measured sources stay local; only derived rates are published. When people never used a phrase, the ratio is undefined, so shibbo reports the raw counts (“411 vs 0”).

## The held-out test

Topics split in half by a hash of the URL. The phrase list, score scale and model weighting came from the training half; results come from the other 5,044 topics. A model's article scored worse than a person's on the same topic 95 to 98 times in 100, with one human article in nine still under 80. The curated rules alone reached 0.67 to 0.89; they were written after reading Graphite's full tell lists, so those numbers run high. Naming the model ranks articles better (0.976 to 0.992) but flags about one human article in four, because the score scale wasn't refit for that mode.

## Limits

Graphite's test covers one genre, web articles; chat replies, code comments and UI copy have no matched human baseline yet.

The atlas axes come from 2025–26 vocabulary. RAID models are projected onto them, which understates how far their own words set them apart from people, and RAID's genres also differ from Graphite's.

Interface and code tells are documented, with no per-model measurements yet.

A score describes the tells in a draft. It can't say who wrote the draft, so treat shibbo as an editor and never as a detector.
