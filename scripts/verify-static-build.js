"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const errors = [];
const requiredRuntimePaths = ["index.html", "main.js", "preload.js", "css", "js", "assets", "vendor"];
const requiredPackageEntries = ["index.html", "main.js", "preload.js", "css/**/*", "js/**/*", "assets/**/*", "vendor/**/*", "package.json"];
const requiredSourceExclusions = [
  "!assets/**/*.zip",
  "!assets/isokennynl/**/*",
  "!assets/kenney_dungeon/**/*",
  "!assets/kenney_library/**/*",
  "!assets/kenney_minifarm/**/*",
  "!assets/kenney_pack_temp/**/*",
  "!assets/**/Samples/**/*",
  "!assets/**/Sample.png",
  "!assets/**/Preview.png",
  "!assets/**/*.url",
  "!js/**/*.py",
];

for (const relativePath of requiredRuntimePaths) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`missing runtime path: ${relativePath}`);
}

const packageFiles = new Set(packageJson.build?.files || []);
for (const entry of requiredPackageEntries) {
  if (!packageFiles.has(entry)) errors.push(`Electron package manifest is missing: ${entry}`);
}
for (const entry of requiredSourceExclusions) {
  if (!packageFiles.has(entry)) errors.push(`Electron package manifest is missing source-only exclusion: ${entry}`);
}

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const remoteRuntimeScripts = [...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["']/gi)]
  .map(match => match[0]);
if (remoteRuntimeScripts.length) errors.push(`remote runtime scripts found: ${remoteRuntimeScripts.join(", ")}`);

const cssFiles = fs.readdirSync(path.join(root, "css"))
  .filter(file => file.endsWith(".css"))
  .map(file => path.join(root, "css", file));
const remoteStyleDependencies = cssFiles.flatMap(file => {
  const source = fs.readFileSync(file, "utf8");
  return source.split(/\r?\n/)
    .map((line, index) => ({ file: path.relative(root, file), line: index + 1, text: line.trim() }))
    .filter(item => /(?:@import\s+url\(|url\()\s*["']?https?:\/\//i.test(item.text));
});
if (remoteStyleDependencies.length) {
  errors.push(`remote stylesheet dependencies found: ${remoteStyleDependencies.map(item => `${item.file}:${item.line}`).join(", ")}`);
}

if (errors.length) {
  process.stderr.write(`Static build verification failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  ok: true,
  runtimePaths: requiredRuntimePaths,
  packageEntries: requiredPackageEntries.length,
  sourceOnlyExclusions: requiredSourceExclusions.length,
  remoteRuntimeScripts: 0,
  remoteStyleDependencies: 0,
}, null, 2) + "\n");
