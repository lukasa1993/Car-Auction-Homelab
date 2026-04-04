# Bun Auction Service

This replaces the old static report writer with a centralized Bun + SQLite service.

## What It Does

- Serves `auc.ldev.cloud` directly from Bun instead of from a static HTML file.
- Uses React SSR with a shadcn-style Tailwind UI layer instead of string-built HTML.
- Stores VIN targets in SQLite so scrapers fetch scope from the server.
- Stores lots, snapshots, manual actions, and images in SQLite plus a mounted media volume.
- Uses Better Auth for session-backed sign-in and sign-up.
- Serves a signed collector manifest from `/collector/runtime/*`.
- Lets remote machines run a tiny bootstrap script that downloads the current collector package, verifies it, and then scrapes.

## Important Rules

- SQLite lives only on the Mac mini. Remote scrapers never write to the DB directly.
- Manual `removed` workflow state does not get resurrected by scraper ingests.
- Source state still updates on removed lots, including date changes and missing/canceled transitions.
- IAAI `Stock#` is treated as the canonical lot number.

## Local Development

```bash
bun install
bun run setup:env --base-url http://localhost:3005
bun run collector:release --update-base-url http://localhost:3005/collector/runtime
bun src/server.tsx
```

The service listens on `http://localhost:3005` by default.

The first startup:

- runs Better Auth migrations programmatically on the same SQLite database
- bootstraps the initial admin user for `AUCTION_ADMIN_EMAILS`
- uses `AUCTION_ADMIN_PASSWORD` as that initial account password
- builds the collector runtime into `collector/dist`

Default auth cookie mode is dual-use:

- works on local `http://localhost:3005`
- works on local `http://127.0.0.1:3005`
- works on production `https://auc.ldev.cloud`

If you want strict HTTPS-only cookies later, set:

```env
AUCTION_USE_SECURE_COOKIES=true
```

## Collector Signing Keys

The built-in setup script generates the `.env` file and the Ed25519 collector signing keypair:

```bash
bun run setup:env --base-url https://auc.ldev.cloud
```

The server uses the private key through `AUCTION_COLLECTOR_PRIVATE_KEY_FILE`.
Every machine that runs the bootstrap needs the public key file.

The script writes:

- `.env`
- `runner-keys/collector-signing-key.pem`
- `runner-keys/collector-signing-key.pub.pem`
- `AUCTION_ADMIN_EMAILS=luka@lnh.ge`
- `AUCTION_ADMIN_PASSWORD=<generated>` which is also the initial Better Auth password for `luka@lnh.ge`
- `AUCTION_TRUSTED_ORIGINS=` for any extra allowed browser origins beyond the built-in local defaults
- `AUCTION_USE_SECURE_COOKIES=false`

Useful flags:

```bash
bun run setup:env --base-url https://auc.ldev.cloud
bun run setup:env --base-url https://auc.ldev.cloud --collector-update-base-url https://raw.githubusercontent.com/lukasa1993/Car-Auction-Homelab/main/collector/release
bun run setup:env --base-url http://localhost:3005 --env-file .env.local --keys-dir .secrets
bun run setup:env --force
```

## Collector Package

The distributed scraper now lives in its own package under [collector](/Users/l/_DEV/LNH/auction/collector).

- It has its own `package.json`.
- It has its own `tsconfig.json`.
- It builds minified JavaScript into `collector/dist`.
- It can publish signed runtime files into tracked `collector/release` for GitHub raw updates.
- The root web app no longer typechecks or scripts collector source files as part of the app package.

Publish the tracked release files with:

```bash
bun run collector:release
```

Production raw update base for this repo:

```text
https://raw.githubusercontent.com/lukasa1993/Car-Auction-Homelab/main/collector/release
```

## Docker

The Docker image is now:

- multi-stage
- built from Bun in a builder stage
- compiled into a standalone Bun executable with `bun build --compile`
- targeted to musl for Alpine
- run from a minimal Alpine runtime image with no Bun toolchain installed
- published automatically to GHCR by GitHub Actions from [publish-container.yml](/Users/l/_DEV/LNH/auction/.github/workflows/publish-container.yml)

Default container port is `3005`.

Image naming:

```text
ghcr.io/<owner>/<repo>:latest
ghcr.io/<owner>/<repo>:sha-<commit>
ghcr.io/<owner>/<repo>:<git-tag>
```

## Collector Bootstrap

On any machine that should scrape:

```bash
export AUCTION_BASE_URL='https://auc.ldev.cloud'
export AUCTION_COLLECTOR_UPDATE_BASE_URL='https://raw.githubusercontent.com/lukasa1993/Car-Auction-Homelab/main/collector/release'
export AUCTION_INGEST_TOKEN='your-ingest-token'
export AUCTION_COLLECTOR_PUBLIC_KEY_FILE='/path/to/collector-signing-key.pub.pem'
cd collector
bun run bootstrap --site copart,iaai --headless --unattended
```

The bootstrap:

- downloads the signed collector manifest
- verifies the signature with the local public key
- downloads the current built collector package if needed
- runs `bun install` in the cached collector directory
- installs Playwright Chromium if needed
- executes the current collector

The collector itself checks the configured collector update URL and exits if it is stale.

## GitHub Registry

The workflow publishes on:

- push to `main`
- pushed tags like `v1.0.0`
- manual `workflow_dispatch`

It uses the built-in `GITHUB_TOKEN` with `packages: write`, so no extra registry secret is needed for publishing.

## Mac Mini Deployment

The Mac mini should pull the published GHCR image. The repo checkout only provides the Compose file and deployment notes.

1. On your local machine, generate the runtime env and signing keys:

```bash
bun run setup:env \
  --base-url https://auc.ldev.cloud \
  --collector-update-base-url https://raw.githubusercontent.com/lukasa1993/Car-Auction-Homelab/main/collector/release
bun run collector:release
```

2. Copy the runtime material to the Mac mini:
   - `.env`
   - `runner-keys/collector-signing-key.pem`
   - `runner-keys/collector-signing-key.pub.pem`
   - `collector/release/*` must be committed and pushed so GitHub raw serves the same signed files

3. On the Mac mini, create directories:

```bash
mkdir -p /Users/l/_APPS/auction/data
mkdir -p /Users/l/_APPS/auction/runner-keys
mkdir -p /Users/l/_APPS/auction
```

4. Clone the repo on the Mac mini:

```bash
git clone https://github.com/lukasa1993/Car-Auction-Homelab.git /Users/l/_APPS/auction/repo
```

5. Copy the env file and keys there:

```bash
cp .env /Users/l/_APPS/auction/.env
cp runner-keys/collector-signing-key.pem /Users/l/_APPS/auction/runner-keys/
cp runner-keys/collector-signing-key.pub.pem /Users/l/_APPS/auction/runner-keys/
```

6. Pull and run the published image from the repo checkout:

```bash
cd /Users/l/_APPS/auction/repo
AUCTION_RUNTIME_DIR=/Users/l/_APPS/auction /usr/local/bin/docker compose -f deploy/mac-mini/compose.yml pull
AUCTION_RUNTIME_DIR=/Users/l/_APPS/auction /usr/local/bin/docker compose -f deploy/mac-mini/compose.yml up -d
```

By default the Compose file uses:

```text
ghcr.io/lukasa1993/car-auction-homelab:latest
```

To pin a different tag or digest temporarily:

```bash
cd /Users/l/_APPS/auction/repo
AUCTION_RUNTIME_DIR=/Users/l/_APPS/auction \
AUCTION_IMAGE=ghcr.io/lukasa1993/car-auction-homelab:<tag-or-digest> \
/usr/local/bin/docker compose -f deploy/mac-mini/compose.yml pull

AUCTION_RUNTIME_DIR=/Users/l/_APPS/auction \
AUCTION_IMAGE=ghcr.io/lukasa1993/car-auction-homelab:<tag-or-digest> \
/usr/local/bin/docker compose -f deploy/mac-mini/compose.yml up -d
```

7. Change the live `auc.ldev.cloud` Caddy block from static `root * /Users/l/_APPS/caddy/site/auc.ldev.cloud` to a reverse proxy to `127.0.0.1:3005`.

Suggested Caddy block:

```caddy
@auction_report host auc.ldev.cloud
handle @auction_report {
	reverse_proxy 127.0.0.1:3005 {
		header_up Host {host}
		header_up X-Forwarded-Proto {http.request.scheme}
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-Host {http.request.host}
		header_up X-Forwarded-For {http.request.remote.host}
	}
}
```

8. Reload Caddy and then remove the old static directory after validation:

```bash
sudo /opt/homebrew/opt/caddy/bin/caddy reload --config /opt/homebrew/etc/Caddyfile
rm -rf /Users/l/_APPS/caddy/site/auc.ldev.cloud
```

## Current Gaps

- Copart and IAAI image extraction is best-effort and browser-backed.
- Manual management for VIN targets exists in `/admin`, but it is still intentionally minimal.
- There is no dedicated scheduler container yet; the expected production pattern is cron invoking the collector bootstrap on chosen machines.
- If you need more than one admin later, extend `AUCTION_ADMIN_EMAILS` in `.env` as a comma-separated list.
- `collector/release/*` must be regenerated and pushed whenever the collector runtime changes.
- `latest` only reflects the default branch. If the Mac mini needs a pre-merge image, publish and pin a non-`latest` tag first.
- The app can still serve `/collector/runtime/*` for local development or fallback updates.
