# Scar

Browser extension: paste HTML or plain text, extract PNG URLs (`http(s)`, paths ending in `.png`, `data:image/png`, and `blob:` image sources from `<img>` tags), open links in a new tab, copy the list, and preview thumbnails.

## Install (development / unpacked)

### Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose this folder:
   - **Without building**: `png-extractor-extension` (the one that contains `manifest.json`)
   - **With TypeScript build**: run `npm run build` at repo root, then load `png-extractor-extension/dist`

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json` inside this folder.

Temporary add-ons in Firefox are removed when the browser closes; reload the same way after restart, or package for [AMO](https://addons.mozilla.org/) for a permanent install.

## Use

1. Click the **Scar** toolbar icon.
2. Paste your content, then click **Extract media** (or **Ctrl+Enter** / **Cmd+Enter**).
3. Click any link row or preview tile to open in a new tab (where the browser allows). Use **Copy all** or **Copy lines** for the raw list. Previews may fail for hotlink-protected or dead links; `blob:` URLs from a paste usually will not open or preview outside the original page.

## Files

- `manifest.json` — Manifest V3, Firefox `browser_specific_settings` included.
- `popup.html` / `popup.css` / `popup.js` — UI and extraction logic.

## TypeScript build (recommended)

This repo includes a small TS codebase + bundler that outputs a clean, loadable extension folder.

1. From repo root:
   - `npm install`
   - `npm run build`
2. Load unpacked:
   - `png-extractor-extension/dist`

Source code lives under `png-extractor-extension/src/` (popup/background/shared).
