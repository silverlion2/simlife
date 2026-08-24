"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const requiredPaths = [
  "AGENTS.md",
  ".website-sop.yml",
  path.join(".sop", "manifest.json"),
  "index.html",
  "main.js",
  "preload.js",
  "package.json",
  "tsconfig.typecheck.json",
  path.join("docs", "product-spec.md"),
  path.join("docs", "architecture.md"),
  path.join("docs", "design-system.md"),
  path.join("docs", "test-matrix.md"),
  path.join("docs", "release-checklist.md"),
  path.join("docs", "workspace-layout.md"),
  path.join("tests", "pure", "run.js"),
  path.join("tests", "browser", "run.js"),
  path.join("tests", "electron", "run.js"),
  path.join("scripts", "verify-packaged-artifact.js"),
  path.join("scripts", "verify-packaged-runtime.js"),
  path.join("scripts", "generate-avatar-assets.js"),
  path.join("scripts", "generate-world-assets.js"),
  path.join("tools", "web-sop", "package.json"),
  path.join("tools", "typecheck", "simlife-globals.d.ts"),
  path.join("assets", "provenance.json"),
  path.join("artifacts", ".gitkeep"),
];
const allowedRootFiles = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".website-sop.yml",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "index.html",
  "main.js",
  "package-lock.json",
  "package.json",
  "preload.js",
  "tsconfig.typecheck.json",
]);
const allowedTopLevelDirectories = new Set([
  ".github",
  ".sop",
  "artifacts",
  "assets",
  "build",
  "css",
  "docs",
  "js",
  "scripts",
  "tests",
  "tools",
  "vendor",
]);
const removedLegacyRootFiles = [
  "check.py",
  "check_load.py",
  "farm_assets.txt",
  "generate_banana.py",
  "generate_svgs.py",
  "series.html",
  "tmp_screenshot.js",
];
const removedLegacySourceFiles = [
  path.join("js", "renderer.js.backup"),
  path.join("js", "renderer_utf8.js"),
  path.join("js", "dump_sprites.py"),
  path.join("js", "generate_html.py"),
  path.join("js", "inject_new.py"),
  path.join("js", "list_props.py"),
];
const errors = [];

for (const relativePath of requiredPaths) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`missing required path: ${relativePath}`);
}

let trackedFiles = [];
try {
  trackedFiles = execFileSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter(relativePath => fs.existsSync(path.join(root, relativePath)));
} catch (error) {
  errors.push(`could not enumerate tracked files: ${error.message}`);
}

const unexpectedRootFiles = trackedFiles
  .filter(relativePath => !relativePath.includes("/") && !allowedRootFiles.has(relativePath))
  .sort();
if (unexpectedRootFiles.length) errors.push(`unexpected tracked root files: ${unexpectedRootFiles.join(", ")}`);

const unexpectedDirectories = [...new Set(trackedFiles
  .filter(relativePath => relativePath.includes("/"))
  .map(relativePath => relativePath.split("/")[0])
  .filter(directory => !allowedTopLevelDirectories.has(directory)))]
  .sort();
if (unexpectedDirectories.length) errors.push(`unexpected tracked top-level directories: ${unexpectedDirectories.join(", ")}`);

const trackedArtifacts = trackedFiles.filter(relativePath => relativePath.startsWith("artifacts/"));
if (trackedArtifacts.length !== 1 || trackedArtifacts[0] !== "artifacts/.gitkeep") {
  errors.push(`artifacts must track only artifacts/.gitkeep, found: ${trackedArtifacts.join(", ") || "none"}`);
}
if (trackedFiles.some(relativePath => relativePath.startsWith(".gemini/"))) {
  errors.push(".gemini content must remain local and untracked");
}

const remainingLegacyFiles = removedLegacyRootFiles.filter(relativePath => fs.existsSync(path.join(root, relativePath)));
if (remainingLegacyFiles.length) errors.push(`legacy root files still present: ${remainingLegacyFiles.join(", ")}`);
const remainingLegacySourceFiles = removedLegacySourceFiles.filter(relativePath => fs.existsSync(path.join(root, relativePath)));
if (remainingLegacySourceFiles.length) errors.push(`legacy source files still present: ${remainingLegacySourceFiles.join(", ")}`);

const config = fs.readFileSync(path.join(root, ".website-sop.yml"), "utf8");
for (const sourceRoot of ["js", "css"]) {
  if (!new RegExp(`^\\s+- ${sourceRoot}\\s*$`, "m").test(config)) {
    errors.push(`missing declared source root: ${sourceRoot}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.devDependencies?.["@rave-index/web-sop"] !== "file:tools/web-sop") {
  errors.push("package.json must pin @rave-index/web-sop to file:tools/web-sop");
}
for (const script of ["lint", "typecheck", "build", "verify:structure", "verify:assets", "verify:generated", "verify:artifact", "verify:artifact-runtime", "sop:doctor", "sop:check"]) {
  if (!packageJson.scripts?.[script]) errors.push(`missing package script: ${script}`);
}
if (packageJson.devDependencies?.typescript !== "7.0.2") {
  errors.push("package.json must pin TypeScript 7.0.2 for reproducible JavaScript analysis");
}

const toolPackage = JSON.parse(fs.readFileSync(path.join(root, "tools", "web-sop", "package.json"), "utf8"));
if (toolPackage.version !== "1.0.0" || toolPackage.bin?.["web-sop"] !== "bin/web-sop.js") {
  errors.push("tools/web-sop package metadata does not match the pinned 1.0.0 contract");
}

const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
if (packageLock.packages?.["node_modules/@rave-index/web-sop"]?.resolved !== "tools/web-sop") {
  errors.push("package-lock.json is missing the installed local web-sop link");
}
if (packageLock.packages?.["tools/web-sop"]?.name !== "@rave-index/web-sop") {
  errors.push("package-lock.json is missing the local web-sop package record");
}

if (errors.length) {
  process.stderr.write(`Workspace structure verification failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  ok: true,
  requiredPaths: requiredPaths.length,
  trackedRootFiles: trackedFiles.filter(relativePath => !relativePath.includes("/")).length,
  trackedTopLevelDirectories: [...new Set(trackedFiles.filter(relativePath => relativePath.includes("/")).map(relativePath => relativePath.split("/")[0]))].length,
  sourceRoots: ["js", "css"],
}, null, 2) + "\n");
