import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "@fontsource-variable/source-serif-4/standard.css";
import "./custom.css";

// Inside the app the docs run in a frame: hide VitePress's top bar, follow the app's theme,
// report each page so the app's URL matches, and open app links (../#/...) in the app itself.
const embedded = typeof window !== "undefined" && window.self !== window.top;

function setTheme(theme: string) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("vitepress-theme-appearance", dark ? "dark" : "light");
}

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    if (!embedded) return;
    document.documentElement.classList.add("embedded");
    const report = () => window.parent.postMessage({ type: "shibbo-docs-nav", path: location.pathname, title: document.title }, location.origin);
    const prev = router.onAfterRouteChange;
    router.onAfterRouteChange = (to) => {
      prev?.(to);
      setTimeout(report, 0);
    };
    addEventListener("message", (e) => {
      if (e.origin === location.origin && e.data?.type === "shibbo-theme") setTheme(e.data.theme);
    });
    document.addEventListener(
      "click",
      (e) => {
        const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
        if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey) return;
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin || url.pathname.startsWith(import.meta.env.BASE_URL)) return;
        e.preventDefault();
        e.stopPropagation();
        window.top!.location.href = url.href;
      },
      true,
    );
    window.parent.postMessage({ type: "shibbo-docs-ready" }, location.origin);
    setTimeout(report, 0);
  },
} satisfies Theme;
