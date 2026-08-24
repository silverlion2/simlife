#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const configPath = path.join(root, ".website-sop.yml");

function value(raw) {
  const trimmed = raw.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  return trimmed.replace(/^(["'])(.*)\1$/, "$2");
}

function readConfig() {
  if (!fs.existsSync(configPath)) throw new Error("Missing .website-sop.yml");
  const source = fs.readFileSync(configPath, "utf8");
  const lines = source.split(/\r?\n/);
  const commands = {};
  const requiredDocs = [];
  let section = "";
  let qualityList = "";
  let enforcement = "warn";

  for (const line of lines) {
    const top = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (top) {
      section = top[1];
      qualityList = "";
      continue;
    }
    if (section === "commands") {
      const command = line.match(/^  ([\w-]+):\s*(.*)$/);
      if (command) commands[command[1]] = value(command[2]);
    }
    if (section === "quality") {
      const setting = line.match(/^  ([\w-]+):\s*(.*)$/);
      if (setting) {
        qualityList = setting[1];
        if (setting[1] === "enforcement") enforcement = value(setting[2]) || "warn";
        continue;
      }
      const item = line.match(/^    -\s+(.+)$/);
      if (item && qualityList === "requiredDocs") requiredDocs.push(value(item[1]));
    }
  }

  return { commands, enforcement, requiredDocs };
}

function inspectWorkspace(config) {
  const findings = [];
  if (!fs.existsSync(path.join(root, "AGENTS.md"))) findings.push("missing AGENTS.md");
  if (!fs.existsSync(path.join(root, "package.json"))) findings.push("missing package.json");
  for (const document of config.requiredDocs) {
    if (!fs.existsSync(path.join(root, document))) findings.push(`missing required document: ${document}`);
  }
  for (const command of ["lint", "typecheck", "test", "build"]) {
    if (!(command in config.commands) || !config.commands[command]) findings.push(`missing configured ${command} command`);
  }
  return findings;
}

function reportFindings(config, findings) {
  if (!findings.length) {
    process.stdout.write("web-sop doctor: workspace contract is complete.\n");
    return true;
  }
  for (const finding of findings) process.stderr.write(`web-sop ${config.enforcement}: ${finding}\n`);
  return config.enforcement !== "hard";
}

function doctor() {
  const config = readConfig();
  const ok = reportFindings(config, inspectWorkspace(config));
  return { config, ok };
}

function runCommand(label, command) {
  process.stdout.write(`\nweb-sop ${label}: ${command}\n`);
  const result = spawnSync(command, {
    cwd: root,
    env: process.env,
    shell: true,
    stdio: "inherit",
  });
  if (result.error) {
    process.stderr.write(`web-sop ${label} failed to start: ${result.error.message}\n`);
    return false;
  }
  if (result.status !== 0) {
    process.stderr.write(`web-sop ${label} failed with exit ${result.status}.\n`);
    return false;
  }
  process.stdout.write(`web-sop ${label}: passed.\n`);
  return true;
}

function check(mode) {
  const { config, ok: doctorOk } = doctor();
  if (!doctorOk) return false;
  const labels = mode === "release"
    ? ["typecheck", "lint", "test", "build", "e2e", "audit", "verify"]
    : ["typecheck", "lint", "test", "build"];
  let ok = true;
  for (const label of labels) {
    const command = config.commands[label];
    if (!command) {
      process.stderr.write(`web-sop ${config.enforcement}: skipped unconfigured ${label} gate.\n`);
      if (config.enforcement === "hard") ok = false;
      continue;
    }
    if (!runCommand(label, command)) ok = false;
  }
  if (mode === "release") {
    process.stderr.write("web-sop warn: automated accessibility, responsive visual, production smoke, and rollback evidence require separate release evidence.\n");
  }
  return ok;
}

function usage() {
  process.stderr.write("Usage: web-sop doctor | web-sop check [--mode fast|release]\n");
}

try {
  const [, , command, ...args] = process.argv;
  let ok = false;
  if (command === "doctor") {
    ok = doctor().ok;
  } else if (command === "check") {
    const modeArg = args.find(argument => argument.startsWith("--mode="));
    const modeIndex = args.indexOf("--mode");
    const mode = modeArg ? modeArg.slice("--mode=".length) : modeIndex >= 0 ? args[modeIndex + 1] : "fast";
    if (!new Set(["fast", "release"]).has(mode)) throw new Error(`Unsupported check mode: ${mode}`);
    ok = check(mode);
  } else {
    usage();
  }
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  process.stderr.write(`web-sop: ${error.message}\n`);
  process.exitCode = 1;
}
