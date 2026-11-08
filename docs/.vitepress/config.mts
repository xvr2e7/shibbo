import { defineConfig } from "vitepress";

// Served inside the web app at <app>/docs/. Set DOCS_BASE when the app lives under a sub-path (e.g. GitHub Pages).
export default defineConfig({
  title: "shibbo docs",
  description: "Check writing and UI for the patterns readers spot as machine-made, with rules tuned to the model that wrote it.",
  base: process.env.DOCS_BASE ?? "/docs/",
  outDir: "../web/public/docs",
  cleanUrls: false,
  lastUpdated: false,
  // Links back into the web app (../#/tells) live outside the docs build on purpose.
  ignoreDeadLinks: [/^\/\.\.\//],
  appearance: true,
  sitemap: { hostname: "https://xvr2e7.github.io/shibbo/docs/" },
  head: [
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "shibbo" }],
    ["meta", { property: "og:image", content: "https://xvr2e7.github.io/shibbo/og.png" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    logo: undefined,
    siteTitle: "shibbo",
    socialLinks: [{ icon: "github", link: "https://github.com/xvr2e7/shibbo" }],
    nav: [
      { text: "Atlas", link: "/../#/", target: "_self" },
      { text: "Tells", link: "/../#/tells", target: "_self" },
      { text: "Models", link: "/../#/models", target: "_self" },
    ],
    sidebar: [
      {
        text: "Start here",
        items: [
          { text: "What shibbo does", link: "/" },
          { text: "Quick start", link: "/guide/quick-start" },
          { text: "How it fits your harness", link: "/guide/how-it-fits" },
        ],
      },
      {
        text: "Harnesses",
        items: [
          { text: "Overview and support table", link: "/harnesses/" },
          { text: "Claude Code", link: "/harnesses/claude-code" },
          { text: "OpenAI Codex CLI", link: "/harnesses/codex" },
          { text: "Cursor", link: "/harnesses/cursor" },
          { text: "GitHub Copilot", link: "/harnesses/copilot" },
          { text: "Gemini CLI", link: "/harnesses/gemini-cli" },
          { text: "Windsurf", link: "/harnesses/windsurf" },
          { text: "Cline and Roo Code", link: "/harnesses/cline" },
          { text: "Aider", link: "/harnesses/aider" },
          { text: "Other harnesses", link: "/harnesses/others" },
          { text: "Any MCP client", link: "/harnesses/mcp" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Read a report", link: "/guide/reading-reports" },
          { text: "Check in CI", link: "/guide/ci" },
          { text: "Quote a tell on purpose", link: "/guide/quoting" },
          { text: "Measure a new model", link: "/guide/measure" },
          { text: "Add or change a tell", link: "/guide/add-a-tell" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Command line", link: "/reference/cli" },
          { text: "Settings", link: "/reference/settings" },
          { text: "MCP tools", link: "/reference/mcp" },
          { text: "Node API", link: "/reference/node-api" },
          { text: "Report format", link: "/reference/report" },
          { text: "Registry schema", link: "/reference/registry" },
        ],
      },
      {
        text: "How it works",
        items: [
          { text: "Scoring", link: "/concepts/scoring" },
          { text: "Data, tests and limits", link: "/concepts/data" },
          { text: "Sources", link: "/concepts/sources" },
        ],
      },
    ],
    outline: { level: [2, 3], label: "On this page" },
    search: { provider: "local" },
    docFooter: { prev: "Previous", next: "Next" },
    footer: { message: "Measurements from Graphite’s AI Tells (2026), CC BY 4.0. Code under MIT." },
  },
});
