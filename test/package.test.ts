import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

// The published package must carry the whole registry, not just data/tells.yaml.
test("npm package ships every registry and source file", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
  const files = new Set((JSON.parse(out)[0].files as Array<{ path: string }>).map((f) => f.path));
  const need = [
    "data/tells.yaml",
    "data/sources.yaml",
    "data/models.yaml",
    "data/measured/graphite.json",
    ...readdirSync("data/tells.d").filter((f) => f.endsWith(".yaml")).map((f) => `data/tells.d/${f}`),
    ...readdirSync("data/sources.d").filter((f) => f.endsWith(".yaml")).map((f) => `data/sources.d/${f}`),
  ];
  for (const f of need) assert.ok(files.has(f), `missing from the npm package: ${f}`);
});

test("the packed data loads as many tells as the repo", async () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
  const dir = mkdtempSync(join(tmpdir(), "shibbo-pack-"));
  for (const { path } of JSON.parse(out)[0].files as Array<{ path: string }>) {
    if (!path.startsWith("data/")) continue;
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    copyFileSync(path, join(dir, path));
  }
  const { parse } = await import("yaml");
  const { readFileSync } = await import("node:fs");
  const count = (root: string) =>
    (parse(readFileSync(join(root, "data/tells.yaml"), "utf8")) as unknown[]).length +
    readdirSync(join(root, "data/tells.d")).filter((f) => f.endsWith(".yaml")).reduce((n, f) => n + (parse(readFileSync(join(root, "data/tells.d", f), "utf8")) as unknown[]).length, 0);
  assert.equal(count(dir), count("."));
});
