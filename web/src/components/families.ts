// One table for model families: colour, name and icon, whichever id a data file uses (family or maker).
// A new maker needs one row here and one colour in app.css (both themes).
const TABLE: Record<string, { name: string; brand: string }> = {
  gpt: { name: "OpenAI", brand: "openai" },
  claude: { name: "Claude", brand: "anthropic" },
  gemini: { name: "Gemini", brand: "google" },
  gemma: { name: "Gemma", brand: "gemma" },
  deepseek: { name: "DeepSeek", brand: "deepseek" },
  qwen: { name: "Qwen", brand: "qwen" },
  glm: { name: "GLM", brand: "zhipu" },
  grok: { name: "Grok", brand: "xai" },
  moonshot: { name: "Kimi", brand: "moonshot" },
  minimax: { name: "MiniMax", brand: "minimax" },
  mimo: { name: "MiMo", brand: "xiaomi" },
  nemotron: { name: "Nemotron", brand: "nvidia" },
  meta: { name: "Meta", brand: "meta" },
  mistral: { name: "Mistral", brand: "mistral" },
  mosaic: { name: "MPT", brand: "" },
  cohere: { name: "Cohere", brand: "cohere" },
};
const ALIAS: Record<string, string> = { openai: "gpt", anthropic: "claude", google: "gemini", zhipu: "glm", xai: "grok", xiaomi: "mimo", nvidia: "nemotron", alibaba: "qwen", kimi: "moonshot" };

/** The family id the colour table knows, or "other". */
export const canon = (f: string | null | undefined): string => {
  const k = (f ?? "").toLowerCase();
  const c = ALIAS[k] ?? k;
  return TABLE[c] ? c : "other";
};
/** Families in display order. */
export const FAM_ORDER = Object.keys(TABLE);
export const famVar = (f: string | null | undefined) => `--${canon(f)}`;
export const famColor = (f: string | null | undefined) => `var(${famVar(f)})`;
export const famName = (f: string | null | undefined) => TABLE[canon(f)]?.name ?? (f ? f[0].toUpperCase() + f.slice(1) : "Other");
export const famBrand = (f: string | null | undefined) => TABLE[canon(f)]?.brand ?? "";
/** Every family colour variable, for canvases that read colours once. */
export const FAM_VARS = [...FAM_ORDER.map((f) => `--${f}`), "--other"];
/** Sort families by the table's order; unknown ones last. */
export const byFamily = (a: string, b: string) => (FAM_ORDER.indexOf(canon(a)) + 1 || 99) - (FAM_ORDER.indexOf(canon(b)) + 1 || 99);
