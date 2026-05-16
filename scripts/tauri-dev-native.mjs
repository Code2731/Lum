#!/usr/bin/env node
import { rmSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const baseConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
const randomSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const fallbackConfigPath = path.join(
  tmpdir(),
  `lum-tauri-conf-native-${randomSuffix}.json`
);

const args = process.argv.slice(2);
const tauriArgs = [];
let host = process.env.LUM_DEV_HOST ?? "127.0.0.1";
let port = process.env.LUM_DEV_PORT ?? "1420";
let skipBuild = false;
let keepConfig = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--host" && i + 1 < args.length) {
    host = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--port" && i + 1 < args.length) {
    port = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--skip-build") {
    skipBuild = true;
    continue;
  }
  if (arg === "--keep-config") {
    keepConfig = true;
    continue;
  }
  tauriArgs.push(arg);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const runCommand = (commandArgs) => {
  const result = spawnSync(npmCmd, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
};

const cleanup = () => {
  if (!keepConfig) {
    rmSync(fallbackConfigPath, { force: true });
  }
};

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

const baseConfig = JSON.parse(readFileSync(baseConfigPath, "utf8"));
baseConfig.build = {
  ...baseConfig.build,
  beforeDevCommand: "",
  devUrl: `http://${host}:${port}`,
};

writeFileSync(fallbackConfigPath, JSON.stringify(baseConfig, null, 2));

if (!skipBuild) {
  runCommand(["run", "build"]);
}

runCommand([
  "run",
  "tauri",
  "--",
  "dev",
  "--no-dev-server",
  "--no-dev-server-wait",
  "--config",
  fallbackConfigPath,
  ...tauriArgs,
]);
