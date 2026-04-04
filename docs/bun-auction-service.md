# Bun Auction Service

This replaces the old static report writer with a centralized Bun + SQLite service.

## What It Does

- Serves `auc.ldev.cloud` directly from Bun instead of from a static HTML file.
- Uses React SSR with a shadcn-style Tailwind UI layer instead of string-built HTML.
- Stores VIN targets in SQLite so scrapers fetch scope from the server.
- Stores lots, snapshots, manual actions, and images in SQLite plus a mounted media volume.
- Uses Better Auth for session-backed sign-in and sign-up.
- Serves a signed collector manifest from `/collector/*`.
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
bun run setup:env --base-url http://localhost:3005 --env-file .env.local --keys-dir .secrets
bun run setup:env --force
```

## Collector Package

The distributed scraper now lives in its own package under [collector](/Users/l/_DEV/LNH/auction/collector).

- It has its own `package.json`.
- It has its own `tsconfig.json`.
- It builds minified JavaScript into `collector/dist`.
- The root web app no longer typechecks or scripts collector source files as part of the app package.

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

The collector itself checks the live manifest and exits if it is stale.

## GitHub Registry

The workflow publishes on:

- push to `main`
- pushed tags like `v1.0.0`
- manual `workflow_dispatch`

It uses the built-in `GITHUB_TOKEN` with `packages: write`, so no extra registry secret is needed for publishing.

## Mac Mini Deployment

The Mac mini should not build from source anymore. It should pull the published image from GHCR.

1. On your local machine, generate the runtime env and signing keys:

```bash
bun run setup:env --base-url https://auc.ldev.cloud
```

2. Copy only the runtime material to the Mac mini, for example:
   - `.env`
   - `runner-keys/collector-signing-key.pem`
   - `runner-keys/collector-signing-key.pub.pem`
   - the generated `.env` already contains `AUCTION_ADMIN_EMAILS=luka@lnh.ge`

3. On the Mac mini, create directories:

```bash
mkdir -p /Users/l/_APPS/auction/data
mkdir -p /Users/l/_APPS/auction/runner-keys
```

4. Copy the env file and keys there.

5. Log in to GHCR once on the Mac mini:

```bash
echo '<github_pat_or_fine_grained_token>' | docker login ghcr.io -u <github-username> --password-stdin
```

6. Pull and run the published image:

```bash
docker pull ghcr.io/<owner>/<repo>:latest

docker rm -f auction 2>/dev/null || true

docker run -d \
  --name auction \
  --restart unless-stopped \
  -p 3005:3005 \
  --env-file /Users/l/_APPS/auction/.env \
  -v /Users/l/_APPS/auction/data:/app/data \
  -v /Users/l/_APPS/auction/runner-keys:/app/runner-keys:ro \
  --label com.centurylinklabs.watchtower.enable=true \
  ghcr.io/<owner>/<repo>:latest
```

7. Change the `auc.ldev.cloud` Caddy block from static `root * /Users/l/_APPS/caddy/site/auc.ldev.cloud` to a reverse proxy to `127.0.0.1:3005`.

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

## Current Gaps

- Copart and IAAI image extraction is best-effort and browser-backed.
- Manual management for VIN targets exists in `/admin`, but it is still intentionally minimal.
- There is no dedicated scheduler container yet; the expected production pattern is cron invoking the collector bootstrap on chosen machines.
- If you need more than one admin later, extend `AUCTION_ADMIN_EMAILS` in `.env` as a comma-separated list.
- Watchtower updates assume the Mac mini can authenticate to GHCR and track `ghcr.io/<owner>/<repo>:latest`.
