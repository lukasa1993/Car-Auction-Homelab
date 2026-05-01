import { createFileRoute } from "@tanstack/react-router";
import { getCollectorRuntimeAsset } from "@/lib/collector-runtime-assets";

export const Route = createFileRoute("/collector/runtime")({
  server: {
    handlers: {
      GET: () => getCollectorRuntimeAsset("manifest.json"),
    },
  },
});
