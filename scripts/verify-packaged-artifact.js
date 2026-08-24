"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const root = path.resolve(__dirname, "..");
const candidateDir = path.resolve(root, process.argv[2] || "dist");
const asarPath = path.join(candidateDir, "win-unpacked", "resources", "app.asar");
const unpackedExe = path.join(candidateDir, "win-unpacked", "SimLife Hearthbyte Edition.exe");
const errors = [];

function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex").toUpperCase();
}

if (!fs.existsSync(candidateDir)) errors.push(`candidate directory does not exist: ${candidateDir}`);
if (!fs.existsSync(asarPath)) errors.push(`missing packaged application archive: ${asarPath}`);
if (!fs.existsSync(unpackedExe)) errors.push(`missing unpacked application executable: ${unpackedExe}`);

const installers = fs.existsSync(candidateDir)
  ? fs.readdirSync(candidateDir).filter(file => /^SimLife-Hearthbyte-.*-Setup\.exe$/i.test(file))
  : [];
if (installers.length !== 1) errors.push(`expected exactly one Windows installer, found: ${installers.join(", ") || "none"}`);

let entries = [];
if (fs.existsSync(asarPath)) {
  entries = asar.listPackage(asarPath, { isPack: false });
  const entrySet = new Set(entries);
  const requiredEntries = [
    "\\index.html",
    "\\main.js",
    "\\preload.js",
    "\\package.json",
    "\\css\\main.css",
    "\\css\\pretty.css",
    "\\js\\renderer.js",
    "\\js\\state.js",
    "\\vendor\\phaser.min.js",
  ];
  for (const entry of requiredEntries) {
    if (!entrySet.has(entry)) errors.push(`missing packaged runtime entry: ${entry}`);
  }

  const forbiddenPatterns = [
    /(?:^|\\)artifacts(?:\\|$)/i,
    /(?:^|\\)tests(?:\\|$)/i,
    /(?:^|\\)tools(?:\\|$)/i,
    /(?:^|\\)docs(?:\\|$)/i,
    /(?:^|\\)scripts(?:\\|$)/i,
    /(?:^|\\)node_modules(?:\\|$)/i,
    /(?:^|\\)assets\\(?:isokennynl|kenney_dungeon|kenney_library|kenney_minifarm|kenney_pack_temp)(?:\\|$)/i,
    /(?:^|\\)Samples(?:\\|$)/i,
    /(?:^|\\)(?:Sample|Preview)\.png$/i,
    /\.zip$/i,
    /\.url$/i,
    /\.py$/i,
    /renderer(?:_utf8|\.js\.backup)/i,
  ];
  const forbiddenEntries = entries.filter(entry => forbiddenPatterns.some(pattern => pattern.test(entry)));
  if (forbiddenEntries.length) errors.push(`forbidden packaged entries: ${forbiddenEntries.slice(0, 20).join(", ")}`);

  try {
    const indexHtml = asar.extractFile(asarPath, "index.html").toString("utf8");
    const remoteScripts = [...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["']/gi)];
    const remoteStyles = [...indexHtml.matchAll(/<link\b[^>]*\bhref=["']https?:\/\/[^"']+["']/gi)];
    if (remoteScripts.length || remoteStyles.length) errors.push("packaged HTML contains remote runtime dependencies");
  } catch (error) {
    errors.push(`could not inspect packaged index.html: ${error.message}`);
  }
}

if (errors.length) {
  process.stderr.write(`Packaged artifact verification failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

const installerPath = path.join(candidateDir, installers[0]);
const installerStat = fs.statSync(installerPath);
process.stdout.write(`${JSON.stringify({
  ok: true,
  candidateDir,
  installer: installers[0],
  installerBytes: installerStat.size,
  installerSha256: hashFile(installerPath),
  asarBytes: fs.statSync(asarPath).size,
  asarEntries: entries.length,
  forbiddenEntries: 0,
  remoteRuntimeDependencies: 0,
}, null, 2)}\n`);
