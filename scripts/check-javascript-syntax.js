"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const scanRoots = [
  "main.js",
  "preload.js",
  "js",
  "scripts",
  "tests",
  path.join("tools", "web-sop"),
];

function collect(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return absolutePath.endsWith(".js") ? [absolutePath] : [];
  return fs.readdirSync(absolutePath, { withFileTypes: true })
    .flatMap(entry => collect(path.join(relativePath, entry.name)));
}

const files = [...new Set(scanRoots.flatMap(collect))].sort();
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push(`${path.relative(root, file)}\n${result.stderr || result.stdout}`.trim());
  }
}

if (failures.length) {
  process.stderr.write(`JavaScript syntax check failed:\n${failures.join("\n\n")}\n`);
  process.exit(1);
}

process.stdout.write(`JavaScript syntax check passed for ${files.length} files.\n`);
