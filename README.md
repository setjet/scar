# Scar

<img width="420" height="592" alt="2026-04-21 12_32_13-Friends - Discord" src="https://github.com/user-attachments/assets/7e54c5d0-3fcf-4b66-b302-3746e7984498" />

---
Extract images, GIFs, and videos from pasted HTML / CSS / JSON / plain text — as a Manifest V3 browser extension.

[![CI](https://github.com/setjet/scar/actions/workflows/ci.yml/badge.svg)](https://github.com/setjet/scar/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-20+-339933?logo=node.js&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white)

## Preview

Scraping “hidden” media blocked by a paywall from `mobbin.com` (from content you already have access to).

Video: https://x.com/inthecayenne/status/2045803863597261239?s=20

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

## Disclaimer

This tool is intended for **personal use**. Please **respect the Terms of Service** of any website you use it on and only extract/download content you have the rights/permission to access.

