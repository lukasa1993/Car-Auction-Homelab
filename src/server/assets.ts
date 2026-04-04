import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

import type { ServerConfig } from "./config";

export function ensureAppCss(config: ServerConfig): void {
  mkdirSync(config.publicDir, { recursive: true });
  const outputExists = existsSync(config.appCssOutput);
  const sourceExists = existsSync(config.appCssSource);

  if (!sourceExists && outputExists) {
    return;
  }
  if (!sourceExists && !outputExists) {
    throw new Error(`Missing built CSS at ${config.appCssOutput}`);
  }

  const needsBuild =
    !outputExists ||
    statSync(config.appCssSource).mtimeMs > statSync(config.appCssOutput).mtimeMs;
  if (!needsBuild) {
    return;
  }

  const build = Bun.spawnSync(
    ["bunx", "@tailwindcss/cli", "-i", config.appCssSource, "-o", config.appCssOutput, "--minify"],
    {
      cwd: config.rootDir,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    },
  );

  if (build.exitCode !== 0) {
    throw new Error(`Tailwind build failed:\n${build.stderr.toString()}`);
  }
}

export function ensureAppClient(config: ServerConfig): void {
  mkdirSync(config.publicDir, { recursive: true });
  const outputExists = existsSync(config.appJsOutput);
  const sourceExists = existsSync(config.appJsSource);

  if (!sourceExists && outputExists) {
    return;
  }
  if (!sourceExists && !outputExists) {
    throw new Error(`Missing built JS at ${config.appJsOutput}`);
  }

  const build = Bun.spawnSync(
    [
      "bun",
      "build",
      config.appJsSource,
      "--outfile",
      config.appJsOutput,
      "--target",
      "browser",
      "--minify",
    ],
    {
      cwd: config.rootDir,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    },
  );

  if (build.exitCode !== 0) {
    throw new Error(`App bundle build failed:\n${build.stderr.toString()}`);
  }
}

export function ensureCollectorBuild(config: ServerConfig): void {
  const runtimePackagePath = path.join(config.collectorRuntimeDir, "package.json");
  const runtimeExists = existsSync(runtimePackagePath);
  const sourceFiles = [
    path.join(config.collectorSourceDir, "auction-runner.ts"),
    path.join(config.collectorSourceDir, "bootstrap.ts"),
    path.join(config.collectorSourceDir, "build.ts"),
    path.join(config.collectorSourceDir, "package.json"),
  ];
  const sourceExists = sourceFiles.every((filePath) => existsSync(filePath));

  if (!sourceExists && runtimeExists) {
    return;
  }
  if (!sourceExists && !runtimeExists) {
    throw new Error(`Missing built collector runtime at ${config.collectorRuntimeDir}`);
  }

  const shouldBuild =
    !runtimeExists ||
    sourceFiles.some((filePath) => statSync(filePath).mtimeMs > statSync(runtimePackagePath).mtimeMs);

  if (!shouldBuild) {
    return;
  }

  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: config.collectorSourceDir,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  if (build.exitCode !== 0) {
    throw new Error(`Collector build failed:\n${build.stderr.toString()}`);
  }
}
