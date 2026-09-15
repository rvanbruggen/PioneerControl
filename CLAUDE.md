# CLAUDE.md — AI Coding Assistant Instructions

## Project overview

PioneerControl is a web-based remote control for Pioneer network-connected amplifiers. It is a single-page app (HTML/CSS/JS) in the project root, suitable for GitHub Pages (served from the root branch).

## Key maintenance rules

### Version management

The version number follows semantic versioning (x.y.z) and must be kept in sync across **all three locations** whenever it changes:

1. **`app.js`** — the `APP_VERSION` constant near the top of the file
2. **`README.md`** — the "Current version" line at the top, and the version history section at the bottom
3. **GitHub tags** — create a git tag (e.g. `v0.2.0`) after pushing a version bump

When incrementing versions:
- **Patch (x.y.Z):** bug fixes, minor tweaks
- **Minor (x.Y.0):** new features, new controls, UI improvements
- **Major (X.0.0):** breaking changes, protocol changes, major rewrites

When committing a version to the local clone, you should always push it to the remote as well.

### README.md

Always keep `README.md` up to date when making changes:
- Add new features to the Features section
- Update the Protocol reference if new commands are added
- Update the Version history section with a summary of changes
- Update the Project structure if files are added or removed

### File structure

- `index.html`, `app.js`, `style.css` — the web app, in the project root.
- `proxy.py` — local CORS proxy, in the project root. Run with `python3 proxy.py <amp-ip>`.
- `Dockerfile`, `docker-compose.yml`, `docker/` — nginx container (HTTPS + amp reverse proxy) deployed on the Docker host 192.168.68.78; replaces `proxy.py` on the NAS. nginx must send the same amp headers as `proxy.py`.
- `sources.md` — editable configuration file listing which input sources appear by default per zone. Fetched at runtime by the app; edit this on the NAS to change defaults for all users without touching `app.js`.
- `PioneerSources/` — reference material from the original Pioneer web interface. Do not modify these files.
- All app code is vanilla HTML/CSS/JS with no build tools or package managers.

### Protocol

The Pioneer amplifier communicates via:
- **Commands:** `POST http://<ip>/EventHandler.asp` with body `WebToHostItem=<command>`
- **Status:** `GET http://<ip>/StatusHandler.asp` returning JSON

Refer to `PioneerSources/` JavaScript files for protocol details.

### Code style

- Vanilla JavaScript (no frameworks, no build step)
- ES5-compatible where practical (broad browser support)
- CSS custom properties for theming
- Responsive design: mobile-first, works on phone/tablet/desktop
