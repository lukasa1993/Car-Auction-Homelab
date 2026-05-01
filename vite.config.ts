import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const config = defineConfig({
  fmt: {
    ignorePatterns: [
      "src/routeTree.gen.ts",
      "worker-configuration.d.ts",
      "collector/**",
      "public/sw.js",
      "public/vin.html",
      "scripts/**",
      "src/lib/date-render.ts",
      "src/lib/live-events.ts",
      "src/lib/push-service.ts",
      "src/lib/runner-manifest.ts",
      "src/lib/theme.ts",
      "src/lib/utils.ts",
      "src/lib/vin-patterns.ts",
      "src/models/auction-store.test.ts",
      "src/models/auction-store.ts",
      "src/models/sqlite.ts",
      "src/models/target-blacklist-patch.ts",
      "src/server.tsx",
      "src/server/**",
      "src/styles/app.css",
      "src/ui/**",
      "dist/**",
    ],
  },

  lint: {
    ignorePatterns: [
      "src/routeTree.gen.ts",
      "worker-configuration.d.ts",
      "collector/**",
      "collector/release/**",
      "collector/model-x-debug-preload.ts",
      "scripts/**",
      "src/models/auction-store.ts",
      "src/models/target-blacklist-patch.ts",
      "src/server.tsx",
      "src/server/**",
      "dist/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: "src/styles/app.css",
      },
    },
  },

  test: {
    include: ["src/**/*.test.ts", "collector/**/*.test.ts"],
  },

  resolve: { tsconfigPaths: true },

  build: {
    cssCodeSplit: true,
  },

  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
