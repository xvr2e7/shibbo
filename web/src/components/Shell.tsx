import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { data } from "../data";

export function Shell() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "light");
  const loc = useLocation();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!loc.pathname.startsWith("/docs")) window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <>
      <header className="top">
        <Link to="/" className="wordmark" aria-label="shibbo, home">
          shibbo
        </Link>
        <nav aria-label="Main">
          <NavLink to="/" end>Atlas</NavLink>
          <NavLink to="/tells">Tells</NavLink>
          <NavLink to="/models">Models</NavLink>
          <NavLink to="/docs">Docs</NavLink>
        </nav>
        <button className="btn theme" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="foot">
          <div className="inner">
            <p>
              Measurements from Graphite’s <a href={data.graphite.url}>“AI Tells”</a> (2026), {data.graphite.license}. Historical tells and release dates cite their own sources, all listed in{" "}
              <Link to="/docs/sources">Sources</Link>. Code under MIT.
            </p>
            <p>Built {data.built}</p>
          </div>
        </footer>
    </>
  );
}
