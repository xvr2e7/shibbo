import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// The docs are a VitePress build served at docs/. They run in a frame under the app's own header,
// with VitePress's top bar hidden, so the app keeps one header, one theme and one address bar.
// The frame reports each page it shows; the app mirrors it in the URL (#/docs/<page>) and sends the theme back.

const toSrc = (path: string, hash: string) => {
  const page = path.replace(/^\/docs\/?/, "").replace(/\/$/, "/index") || "index";
  return `docs/${page}.html${hash}`;
};

export function DocsPage() {
  const loc = useLocation();
  const nav = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const shown = useRef<string | null>(null);
  const anchor = new URLSearchParams(loc.search).get("h");
  const want = toSrc(loc.pathname, anchor ? `#${anchor}` : "");

  // Navigate the frame only when the app's URL asks for a page the frame isn't showing.
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const page = want.split("#")[0];
    if (shown.current !== page) {
      if (f.contentWindow && shown.current) f.contentWindow.location.replace(want);
      else f.src = want;
      shown.current = page;
    }
  }, [want]);

  useEffect(() => {
    const sendTheme = () => frame.current?.contentWindow?.postMessage({ type: "shibbo-theme", theme: document.documentElement.dataset.theme }, location.origin);
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "shibbo-docs-ready") sendTheme();
      if (e.data?.type === "shibbo-docs-nav") {
        const m = /\/docs\/(.*?)(?:\.html)?$/.exec(String(e.data.path));
        const page = m ? m[1].replace(/(^|\/)index$/, "$1") : "";
        shown.current = toSrc(`/docs/${page}`, "").split("#")[0];
        const next = `/docs${page ? `/${page.replace(/\/$/, "")}` : ""}`;
        if (next !== loc.pathname) nav(next, { replace: true });
        document.title = e.data.title ? `${String(e.data.title).replace(/ \| shibbo docs$/, "")}, shibbo docs` : "shibbo docs";
      }
    };
    addEventListener("message", onMsg);
    const mo = new MutationObserver(sendTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      removeEventListener("message", onMsg);
      mo.disconnect();
    };
  }, [loc.pathname, nav]);

  useEffect(() => () => void (document.title = "shibbo"), []);

  return <iframe ref={frame} className="docs-frame" title="shibbo documentation" />;
}
