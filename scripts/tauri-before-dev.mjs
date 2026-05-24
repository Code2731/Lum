import { execFileSync, spawn } from "node:child_process";

const DEV_URL = "http://127.0.0.1:1420";
const VITE_MARKER = "/@vite/client";
const DEV_PORT = 1420;

function getListeners(port) {
  if (process.platform === "win32") return [];
  try {
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"],
      { encoding: "utf8" }
    );
    if (!out) return [];
    const lines = out.split("\n");
    const listeners = [];
    let currentPid = null;
    let currentCommand = "";
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("p")) {
        if (currentPid !== null) {
          listeners.push({ pid: currentPid, command: currentCommand });
        }
        const parsed = Number(line.slice(1).trim());
        currentPid = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        currentCommand = "";
      } else if (line.startsWith("c")) {
        currentCommand = line.slice(1).trim();
      }
    }
    if (currentPid !== null) {
      listeners.push({ pid: currentPid, command: currentCommand });
    }
    return listeners;
  } catch {
    return [];
  }
}

function classifyListener(port) {
  const listeners = getListeners(port);
  if (listeners.length === 0) return { type: "none", listeners: [] };
  const allNodeLike = listeners.every(
    ({ command }) => command === "node" || command === "vite"
  );
  if (allNodeLike) {
    return { type: "node-like", listeners };
  }
  return { type: "other", listeners };
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

function stopPids(pids) {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore failures; if stop fails, next health check/start will surface it.
    }
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthy(baseUrl, maxMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await isHealthyViteServer(baseUrl)) {
      return true;
    }
    await wait(200);
  }
  return false;
}

async function main() {
  if (await isHealthyViteServer(DEV_URL)) {
    console.log(`[tauri-before-dev] Reusing existing Vite server at ${DEV_URL}`);
    process.exit(0);
  }

  const { type: listenerType, listeners } = classifyListener(DEV_PORT);
  if (listenerType === "node-like") {
    stopPids(listeners.map((entry) => entry.pid));
    await wait(500);
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
