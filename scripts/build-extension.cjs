/* eslint-disable no-console */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");

const repoRoot = path.resolve(__dirname, "..");
const extRoot = path.join(repoRoot, "extractor");
const srcRoot = path.join(extRoot, "src");
const distRoot = path.join(extRoot, "dist");

async function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  await fsp.rm(dir, { recursive: true, force: true });
}

async function copyDir(srcDir, dstDir) {
  await fsp.mkdir(dstDir, { recursive: true });
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const s = path.join(srcDir, ent.name);
    const d = path.join(dstDir, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else if (ent.isFile()) await fsp.copyFile(s, d);
  }
}

async function build() {
  await rimraf(distRoot);
  await fsp.mkdir(distRoot, { recursive: true });

  // Copy static assets used by the extension.
  await Promise.all([
    fsp.copyFile(path.join(extRoot, "manifest.json"), path.join(distRoot, "manifest.json")),
    fsp.copyFile(path.join(extRoot, "popup.html"), path.join(distRoot, "popup.html")),
    fsp.copyFile(path.join(extRoot, "popup.css"), path.join(distRoot, "popup.css")),
    copyDir(path.join(extRoot, "icons"), path.join(distRoot, "icons"))
  ]);

  // Bundle popup + background into the dist extension folder.
  await esbuild.build({
    entryPoints: {
      popup: path.join(srcRoot, "popup", "main.ts"),
      background: path.join(srcRoot, "background", "main.ts")
    },
    outdir: distRoot,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2020",
    sourcemap: true,
    legalComments: "none",
    logLevel: "info"
  });

  console.log(`Built extension to: ${distRoot}`);
  console.log(`Load unpacked: ${distRoot}`);
}

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

