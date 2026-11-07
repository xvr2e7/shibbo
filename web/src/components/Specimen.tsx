// Renders a tell's specimen from the registry: an HTML mockup (in a shadow root, so its styles stay inside),
// code lines with the offending ones marked, or a short exchange with an agent.
// <!-- shibbo-ignore -->
import { useEffect, useRef } from "react";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/playfair-display/wght-italic.css";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import type { Tell } from "../data";
import { UiSpecimen, hasUiSpecimen } from "./UiSpecimens";

// Specimens name fonts as people write them; the bundled variable fonts register as "<name> Variable".
const FONTS = ["Inter", "Geist Mono", "Geist", "JetBrains Mono", "Playfair Display", "Fraunces", "Space Grotesk", "DM Sans", "Manrope"];
const fontRe = new RegExp(`(["'])(${FONTS.join("|")})\\1`, "g");
const clean = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/url\(\s*['"]?(?:https?:)?\/\/[^)]*\)/gi, "none")
    .replace(fontRe, (_m, q, f) => `${q}${f} Variable${q}, ${q}${f}${q}`);

function Html({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{all:initial;display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;font-family:system-ui,sans-serif;color:#111827;box-sizing:border-box}*{box-sizing:border-box}</style>${clean(html)}`;
  }, [html]);
  return <div ref={host} className="ui-frame html" aria-hidden="true" />;
}

function Code({ lines, hit = [] }: { lines: string[]; hit?: number[] }) {
  return (
    <pre className="code-specimen" aria-hidden="true">
      {lines.map((l, i) => (
        <span key={i} className={hit.includes(i) ? "hit" : undefined}>
          {l || " "}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function Chat({ turns }: { turns: Array<{ role: string; text: string }> }) {
  return (
    <div className="chat-specimen" aria-hidden="true">
      {turns.slice(0, 3).map((t, i) => (
        <p key={i} className={t.role === "user" ? "u" : "a"}>
          {t.text}
        </p>
      ))}
    </div>
  );
}

export function hasSpecimen(t: Tell) {
  return hasUiSpecimen(t.id) || !!(t.specimen?.html || t.specimen?.code?.length || t.specimen?.chat?.length);
}

export function Specimen({ t }: { t: Tell }) {
  if (hasUiSpecimen(t.id)) return <UiSpecimen id={t.id} />;
  const s = t.specimen;
  if (s?.html) return <Html html={s.html} />;
  if (s?.code?.length) return <Code lines={s.code} hit={s.hit} />;
  if (s?.chat?.length) return <Chat turns={s.chat} />;
  return null;
}
// <!-- /shibbo-ignore -->
