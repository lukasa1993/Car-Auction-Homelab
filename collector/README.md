# Auction Collector

This package is intentionally separate from the Bun web app.

It contains the distributed collector runtime and the bootstrap/update logic used on remote machines.
Source stays in TypeScript. Published collector artifacts are minified JavaScript built into `collector/dist`.

## Commands

```bash
bun install
bash ../scripts/run-headed-collector.sh --base-url https://auc.ldev.cloud --site copart,iaai
```

`bootstrap` and `collect` both build minified JavaScript first and then execute the built `dist/*.js` entrypoints.

The collector always runs headed on `DISPLAY=:99`. Headless and unattended modes are not supported.

When a captcha or similar human gate appears, the runner pauses and waits for a human to clear it through the shared browser UI documented in [`../docs/shared-headed-browser.md`](../docs/shared-headed-browser.md).

If collector updates are served from GitHub raw instead of the app origin, set `AUCTION_COLLECTOR_UPDATE_BASE_URL` or pass `--update-base-url`.

For local direct execution without the bootstrap:

```bash
DISPLAY=:99 AUCTION_INGEST_TOKEN=... bun run collect --base-url https://auc.ldev.cloud --site copart,iaai
```

## Contract

- Fetch active VIN targets from the central Bun service.
- Refuse to run if the remote collector version is newer than the local one.
- Scrape locally with Playwright.
- Submit lots and images back to the central API.

The collector package should remain dependency-isolated from the root web app.
