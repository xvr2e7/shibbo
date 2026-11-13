import "@fontsource-variable/source-serif-4/standard.css";
import "@fontsource-variable/source-serif-4/standard-italic.css";
import "./styles/app.css";
import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AtlasPage } from "./routes/Atlas";
import { TellsPage, TellPage } from "./routes/Tells";
import { ModelsPage, ModelPage } from "./routes/Models";
import { DocsPage } from "./routes/Docs";

// Storage can be blocked (private mode, strict settings); the theme then follows the system.
let saved: string | null = null;
try { saved = localStorage.getItem("theme"); } catch { /* blocked */ }
document.documentElement.dataset.theme = saved ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** One bad record should cost a message, not a blank page. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <h1>This page failed to draw</h1>
        <p className="lede" style={{ marginTop: 16 }}><a href="./">Reload shibbo</a>, or <a href="https://github.com/xvr2e7/shibbo/issues">report it</a>.</p>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Guard>
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<AtlasPage />} />
          <Route path="tells" element={<TellsPage />} />
          <Route path="tells/:id" element={<TellPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="models/:id" element={<ModelPage />} />
          <Route path="layers/:layer?" element={<LayersRedirect />} />
          <Route path="docs/*" element={<DocsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
    </Guard>
  </StrictMode>,
);

/** The layers prototype now lives on the Tells page; old #/layers links land on the matching layer. */
function LayersRedirect() {
  const { layer } = useParams();
  const known = ["prose", "code", "interface"].includes(layer ?? "");
  return <Navigate to={known ? `/tells?layer=${layer}` : "/tells"} replace />;
}

function NotFound() {
  return (
    <div className="page">
      <h1>No page here</h1>
      <p className="lede" style={{ marginTop: 16 }}>
        The link may point to a tell that was renamed. Start from the <a href="#/tells">list of tells</a>.
      </p>
    </div>
  );
}
