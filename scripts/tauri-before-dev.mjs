import { execFileSync, spawn } from "node:child_process";

const DEV_URL = "http://127.0.0.1:1420";
const VITE_MARKER = "/@vite/client";
const DEV_PORT = 1420;

function getListeningCommands(port) {
  if (process.platform === "win32") return [];
  try {
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"],
      { encoding: "utf8" }
    );
    if (!out) return [];
    return out
      .split("\n")
      .filter((line) => line.startsWith("c"))
      .map((line) => line.slice(1).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function classifyListener(port) {
  const commands = getListeningCommands(port);
  if (commands.length === 0) return "none";
  if (commands.some((cmd) => cmd.includes("vite") || cmd === "node")) {
    return "vite-like";
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
  if (listenerType === "vite-like") {
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
