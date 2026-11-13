import icons from "../data/icons.json";

const ICONS = icons as Record<string, string>;

/** Map a lab or maker name (or a measured family id) to an icon key. */
export function brandOf(lab = ""): string {
  const l = lab.toLowerCase();
  if (l === "gpt" || l.includes("openai")) return "openai";
  if (l === "claude" || l.includes("anthropic")) return "anthropic";
  if (l.includes("gemma")) return "gemma";
  if (l === "gemini" || l.includes("google") || l.includes("deepmind")) return "google";
  if (l.includes("meta") || l.includes("facebook")) return "meta";
  if (l.includes("mistral")) return "mistral";
  if (l.includes("deepseek")) return "deepseek";
  if (l.includes("alibaba") || l.includes("qwen")) return "qwen";
  if (l.includes("xai") || l.includes("x.ai") || l.includes("grok")) return "xai";
  if (l.includes("microsoft")) return "microsoft";
  if (l.includes("moonshot") || l.includes("kimi")) return "moonshot";
  if (l.includes("zhipu") || l.includes("z.ai") || l.includes("glm")) return "zhipu";
  if (l.includes("minimax")) return "minimax";
  if (l.includes("cohere")) return "cohere";
  if (l.includes("01.ai") || l === "yi") return "yi";
  if (l.includes("nvidia") || l.includes("nemotron")) return "nvidia";
  if (l.includes("amazon") || l.includes("aws")) return "amazon";
  if (l.includes("apple")) return "apple";
  if (l.includes("technology innovation") || l.includes("tii")) return "tii";
  if (l.includes("xiaomi") || l.includes("mimo")) return "xiaomi";
  if (l.includes("tencent") || l.includes("hunyuan")) return "tencent";
  if (l.includes("baidu") || l.includes("ernie")) return "baidu";
  if (l.includes("bytedance") || l.includes("doubao")) return "bytedance";
  if (l.includes("ibm")) return "ibm";
  if (l === "ai2" || l.includes("allen")) return "ai2";
  if (l.includes("ai21")) return "ai21";
  if (l.includes("liquid")) return "liquid";
  if (l.includes("stepfun")) return "stepfun";
  return "";
}

export function hasIcon(key: string) {
  return !!ICONS[key];
}

/** An inline brand mark. Decorative by default; pass a label when the icon stands alone. */
export function BrandIcon({ brand, size = 16, label }: { brand: string; size?: number; label?: string }) {
  const svg = ICONS[brand];
  if (!svg) {
    return (
      <span className="brand-icon fallback" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-label={label} aria-hidden={label ? undefined : true}>
        {(label ?? brand ?? "?").slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span
      className="brand-icon"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Data URL of a brand mark, for drawing on canvas. */
export function iconUrl(brand: string): string | null {
  const svg = ICONS[brand];
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace("<svg ", '<svg width="64" height="64" '))}` : null;
}
