// Library entry point: the same engine the CLI, MCP server and hooks use.
export { check, type Report, type Finding, type Options } from "./check.js";
export { rulesMarkdown, rank } from "./rules.js";
export { tells, models, sources, graphite, resolveModel, type Tell, type Model } from "./registry.js";
