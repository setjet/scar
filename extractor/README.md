# Scar

Browser extension: paste HTML or plain text, extract PNG URLs (`http(s)`, paths ending in `.png`, `data:image/png`, and `blob:` image sources from `<img>` tags), open links in a new tab, copy the list, and preview thumbnails.

[![CI](https://github.com/setjet/scar/actions/workflows/ci.yml/badge.svg)](https://github.com/setjet/scar/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-20+-339933?logo=node.js&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white)

## Demo video

- **Video link**: `PASTE_DEMO_VIDEO_URL_HERE`

<details>
<summary>Embed snippet (optional)</summary>

<video src="PASTE_DEMO_VIDEO_URL_HERE" controls muted playsinline style="max-width: 100%;"></video>
</details>

## Install (development / unpacked)

### Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose this folder:
   - **Without building**: `extractor` (the one that contains `manifest.json`)
   - **With TypeScript build**: run `npm run build` at repo root, then load `extractor/dist`

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
   - `extractor/dist`

Source code lives under `extractor/src/` (popup/background/shared).
