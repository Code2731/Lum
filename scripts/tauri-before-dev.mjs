import { execFileSync, spawn } from "node:child_process";

const DEV_URL = "http://127.0.0.1:1420";
const VITE_MARKER = "/@vite/client";
const LUM_TITLE_MARKER = "<title>LUM Terminal</title>";
const LUM_ENTRY_MARKER = 'src="/src/main.tsx"';
const DEV_PORT = 1420;
const JS_DEV_PROCESS_NAMES = new Set([
  "node",
  "vite",
  "npm",
  "npm-cli",
  "pnpm",
  "pnpm-node",
  "yarn",
  "bun",
]);

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
  const allNodeLike = listeners.every(({ command }) =>
    JS_DEV_PROCESS_NAMES.has((command || "").toLowerCase())
  );
  if (allNodeLike) {
    return { type: "node-like", listeners };
  }
  return { type: "other", listeners };
}

function isLumViteHtml(html) {
  if (!html) return false;
  const hasVite = html.includes(VITE_MARKER);
  const hasLumMarker = html.includes(LUM_TITLE_MARKER) && html.includes(LUM_ENTRY_MARKER);
  return hasVite && hasLumMarker;
}

async function fetchDevHtml(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(baseUrl, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
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

function forceStopPids(pids) {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // 이미 종료됐거나 권한 없음 — 아래 상태 점검에서 최종 판단.
    }
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthy(baseUrl, maxMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const html = await fetchDevHtml(baseUrl);
    if (isLumViteHtml(html)) {
      return true;
    }
    await wait(200);
  }
  return false;
}

function formatListeners(listeners) {
  if (!listeners.length) return "none";
  return listeners
    .map((entry) => `${entry.command || "unknown"}(pid:${entry.pid})`)
    .join(", ");
}

async function waitForPortRelease(port, maxMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { type } = classifyListener(port);
    if (type === "none") return true;
    await wait(200);
  }
  return false;
}

async function main() {
  const existingHtml = await fetchDevHtml(DEV_URL);
  if (isLumViteHtml(existingHtml)) {
    console.log(`[tauri-before-dev] Reusing existing Vite server at ${DEV_URL}`);
    process.exit(0);
  }

  const { type: listenerType, listeners } = classifyListener(DEV_PORT);
  if (listenerType === "node-like") {
    console.log(
      `[tauri-before-dev] Stopping existing node/vite listeners on :${DEV_PORT} -> ${formatListeners(listeners)}`
    );
    const pids = listeners.map((entry) => entry.pid);
    stopPids(pids);
    const released = await waitForPortRelease(DEV_PORT, 4000);
    if (!released) {
      console.warn(
        `[tauri-before-dev] Port ${DEV_PORT} still busy after SIGTERM. Sending SIGKILL to ${pids.length} process(es).`
      );
      forceStopPids(pids);
      const releasedAfterKill = await waitForPortRelease(DEV_PORT, 2500);
      if (releasedAfterKill) {
        console.log(`[tauri-before-dev] Port ${DEV_PORT} released after SIGKILL fallback.`);
      } else {
      console.error(
          `[tauri-before-dev] Port ${DEV_PORT} did not release after SIGTERM/SIGKILL. listeners=${formatListeners(
          classifyListener(DEV_PORT).listeners
        )}`
      );
      process.exit(1);
      }
    }
  }

  if (listenerType === "other") {
    console.error(
      `[tauri-before-dev] Port ${DEV_PORT} is in use by a non-node process. listeners=${formatListeners(
        listeners
      )}`
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
