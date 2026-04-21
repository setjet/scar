# Scar

Extract images, GIFs, and videos from pasted HTML / CSS / JSON / plain text — as a Manifest V3 browser extension.

## Quick start (recommended)

1. From repo root:
   - `npm install`
   - `npm run build`
2. Load the unpacked extension from:
   - `extractor/dist`

## Load unpacked (no build)

You can also load the raw extension folder directly:

- Chrome / Edge: `extractor`
- Firefox temporary add-on: select `extractor/manifest.json`

## Where the code is

- **Extension runtime assets**: `extractor/` (`manifest.json`, `popup.html`, `popup.css`, icons)
- **TypeScript source**: `extractor/src/`
  - `src/popup/` — popup UI + rendering
  - `src/background/` — MV3 service worker persistence
  - `src/shared/` — extraction + URL/media-kind utilities + storage helpers
- **Build script**: `scripts/build-extension.cjs`
- **Tests**: `tests/` (run with `npm test`)

