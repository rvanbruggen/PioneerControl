# Handover: Pioneer Amp Control App — v0.2.0 Development Plan

## Project
`/Users/rikvanbruggen/Documents/GitHub/RixPioneerControl` — web-based remote control for a Pioneer network-connected amplifier. Branch: `claude/fix-amplifier-app-km8a0`.

Read CLAUDE.md first — it has version management rules and project conventions.

## What exists now (v0.1.0)
- `docs/index.html`, `docs/app.js`, `docs/style.css` — single-page web app (vanilla HTML/CSS/JS)
- `Dockerfile`, `docker-compose.yml`, `docker/nginx.conf.template`, `docker/docker-entrypoint.sh`, `.dockerignore` — Docker scaffolding (draft, needs review alongside app changes)
- `InteractiveOperatingGuide/` — original Pioneer web interface files (reference only, do not modify)
- App communicates with amplifier via `POST /EventHandler.asp` (commands) and `GET /StatusHandler.asp` (status JSON)

## Plan for v0.2.0 — three parts

### Part 1: Fix 6 connectivity bugs in `docs/app.js`

**Bug 1 (CRITICAL) — No fetch timeouts (root cause of connectivity loss).**
`sendCommand()` (line ~102) and `pollStatus()` (line ~118) use `fetch()` with no `AbortController` or timeout. When the proxy/NAS reboots, in-flight requests hang for minutes (TCP timeout), new requests pile up every 2s from `setInterval`, and the browser's 6-connection-per-origin limit fills with dead connections. The app stays "disconnected" until all hung requests individually TCP-timeout. Clearing localStorage "fixes" it only because the page refresh kills hung connections.
**Fix:** Add `AbortController` with ~5s timeout to both `sendCommand()` and `pollStatus()`.

**Bug 2 (CRITICAL) — Orphaned polling intervals.**
`startPolling()` (line ~152) sets `statusTimer` inside nested `setTimeout` (200ms + 300ms). If called twice within that window, `stopPolling()` is a no-op both times (timer not yet created), then the first `setTimeout` chain writes an interval ID, then the second overwrites it. First interval is orphaned forever.
**Fix:** Use a guard variable or cancel pending timeouts in `stopPolling()`.

**Bug 3 — False "connected" state.**
`setConnected(true)` is called at line ~131 before validating the response body. If the proxy returns HTTP 200 with an HTML error page (e.g. "Bad Gateway"), the app shows green dot but `updateUI()` is never called (JSON parse fails).
**Fix:** Only call `setConnected(true)` after successful parse.

**Bug 4 — No page visibility recovery.**
No `visibilitychange` handler. When phone screen locks, `setInterval` is throttled/suspended. On wake, there's no trigger to restart polling.
**Fix:** Add `document.addEventListener('visibilitychange', ...)` that calls `startPolling()` when visible.

**Bug 5 — Cleanup commands lost on page unload.**
`beforeunload` handler (line ~416) uses `fetch()` without `keepalive: true`. Browsers cancel pending fetches during unload.
**Fix:** Use `navigator.sendBeacon()` or add `keepalive: true`.

**Bug 6 — HD Zone volume buttons are swapped.**
`docs/index.html` lines 128-133: minus button sends `HZU` (up), plus button sends `HZD` (down). Compare with main zone which is correct (VD for minus, VU for plus).
**Fix:** Swap `data-cmd="HZU"` and `data-cmd="HZD"` on those two buttons.

### Part 2: Dockerize the app

Docker files already exist in the repo (draft). The setup:
- `Dockerfile` — nginx:1.27-alpine, serves static files from `docs/`, proxies to amp
- `docker-compose.yml` — port 8080, `AMP_IP` env var (default 192.168.68.60)
- `docker/nginx.conf.template` — static files + reverse proxy for EventHandler.asp and StatusHandler.asp with CORS headers and short timeouts
- `docker/docker-entrypoint.sh` — `envsubst` for AMP_IP only (preserves nginx $variables)

Target: Docker server at 192.168.68.78 (already runs other local apps). Review and finalize these files after Part 1 changes.

### Part 3: Configurable proxy mode in the app

Update `docs/app.js` so the app can work in two modes:
- **Proxy mode** (default when served from Docker): requests go to same origin (`/EventHandler.asp`), nginx forwards to amp
- **Direct mode**: requests go to `http://<amp-ip>/EventHandler.asp` (for local file:// or same-network use)

The setup screen should let the user toggle this. When in proxy mode, the app doesn't need to know the amp's IP — it just talks to its own origin.

### Version bump
Bump to 0.2.0 in three places per CLAUDE.md rules:
1. `APP_VERSION` in `docs/app.js`
2. "Current version" + version history in `README.md`
3. Git tag `v0.2.0`

Also update README.md with Docker setup instructions and new features.
