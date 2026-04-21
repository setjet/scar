# Scar

Extract images, GIFs, and videos from pasted HTML / CSS / JSON / plain text — as a Manifest V3 browser extension.

[![CI](https://github.com/setjet/scar/actions/workflows/ci.yml/badge.svg)](https://github.com/setjet/scar/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-20+-339933?logo=node.js&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white)

## Demo video

This demo shows how Scar can surface “hidden” media from `mobbin.com` by extracting direct image/GIF/video URLs from pasted HTML/JSON/CSS (including assets buried in payload fields like `screenUrl`). It doesn’t bypass paywalls — it just helps you pull the underlying asset URLs from content that’s already loaded in your browser (i.e., where you already have access).

<details>
<summary>Watch demo</summary>

<!-- Put your video at assets/demo.mp4 -->
<video src="assets/demo.mp4" controls muted playsinline style="max-width: 100%;"></video>
</details>

## Disclaimer

This tool is intended for **personal use**. Please **respect the Terms of Service** of any website you use it on and only extract/download content you have the rights/permission to access.

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

