import { mkdirSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
const outDir = path.join(rootDir, "dist");
const archArg = process.argv.find((arg) => arg.startsWith("--arch="))?.split("=")[1] || process.env.BUILD_ARCH || process.arch;

function resolveTarget(arch: string): "bun-linux-x64-musl" | "bun-linux-arm64-musl" {
  switch (arch) {
    case "x64":
    case "amd64":
      return "bun-linux-x64-musl";
    case "arm64":
    case "aarch64":
      return "bun-linux-arm64-musl";
    default:
      throw new Error(`Unsupported build architecture: ${arch}`);
  }
}

mkdirSync(outDir, { recursive: true });

const target = resolveTarget(archArg);
const result = await Bun.build({
  entrypoints: [path.join(rootDir, "src", "server.tsx")],
  outdir: outDir,
  naming: "auction",
  minify: true,
  sourcemap: "none",
  bytecode: true,
  target: "bun",
  compile: {
    outfile: path.join(outDir, "auction"),
    target,
    execArgv: ["--smol"],
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      target,
      outfile: path.join(outDir, "auction"),
    },
    null,
    2,
  ),
);
