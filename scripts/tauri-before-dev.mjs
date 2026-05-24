import { execFileSync, spawn } from "node:child_process";

const DEV_URL = "http://127.0.0.1:1420";
const VITE_MARKER = "/@vite/client";
const DEV_PORT = 1420;

function getListeningPids(port) {
  if (process.platform === "win32") return [];
  try {
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" }
    ).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function isViteProcess(pid) {
  try {
    const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
    }).trim();
    return cmd.includes("vite");
  } catch {
    return false;
  }
}

function classifyListener(port) {
  const pids = getListeningPids(port);
  if (pids.length === 0) return "none";
  if (pids.every((pid) => isViteProcess(pid))) {
    return "vite";
  }
  return "other";
}

async function isHealthyViteServer(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(baseUrl, { signal: controller.signal });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes(VITE_MARKER);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function isPortInUse(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    await fetch(baseUrl, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (await isHealthyViteServer(DEV_URL)) {
    console.log(`[tauri-before-dev] Reusing existing Vite server at ${DEV_URL}`);
    process.exit(0);
  }

  const listenerType = classifyListener(DEV_PORT);
  if (listenerType === "vite") {
    console.log(`[tauri-before-dev] Reusing existing Vite server at ${DEV_URL}`);
    process.exit(0);
  }

  if (listenerType === "other") {
    console.error(
      `[tauri-before-dev] Port 1420 is in use by a non-Vite process. Stop that process and retry.`
    );
    process.exit(1);
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "dev"], { stdio: "inherit" });

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
