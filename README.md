# RixPioneerControl

A web-based remote control for Pioneer network-connected amplifiers/receivers. Built as a replacement for the discontinued Pioneer Android app.

**Current version: 0.2.0**

## Why this project?

Pioneer's official Android app for controlling their network-connected amplifiers is no longer supported on modern Android versions. The APK can no longer be installed on recent phones. This project reverse-engineers the amplifier's built-in web control protocol and provides a modern, responsive web interface that works on any device with a browser.

## Features

- **Multi-zone control** — Main Zone, Zone 2, and HD Zone
- **Power on/off** per zone
- **Volume control** — up/down/mute per zone with long-press, plus direct dB entry by clicking the volume display
- **Configurable input sources** — choose which inputs appear per zone in settings
- **Live status display** — real-time power state, volume level (in dB), active input, and listening mode
- **Configurable app name** — rename the app to anything you like
- **CORS proxy** — `proxy.py` sidesteps browser CORS restrictions for local use
- **Responsive design** — optimized for phones, tablets, and desktops
- **Dark theme** — easy on the eyes for home theater use
- **No build step** — vanilla HTML/CSS/JS, just open a URL

## How it works

The app communicates directly with the Pioneer amplifier over your local network using the same HTTP protocol as the original built-in web interface:

- **Commands** are sent via `POST http://<amp-ip>/EventHandler.asp` with the body `WebToHostItem=<command>`
- **Status** is polled via `GET http://<amp-ip>/StatusHandler.asp` which returns JSON with the full amplifier state

The protocol was reverse-engineered from the amplifier's built-in Interactive Operating Guide (included in the `InteractiveOperatingGuide/` directory for reference).

## Supported models

The protocol should work with Pioneer SC and VSX series receivers from approximately 2014-2016, including but not limited to:

- SC-89, SC-87, SC-85, SC-82, SC-81
- SC-LX88, SC-LX78, SC-LX58
- SC-2024, SC-1524, SC-1529, SC-1229, SC-1224
- VSX-80, VSX-1124, VSX-1129, VSX-924
- VSA-1124

## Getting started

### Option 1: Use the local proxy (recommended)

1. Clone or download this repository
2. Run `python3 proxy.py <amp-ip>` (e.g. `python3 proxy.py 192.168.68.60`)
3. Open `http://localhost:8080/` in your browser
4. Enter `localhost:8080` as the proxy address in the settings screen

This sidesteps all CORS issues and works with any modern browser.

### Option 2: Open the HTML file directly

1. Clone or download this repository
2. Open `docs/index.html` in your browser
3. Enter your amplifier's IP address and click Connect

May be blocked by CORS in some browsers; use the proxy if you see errors.

### Option 3: GitHub Pages

1. In your GitHub repository settings, enable GitHub Pages with source set to the `docs/` folder
2. Open the published URL from any device on your local network

**Note:** If GitHub Pages serves over HTTPS, your browser may block HTTP requests to the amplifier (mixed content). In that case, use Option 1, or configure your browser to allow mixed content for the page.

### Option 3: Serve from the amplifier

The Pioneer amplifier has a built-in web server. You may be able to place the files directly on the amplifier if it supports custom pages, though this has not been tested.

## Network requirements

- Your device (phone/tablet/laptop) must be on the **same local network** as the amplifier
- The amplifier must have a network connection (wired or wireless) and a known IP address
- No internet connection is required — all communication is local

## Protocol reference

### Command codes

| Command | Description |
|---------|-------------|
| `PO` / `PF` | Main zone power on / off |
| `APO` / `APF` | Zone 2 power on / off |
| `ZEA` / `ZEF` | HD Zone power on / off |
| `VU` / `VD` | Main zone volume up / down |
| `ZU` / `ZD` | Zone 2 volume up / down |
| `HZU` / `HZD` | HD Zone volume up / down |
| `###VL` | Set main zone volume directly (3-digit code, dB = (code−161)/2) |
| `###ZV` | Set Zone 2 volume directly |
| `###HZV` | Set HD Zone volume directly |
| `MZ` | Main zone mute toggle |
| `Z2MZ` | Zone 2 mute toggle |
| `HZMUT` | HD Zone mute toggle |
| `##FN` | Select input (e.g. `25FN` = BD, `04FN` = DVD) |
| `Z2F##` | Zone 2 input select |
| `ZEA##` | HD Zone input select |
| `?AST` | Query audio status |
| `?RGC` | Query general status |

### Input function codes

| Code | Input |
|------|-------|
| 00 | Phono |
| 01 | CD |
| 02 | Tuner |
| 04 | DVD |
| 05 | TV |
| 06 | SAT/CBL |
| 17 | iPod/USB |
| 19-24 | HDMI 1-6 |
| 25 | BD |
| 26 | Network |
| 33 | BT Audio |
| 34 | HDMI 7 |
| 38 | Internet Radio |
| 44 | Media Server |
| 57 | Spotify |

### Status response

The `StatusHandler.asp` endpoint returns JSON:

```json
{
  "MN": "SC-LX88/SYXJ8",
  "LC": "lastCommand",
  "A": 5,
  "L": "0110",
  "Z": [
    { "MZ": { "P": 1, "V": 117, "M": 0, "F": 25 } },
    { "Z2": { "P": 0, "V": 0, "M": 0, "F": 6 } },
    { "HZ": { "P": 0, "V": -1, "M": 0, "F": 25 } }
  ]
}
```

- `P`: Power (1=on, 0=off)
- `V`: Volume (raw value; dB = (V - 161) / 2)
- `M`: Mute (1=muted, 0=unmuted)
- `F`: Input function code

## Project structure

```
RixPioneerControl/
├── index.html             # Main page
├── app.js                 # Application logic & network layer
├── style.css              # Responsive styles
├── proxy.py               # Local CORS proxy (run to bypass browser restrictions)
├── PioneerSources/        # Original Pioneer web interface (reference, do not modify)
├── CLAUDE.md              # AI coding assistant instructions
├── LICENSE                # MIT License
└── README.md              # This file
```

## Version history

- **0.2.0** — CORS proxy (`proxy.py`) for browsers that block direct HTTP requests. Configurable app name. Separate amp IP / proxy address fields in settings. Per-zone configurable input sources (checkboxes in settings). Direct volume entry by clicking the dB display. Disconnect button.
- **0.1.0** — Initial release. Multi-zone control (power, volume, mute, input select), live status polling, responsive dark-theme UI.

## License

MIT License. See [LICENSE](LICENSE) for details.

Created by Rik Van Bruggen as open source software using different AI coding tools. Use at your own risk.
