// Rendered specimens of interface tells. These reproduce the slop on purpose, so the checkers skip this file.
// <!-- shibbo-ignore -->
// avoid-ai-design-ignore-file (every block below is a specimen of a tell, shown on purpose; a bare ignore because the id list cannot name SD4d)
import type { ReactNode } from "react";

const frame = (children: ReactNode, style: React.CSSProperties = {}) => (
  <div className="ui-frame" style={style} aria-hidden="true">
    {children}
  </div>
);

const SPECIMENS: Record<string, () => ReactNode> = {
  "purple-gradient": () =>
    frame(
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.15, textShadow: "0 1px 2px rgba(0,0,0,.35)" }}>Build faster with AI</div>
        <div style={{ fontSize: 10, margin: "6px 0 10px", textShadow: "0 1px 2px rgba(0,0,0,.35)" }}>The all-in-one platform for modern teams</div>
        <span style={{ background: "#fff", color: "#5b21b6", borderRadius: 999, padding: "4px 12px", fontSize: 10, fontWeight: 700 }}>Get started</span>
      </div>,
      { background: "linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#db2777 100%)" },
    ),
  "tasteful-default": () =>
    frame(
      <div>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 18, color: "#2b2118", lineHeight: 1.15 }}>Thoughtfully made, for people who care</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <span style={{ background: "#ad4d2b", color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 10 }}>Begin</span>
          <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 9, color: "#7a6a5a", alignSelf: "center" }}>v2.0 / now shipping</span>
        </div>
      </div>,
      { background: "#f5f0e8", alignItems: "flex-start", textAlign: "left" },
    ),
  "inter-everywhere": () =>
    frame(
      <div style={{ fontFamily: "Inter, system-ui, sans-serif", color: "#111827", textAlign: "left", width: "100%" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Dashboard</div>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>Revenue overview</div>
        <div style={{ fontSize: 10, fontWeight: 400, color: "#6b7280", marginTop: 4 }}>One family, one weight band, every size.</div>
      </div>,
      { background: "#ffffff", alignItems: "flex-start" },
    ),
  "hero-pill-badge": () =>
    frame(
      <div style={{ textAlign: "center" }}>
        <span style={{ border: "1px solid #e5e7eb", borderRadius: 999, padding: "2px 9px", fontSize: 9, color: "#4b5563" }}>✨ Now with AI</span>
        <div style={{ fontWeight: 800, fontSize: 16, margin: "7px 0 4px", color: "#0f172a" }}>Ship 10x faster</div>
        <div style={{ fontSize: 9, color: "#64748b", marginBottom: 8 }}>Everything you need, nothing you don’t</div>
        <span style={{ background: "#0f172a", color: "#fff", borderRadius: 6, padding: "3px 9px", fontSize: 9, marginRight: 6 }}>Start free</span>
        <span style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "3px 9px", fontSize: 9 }}>Book a demo</span>
      </div>,
      { background: "#fff" },
    ),
  "three-feature-cards": () =>
    frame(
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, width: "100%" }}>
        {["Fast", "Secure", "Scalable"].map((t, i) => (
          <div key={t} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 7, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: ["#818cf8", "#a78bfa", "#f472b6"][i], marginBottom: 5 }} />
            <div style={{ fontSize: 9, fontWeight: 700, color: "#111" }}>{t}</div>
            <div style={{ fontSize: 7.5, color: "#6b7280", marginTop: 2 }}>Lorem ipsum dolor sit amet consectetur.</div>
          </div>
        ))}
      </div>,
      { background: "#f9fafb" },
    ),
  glassmorphism: () =>
    frame(
      <>
        <div style={{ position: "absolute", width: 90, height: 90, borderRadius: "50%", background: "#a855f7", filter: "blur(22px)", left: 20, top: 10, opacity: 0.8 }} />
        <div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", background: "#22d3ee", filter: "blur(22px)", right: 30, bottom: 6, opacity: 0.8 }} />
        <div style={{ position: "relative", padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.35)", backdropFilter: "blur(10px)", color: "#fff", fontSize: 11 }}>
          ✨ <b>AI Insights</b>
          <div style={{ fontSize: 9, opacity: 0.85 }}>Your metrics, reimagined</div>
        </div>
      </>,
      { background: "#1e1b4b", position: "relative", overflow: "hidden" },
    ),
  "gradient-text": () =>
    frame(
      <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.1, textAlign: "center", background: "linear-gradient(90deg,#6366f1,#ec4899)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        The future of work is here
      </div>,
      { background: "#fff" },
    ),
  "dot-separator-meta": () =>
    frame(
      <div style={{ textAlign: "left", width: "100%" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>Why design systems matter</div>
        <div style={{ fontSize: 9.5, color: "#6b7280", marginTop: 5 }}>5 min read · Design · Oct 2026</div>
        <div style={{ fontSize: 9.5, color: "#6b7280", marginTop: 8 }}>Engineering · Tooling · 12 comments</div>
      </div>,
      { background: "#fff" },
    ),
  "emoji-bullets": () =>
    frame(
      <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 10.5, textAlign: "left", lineHeight: 1.7, color: "#111" }}>
        <li>🚀 Blazing-fast performance</li>
        <li>✅ Easy to set up</li>
        <li>💡 Smart suggestions</li>
        <li>🔥 Loved by developers</li>
      </ul>,
      { background: "#fff" },
    ),
  "title-case-headings": () =>
    frame(<div style={{ fontWeight: 700, fontSize: 14, color: "#111", textAlign: "left" }}>The Ultimate Guide To Writing Better Product Docs</div>, { background: "#fff" }),
};

const CODE: Record<string, string[]> = {
  "emoji-logs": ["$ npm run build", "🚀 Starting build...", "✅ Compiled 42 modules!", "🎉 Done in 3.2s ✨"],
  "narrating-comments": ["# Step 1: Initialize the counter", "count = 0", "# Loop through items", "for item in items:", "    # Increment count", "    count += 1"],
  "defensive-swallow": ["try:", "    data = load(path)", "except Exception:", "    pass  # ignore errors", "return None"],
  "speculative-abstraction": ["class ExporterFactory:", "    def create(self, kind='csv'):", "        return CsvExporter()", "", "# the only caller", "ExporterFactory().create()"],
};

export function hasUiSpecimen(id: string) {
  return id in SPECIMENS || id in CODE;
}

export function UiSpecimen({ id }: { id: string }) {
  if (SPECIMENS[id]) return <>{SPECIMENS[id]()}</>;
  if (CODE[id])
    return (
      <pre className="code-specimen" aria-hidden="true">
        {CODE[id].map((l, i) => (
          <span key={i} className={/[🚀✅🎉✨]|# (Step|Loop|Increment|Initialize)|except Exception|pass|Factory/.test(l) ? "hit" : undefined}>
            {l || " "}
            {"\n"}
          </span>
        ))}
      </pre>
    );
  return null;
}
// <!-- /shibbo-ignore -->
