"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "assets", "provenance.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];

function exists(relativePath, label) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`missing ${label}: ${relativePath}`);
}

function sha256(relativePath) {
  return crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest("hex")
    .toUpperCase();
}

if (manifest.schemaVersion !== 1) errors.push(`unsupported schemaVersion: ${manifest.schemaVersion}`);

const sourceIds = new Set();
for (const source of manifest.sources || []) {
  if (!source.id || sourceIds.has(source.id)) errors.push(`missing or duplicate source id: ${source.id || "<empty>"}`);
  sourceIds.add(source.id);
  exists(source.path, "source path");
  exists(source.licenseFile, "license file");
  if (!source.license || !source.licenseSha256) errors.push(`incomplete license metadata: ${source.id}`);
  if (fs.existsSync(path.join(root, source.licenseFile)) && sha256(source.licenseFile) !== source.licenseSha256) {
    errors.push(`license checksum mismatch: ${source.licenseFile}`);
  }
  if (source.sourceArchive) {
    exists(source.sourceArchive.path, "source archive");
    if (fs.existsSync(path.join(root, source.sourceArchive.path)) && sha256(source.sourceArchive.path) !== source.sourceArchive.sha256) {
      errors.push(`archive checksum mismatch: ${source.sourceArchive.path}`);
    }
  }
  if (source.duplicateOf && !manifest.sources.some(candidate => candidate.id === source.duplicateOf)) {
    errors.push(`unknown duplicateOf source: ${source.id} -> ${source.duplicateOf}`);
  }
}

for (const output of manifest.generatedOutputs || []) {
  exists(output.path, "generated output");
  exists(output.generator, "generator");
  for (const input of output.inputs || []) exists(input, "generator input");
  if (output.runtimeCatalog) exists(output.runtimeCatalog, "runtime catalog");
}

for (const source of manifest.unresolvedSources || []) {
  exists(source.path, "unresolved source path");
  if (!source.reason) errors.push(`unresolved source lacks a reason: ${source.path}`);
}

const licensedDirectories = fs.readdirSync(path.join(root, "assets"), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => `assets/${entry.name}`)
  .filter(relativePath => fs.existsSync(path.join(root, relativePath, "License.txt")));
const declaredDirectories = new Set((manifest.sources || []).map(source => source.path));
for (const relativePath of licensedDirectories) {
  if (!declaredDirectories.has(relativePath)) errors.push(`licensed asset directory missing from manifest: ${relativePath}`);
}

if (errors.length) {
  process.stderr.write(`Asset provenance verification failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  ok: true,
  sources: manifest.sources.length,
  generatedOutputs: manifest.generatedOutputs.length,
  unresolvedSources: manifest.unresolvedSources.length,
}, null, 2) + "\n");
