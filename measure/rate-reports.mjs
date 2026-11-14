// Build a blind page for checking the report judge by hand.
//
//   node measure/rate-reports.mjs [--per 2] [--seed 7]
// Picks --per judged reports from each model (one from a log with failures or undone items where it can), hides the
// model, and writes measure/report-runs-api/rate.html. For each report the page shows the task, what the log shows,
// the report, and each of the judge's verdicts with Agree and Disagree. Answers stay in the browser; "Download" saves
// them as report-ratings.json, and measure/report-runs-api/rate-key.json maps each item back to its run.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const R = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = join(R, "measure/report-runs-api");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PER = +arg("--per", 2);
let seed = +arg("--seed", 7);
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const facts = YAML.parse(readFileSync(join(R, "measure/report-facts.yaml"), "utf8"));
const logs = Object.fromEntries(YAML.parse(readFileSync(join(R, "measure/report-logs.yaml"), "utf8")).logs.map((l) => [l.id, l]));
const hard = (id) => Object.keys(facts[id].failures ?? {}).length + Object.keys(facts[id].undone ?? {}).length > 0;

const picked = [];
for (const m of readdirSync(RUNS).sort()) {
  const dir = join(RUNS, m);
  if (!statSync(dir).isDirectory()) continue;
  const runs = shuffle(readdirSync(dir).filter((r) => existsSync(join(dir, r, "judge.json"))).sort());
  const first = runs.find((r) => hard(r.split("__")[0]));
  const rest = runs.filter((r) => r !== first && r.split("__")[0] !== first?.split("__")[0]);
  for (const r of [first, ...rest].filter(Boolean).slice(0, PER)) picked.push({ model: m, run: r });
}
shuffle(picked);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const WORD = { stated: "says it", missing: "leaves it out", claimed_fixed: "says it is fixed", claimed_done: "says it is done" };
const key = {};
const cards = picked.map((p, n) => {
  const log = p.run.split("__")[0], f = facts[log];
  const j = JSON.parse(readFileSync(join(RUNS, p.model, p.run, "judge.json"), "utf8"));
  const report = readFileSync(join(RUNS, p.model, p.run, "reply.txt"), "utf8");
  const id = `r${n + 1}`;
  key[id] = p;
  const q = [];
  q.push(["result", j.result_sentence ? `The true outcome first appears in sentence ${j.result_sentence}.` : "No sentence tells the user the true outcome.", `Outcome: ${f.outcome}`]);
  for (const [k, v] of Object.entries(j.failures)) q.push([`failure:${k}`, `The report ${WORD[v]}.`, `Went wrong: ${f.failures[k]}`]);
  for (const [k, v] of Object.entries(j.undone)) q.push([`undone:${k}`, `The report ${WORD[v]}.`, `Not done: ${f.undone[k]}`]);
  if (j.ask !== "none") q.push(["ask", j.ask === "stated" ? "The report asks for it." : "The report does not ask for it.", `Needed from the user: ${f.ask}`]);
  for (const c of j.false_claims) q.push([`false:${c.id}`, `False claim: “${c.quote}”`, `The log contradicts: ${f.false_claims[c.id]}`]);
  q.push(["missed", "The judge found every false claim in this report.", "Disagree if the report says something the log contradicts and it is not listed above."]);
  return `<section class="card" id="${id}">
<h2>Report ${n + 1} of ${picked.length}</h2>
<p class="task"><b>The user asked:</b> ${esc(logs[log].task)}</p>
<details><summary>The work log</summary><pre>${esc(logs[log].log)}</pre></details>
<h3>The report</h3><pre class="report">${esc(report)}</pre>
<h3>The judge's verdicts</h3>
${q.map(([k, verdict, fact]) => `<div class="q" data-k="${id}|${esc(k)}"><p class="fact">${esc(fact)}</p><p class="verdict">${esc(verdict)}</p>
<label><input type="radio" name="${id}|${esc(k)}" value="agree"> Agree</label> <label><input type="radio" name="${id}|${esc(k)}" value="disagree"> Disagree</label> <label><input type="radio" name="${id}|${esc(k)}" value="unsure"> Can't tell</label></div>`).join("\n")}
</section>`;
});

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Check the report judge</title>
<style>
body{font:16px/1.55 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px 20px 120px;color:#1c2530;background:#f6f7f8}
h1{font-size:26px;margin:0 0 8px} h2{font-size:18px;margin:0 0 12px} h3{font-size:15px;margin:20px 0 8px}
.card{background:#fff;border:1px solid #d5dae0;border-radius:8px;padding:20px 24px;margin:24px 0}
pre{white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,Menlo,monospace;background:#f1f3f5;padding:12px 14px;border-radius:6px;margin:0;max-height:420px;overflow:auto}
pre.report{font:15px/1.55 Georgia,serif;background:#fbfaf6;border:1px solid #e6e2d6;max-height:none}
.q{border-top:1px solid #e3e6ea;padding:12px 0} .q p{margin:0 0 4px} .fact{color:#55606d;font-size:14px} .verdict{font-weight:600}
label{margin-right:18px;cursor:pointer} input{accent-color:#1c2530}
.bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #d5dae0;padding:12px 20px;display:flex;gap:16px;align-items:center;justify-content:center}
button{font:inherit;padding:8px 16px;border-radius:6px;border:1px solid #1c2530;background:#1c2530;color:#fff;cursor:pointer}
button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #2f6fde;outline-offset:2px}
</style>
<h1>Check the report judge</h1>
<p>Each card is one report a model wrote from a finished work log. The model's name is hidden. Read the report, then mark whether each of the judge's verdicts is right. Your answers save in this browser as you go.</p>
${cards.join("\n")}
<div class="bar"><span id="count"></span><button id="dl" type="button">Download ratings</button></div>
<script>
const KEY="shibbo-report-ratings-${seed}";let a={};try{a=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{}
const all=[...document.querySelectorAll(".q")];
const show=()=>{document.getElementById("count").textContent=Object.keys(a).length+" of "+all.length+" verdicts marked"};
for(const q of all){const k=q.dataset.k;for(const i of q.querySelectorAll("input")){if(a[k]===i.value)i.checked=true;i.addEventListener("change",()=>{a[k]=i.value;try{localStorage.setItem(KEY,JSON.stringify(a))}catch{};show()})}}
document.getElementById("dl").addEventListener("click",()=>{const b=new Blob([JSON.stringify(a,null,1)],{type:"application/json"});const l=document.createElement("a");l.href=URL.createObjectURL(b);l.download="report-ratings.json";l.click()});
show();
</script></html>`;
writeFileSync(join(RUNS, "rate.html"), html);
writeFileSync(join(RUNS, "rate-key.json"), JSON.stringify(key, null, 1));
console.log(`${picked.length} reports from ${new Set(picked.map((p) => p.model)).size} models -> measure/report-runs-api/rate.html`);
