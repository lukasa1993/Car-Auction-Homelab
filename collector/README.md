# Auction Collector

This package is intentionally separate from the Bun web app.

It contains the distributed collector runtime and the bootstrap/update logic used on remote machines.
Source stays in TypeScript. Published collector artifacts are minified JavaScript built into `collector/dist`.

## Commands

```bash
bun install
bun run bootstrap --base-url https://auc.ldev.cloud --site copart,iaai --headless --unattended
```

`bootstrap` and `collect` both build minified JavaScript first and then execute the built `dist/*.js` entrypoints.

If collector updates are served from GitHub raw instead of the app origin, set `AUCTION_COLLECTOR_UPDATE_BASE_URL` or pass `--update-base-url`.

For local direct execution without the bootstrap:

```bash
AUCTION_INGEST_TOKEN=... bun run collect --base-url https://auc.ldev.cloud --site copart,iaai --headless --unattended
```

## Contract

- Fetch active VIN targets from the central Bun service.
- Refuse to run if the remote collector version is newer than the local one.
- Scrape locally with Playwright.
- Submit lots and images back to the central API.

The collector package should remain dependency-isolated from the root web app.
