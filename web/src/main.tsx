import "@fontsource-variable/archivo/standard.css";
import "@fontsource-variable/source-serif-4/standard.css";
import "@fontsource-variable/source-serif-4/standard-italic.css";
import "./styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AtlasPage } from "./routes/Atlas";
import { TellsPage, TellPage } from "./routes/Tells";
import { ModelsPage, ModelPage } from "./routes/Models";

const saved = localStorage.getItem("theme");
document.documentElement.dataset.theme = saved ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<AtlasPage />} />
          <Route path="tells" element={<TellsPage />} />
          <Route path="tells/:id" element={<TellPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="models/:id" element={<ModelPage />} />
          <Route path="docs/*" element={<ToDocs />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);

/** Old in-app docs links now open the docs site. */
function ToDocs() {
  location.replace("docs/index.html");
  return null;
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
