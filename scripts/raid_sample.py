# Sample matched RAID generations and their human source texts for tell-density scoring.
#
#   uv run --with pandas python -I scripts/raid_sample.py <raid-dir> <out.jsonl>
#
# Same filter as import_raid.py: attack-free split, sampling without repetition penalty, the seven genres.
# 700 generations per model, each paired with the human text it was prompted from.
import sys, json, pandas as pd
d, out = sys.argv[1], sys.argv[2]
MODELS = ["gpt3","chatgpt","gpt4","llama-chat","mistral-chat","mpt-chat","cohere-chat"]
GENRES = {"abstracts","books","news","recipes","reddit","reviews","wiki"}
cols = ["id","source_id","model","decoding","repetition_penalty","domain","generation"]
df = pd.concat([pd.read_csv(f"{d}/{n}", usecols=cols) for n in ("train_none.csv","extra_none.csv")])
df = df[df["domain"].isin(GENRES)]
human = df[df["model"]=="human"].set_index("id")["generation"]
with open(out,"w") as f:
    for m in MODELS:
        sub = df[(df["model"]==m)&(df["decoding"]=="sampling")&(df["repetition_penalty"]=="no")]
        sub = sub[sub["source_id"].isin(human.index)].sample(n=min(700,len(sub)), random_state=7)
        for _, r in sub.iterrows():
            f.write(json.dumps({"model": m, "text": str(r["generation"]), "human": str(human[r["source_id"]])})+"\n")
        print(m, len(sub), file=sys.stderr)
