import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { flushSync } from "react-dom";

type Theme = "light" | "dark";

/** Sun and moon drawn from one circle: the mask slides in to carve a crescent, the rays fold away. */
function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg className={`theme-icon${dark ? " is-dark" : ""}`} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <mask id="theme-moon">
        <rect x="0" y="0" width="24" height="24" fill="#fff" />
        <circle className="bite" cx="24" cy="4" r="7" fill="#000" />
      </mask>
      <circle className="body" cx="12" cy="12" r="5" mask="url(#theme-moon)" fill="currentColor" />
      <g className="rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={12 + Math.cos(a) * 8} y1={12 + Math.sin(a) * 8} x2={12 + Math.cos(a) * 10} y2={12 + Math.sin(a) * 10} />;
        })}
      </g>
    </svg>
  );
}

/** A plain sliding switch: the knob slides across and the sun turns into a moon. */
function ThemeToggle({ dark, onChange }: { dark: boolean; onChange: (dark: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      title={dark ? "Switch to light" : "Switch to dark"}
      className={`theme-toggle${dark ? " is-dark" : ""}`}
      onClick={() => onChange(!dark)}
    >
      <span className="knob" aria-hidden="true"><ThemeIcon dark={dark} /></span>
    </button>
  );
}

const REPO = "https://github.com/xvr2e7/shibbo";

const TABS = [
  { to: "/", label: "Map", match: (p: string) => p === "/" },
  { to: "/tells", label: "Tells", match: (p: string) => p.startsWith("/tells") },
  { to: "/models", label: "Models", match: (p: string) => p.startsWith("/models") },
];

/** The three views, underlined by one bar that slides to the active tab. */
function Tabs({ path }: { path: string }) {
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const active = TABS.findIndex((t) => t.match(path));
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelectorAll("a")[active] as HTMLElement | undefined;
      setBar(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    place();
    document.fonts?.ready.then(place);
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [active]);
  return (
    <nav ref={nav} aria-label="Main" className="tabs">
      {TABS.map((t, i) => (
        <Link key={t.to} to={t.to} aria-current={i === active ? "page" : undefined}>{t.label}</Link>
      ))}
      <span className="tab-bar" aria-hidden="true" style={bar ? { transform: `translateX(${bar.x}px)`, width: bar.w } : { opacity: 0 }} />
    </nav>
  );
}

export function Shell() {
  const [theme, setTheme] = useState<Theme>((document.documentElement.dataset.theme as Theme) ?? "light");
  const loc = useLocation();
  const inDocs = loc.pathname.startsWith("/docs");
  const onMap = loc.pathname === "/";
  // The map fills the window, so the page under it must not scroll; the map keeps its own zoom and pan.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-fixed", onMap || inDocs);
  }, [onMap, inDocs]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* storage blocked */ }
  }, [theme]);
  useEffect(() => {
    if (!inDocs) window.scrollTo(0, 0);
  }, [loc.pathname, inDocs]);

  // The new theme fades in over the old one (where View Transitions exist); the switch carries the motion.
  const setThemeSoftly = (next: Theme) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { setTheme(next); return; }
    doc.startViewTransition(() => {
      flushSync(() => setTheme(next));
      document.documentElement.dataset.theme = next;
    });
  };

  return (
    <>
      <header className="top">
        <Link to="/" className="wordmark" aria-label="shibbo, home">
          shibbo
        </Link>
        <Tabs path={loc.pathname} />
        <NavLink to="/docs" className="docs-link">Docs</NavLink>
        <a className="repo-link" href={REPO} aria-label="shibbo on GitHub" title="shibbo on GitHub">
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
        <ThemeToggle dark={theme === "dark"} onChange={(d) => setThemeSoftly(d ? "dark" : "light")} />
      </header>
      <main id="main" className={inDocs ? "docs-main" : undefined}>
        <Outlet />
      </main>
      {!inDocs && (
        <footer className={onMap ? "foot foot-map" : "foot"}>
          <p>
            © 2026 Ziyan Xie. <a href={`${REPO}/blob/main/LICENSE`}>MIT license</a>.
          </p>
        </footer>
      )}
    </>
  );
}
