import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shimDir = resolve(rootDir, "scripts", "xcrun-shims");
const metalCacheDir = resolve(rootDir, "src-tauri", "target", "clang-module-cache");
const env = {
  ...process.env,
  PATH: [shimDir, process.env.PATH].filter(Boolean).join(":"),
  CLANG_MODULE_CACHE_PATH: process.env.CLANG_MODULE_CACHE_PATH ?? metalCacheDir,
  LUM_METAL_MODULE_CACHE: process.env.LUM_METAL_MODULE_CACHE ?? metalCacheDir,
};

if (process.platform !== "darwin") {
  console.error("tauri:dev:metal은 macOS 전용입니다. 현재 플랫폼에서는 CUDA 실행 경로를 사용하세요.");
  process.exit(1);
}

mkdirSync(env.LUM_METAL_MODULE_CACHE, { recursive: true });

const probe = spawnSync("xcrun", ["metal", "-v"], {
  cwd: rootDir,
  env,
  stdio: "inherit",
});

if (probe.error || probe.status !== 0) {
  console.error(
    "Metal Toolchain을 찾을 수 없습니다. `xcodebuild -downloadComponent MetalToolchain` 실행 후 다시 시도하세요.",
  );
  process.exit(probe.status && probe.status > 0 ? probe.status : 1);
}

const child = spawn("tauri", ["dev", "--features", "embedded-ai"], {
  cwd: rootDir,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Tauri 개발 서버 실행 실패: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
