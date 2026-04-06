# Shared Headed Browser

The auction collector does not support headless mode. By default it expects a shared headed display on `:99`, and the live browser details come from environment variables rather than from tracked repo files.

Required runtime configuration:

- `AUCTION_REQUIRED_DISPLAY` (optional, defaults to `:99`)
- `AUCTION_HEADED_BROWSER_URL` for the primary UI URL
- `AUCTION_HEADED_BROWSER_FALLBACK_URL` for an alternate local/LAN URL
- `AUCTION_HEADED_BROWSER_PASSWORD` for the shared browser password

Optional wrapper config:

- `AUCTION_HEADED_BROWSER_ENV_FILE` to point `scripts/run-headed-collector.sh` at an env file
- default env file path: `.auction-headed-browser.env` at the repo root

Example local env file:

```bash
AUCTION_REQUIRED_DISPLAY=:99
AUCTION_HEADED_BROWSER_URL=https://your-browser-host.example/
AUCTION_HEADED_BROWSER_FALLBACK_URL=http://your-lan-host:6080/
AUCTION_HEADED_BROWSER_PASSWORD=replace-me
```

Do not commit real passwords, internal hostnames, or private URLs to the repo.

Default collector behavior:

- `scripts/run-headed-collector.sh` exports the required display before bootstrapping
- the runner refuses to start if `DISPLAY` does not match `AUCTION_REQUIRED_DISPLAY`
- when a captcha or similar manual gate is detected, the runner waits for a human to clear it in the shared browser before continuing
- if the gate is not cleared before `AUCTION_MANUAL_GATE_TIMEOUT_MS` expires, the run fails clearly and prints the configured browser details

Useful env overrides:

- `AUCTION_MANUAL_GATE_TIMEOUT_MS=900000` for a 15 minute wait
- `AUCTION_MANUAL_GATE_POLL_MS=3000` for the manual-gate poll interval
- `AUCTION_COLLECTOR_VERBOSE=1` if you want the wrapper to print normal successful runs too

Recommended manual run:

```bash
bash scripts/run-headed-collector.sh --site copart,iaai
```

Recommended scheduler invocation:

```bash
cd /path/to/Car-Auction-Homelab && /usr/bin/env bash scripts/run-headed-collector.sh --site copart,iaai
```

That wrapper stays quiet on success, so your scheduler only surfaces real failures or manual-gate timeouts.
