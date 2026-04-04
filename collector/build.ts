import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const collectorDir = import.meta.dir;
const distDir = path.join(collectorDir, "dist");
const sourcePackage = JSON.parse(readFileSync(path.join(collectorDir, "package.json"), "utf8")) as {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
};

mkdirSync(distDir, { recursive: true });
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const sharedOptions = {
  target: "bun" as const,
  format: "esm" as const,
  minify: true,
  sourcemap: "none" as const,
  external: ["playwright", "luxon"],
};

const runnerBuild = await Bun.build({
  entrypoints: [path.join(collectorDir, "auction-runner.ts")],
  outdir: distDir,
  naming: "auction-runner.js",
  ...sharedOptions,
});

const bootstrapBuild = await Bun.build({
  entrypoints: [path.join(collectorDir, "bootstrap.ts")],
  outdir: distDir,
  naming: "bootstrap.js",
  ...sharedOptions,
});

const logs = [...runnerBuild.logs, ...bootstrapBuild.logs];
if (!runnerBuild.success || !bootstrapBuild.success) {
  for (const log of logs) {
    console.error(log);
  }
  process.exit(1);
}

writeFileSync(
  path.join(distDir, "package.json"),
  `${JSON.stringify(
    {
      name: `${sourcePackage.name || "lnh-auction-collector"}-runtime`,
      private: true,
      type: "module",
      version: sourcePackage.version || "0.1.0",
      scripts: {
        bootstrap: "bun bootstrap.js",
        collect: "bun auction-runner.js",
      },
      dependencies: {
        luxon: sourcePackage.dependencies?.luxon,
        playwright: sourcePackage.dependencies?.playwright,
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  path.join(distDir, "README.txt"),
  [
    "Built collector runtime package.",
    "Generated from collector/*.ts via bun build.",
    "Files in this directory are the only collector artifacts published by the Bun service.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      distDir,
      version: sourcePackage.version || "0.1.0",
      files: ["auction-runner.js", "bootstrap.js", "package.json", "README.txt"],
    },
    null,
    2,
  ),
);
