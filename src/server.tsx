import { ensureBetterAuthSchema } from "./lib/auth";
import { LiveEventBus } from "./lib/live-events";
import { PushService } from "./lib/push-service";
import { AuctionStore } from "./models/auction-store";
import { ensureAppClient, ensureAppCss, ensureCollectorBuild } from "./server/assets";
import { loadServerConfig } from "./server/config";
import { handleRequest } from "./server/routes";

async function bootstrap() {
  const config = loadServerConfig();

  ensureAppCss(config);
  ensureAppClient(config);
  ensureCollectorBuild(config);
  await ensureBetterAuthSchema();

  const store = new AuctionStore({
    databasePath: config.databasePath,
    mediaDir: config.mediaDir,
  });
  const push = new PushService(config.vapidPublicKey, config.vapidPrivateKey, config.vapidSubject, store);
  push.startScheduler();

  const services = {
    config,
    store,
    liveEvents: new LiveEventBus(),
    push,
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
