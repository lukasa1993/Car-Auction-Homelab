import { ensureBetterAuthSchema } from "./lib/auth";
import { LiveEventBus } from "./lib/live-events";
import { AuctionStore } from "./models/auction-store";
import { ensureAppCss, ensureCollectorBuild } from "./server/assets";
import { loadServerConfig } from "./server/config";
import { handleRequest } from "./server/routes";

async function bootstrap() {
  const config = loadServerConfig();

  ensureAppCss(config);
  ensureCollectorBuild(config);
  await ensureBetterAuthSchema();

  const services = {
    config,
    store: new AuctionStore({
      databasePath: config.databasePath,
      mediaDir: config.mediaDir,
    }),
    liveEvents: new LiveEventBus(),
  };

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch(request) {
      return handleRequest(request, services);
    },
  });

  console.log(
    JSON.stringify(
      {
        message: "auction service ready",
        host: config.host,
        port: config.port,
        baseUrl: config.baseUrl,
        databasePath: config.databasePath,
        mediaDir: config.mediaDir,
        collectorSourceDir: config.collectorSourceDir,
        collectorRuntimeDir: config.collectorRuntimeDir,
      },
      null,
      2,
    ),
  );

  process.on("SIGINT", () => {
    server.stop(true);
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
