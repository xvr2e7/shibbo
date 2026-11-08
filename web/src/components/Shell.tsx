import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { flushSync } from "react-dom";
import { data } from "../data";

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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!inDocs) window.scrollTo(0, 0);
  }, [loc.pathname, inDocs]);

  // Switching themes reveals the new one as a circle growing from the switch (where View Transitions exist).
  const toggle = (ev: React.MouseEvent<HTMLButtonElement>) => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTheme(next);
      return;
    }
    const r = ev.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(() => {
      flushSync(() => setTheme(next));
      document.documentElement.dataset.theme = next;
    }).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 480, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" },
      );
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
        <button className="theme-switch" type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          <ThemeIcon dark={theme === "dark"} />
        </button>
      </header>
      <main id="main" className={inDocs ? "docs-main" : undefined}>
        <Outlet />
      </main>
      {!inDocs && (
        <footer className="foot">
          <div className="inner">
            <p>
              Measurements from Graphite’s <a href={data.graphite.url}>“AI Tells”</a> (2026), {data.graphite.license}. Historical tells and release dates cite their own sources, all listed in{" "}
              <Link to="/docs/concepts/sources">Sources</Link>. Code under MIT.
            </p>
            <p>Built {data.built}</p>
          </div>
        </footer>
      )}
    </>
  );
}
