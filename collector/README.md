# Auction Collector

This package is intentionally separate from the Bun web app.

It contains the distributed collector runtime and the bootstrap/update logic used on remote machines.
Source stays in TypeScript. Published collector artifacts are minified JavaScript built into `collector/dist`.

## Commands

```bash
bun install
bash ../scripts/run-headed-collector.sh --base-url https://auc.ldev.cloud --site copart,iaai
```

Use the app URL as the collector target. The runner fetches targets from that URL and posts ingest back to the same URL:

```bash
AUCTION_INGEST_TOKEN=... \
bash ../scripts/run-headed-collector.sh --base-url https://auc.ldev.cloud --site copart,iaai

AUCTION_INGEST_TOKEN=... \
bash ../scripts/run-sold-price-runner.sh --base-url https://auc.ldev.cloud --limit 25
```

For the self-updating runtime, bootstrap from the app URL and let it download the signed release:

```bash
AUCTION_INGEST_TOKEN=... \
bun bootstrap.ts --base-url https://auc.ldev.cloud --public-key-file ../runner-keys/collector-signing-key.pub.pem

AUCTION_INGEST_TOKEN=... \
bun bootstrap.ts --runner sold-prices --base-url https://auc.ldev.cloud --public-key-file ../runner-keys/collector-signing-key.pub.pem
```

`bootstrap` and `collect` both build minified JavaScript first and then execute the built `dist/*.js` entrypoints.

The collector always runs headed on `DISPLAY=:99`. Headless and unattended modes are not supported.

When a captcha or similar human gate appears, the runner pauses and waits for a human to clear it through the shared browser UI from `AUCTION_HEADED_BROWSER_URL`.

If the runner is not on the machine that owns the display, attach it to a remote headed browser instead:

```bash
AUCTION_INGEST_TOKEN=... \
AUCTION_PLAYWRIGHT_CDP_URL=http://192.168.19.150:9222 \
bash ../scripts/run-headed-collector.sh --base-url https://auc.ldev.cloud --site copart

AUCTION_INGEST_TOKEN=... \
AUCTION_PLAYWRIGHT_CDP_URL=http://192.168.19.150:9222 \
bash ../scripts/run-sold-price-runner.sh --base-url https://auc.ldev.cloud
```

`AUCTION_PLAYWRIGHT_WS_ENDPOINT` can be used instead when the remote browser exposes a Playwright websocket endpoint. Remote browser mode still requires a visible headed browser on the remote host; it only removes the local `DISPLAY=:99` requirement.

If collector updates are served from GitHub raw instead of the app origin, set `AUCTION_COLLECTOR_UPDATE_BASE_URL` or pass `--update-base-url`.

For local direct execution without the bootstrap:

```bash
DISPLAY=:99 AUCTION_INGEST_TOKEN=... bun run collect --base-url https://auc.ldev.cloud --site copart,iaai
```

## Contract

- Fetch active VIN targets from the central Bun service.
- Refuse to run if the remote collector version is newer than the local one.
- Scrape with headed Playwright, either local `DISPLAY=:99` or an attached remote headed browser.
- Submit lots and images back to the central API.

The collector package should remain dependency-isolated from the root web app.
