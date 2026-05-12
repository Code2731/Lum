#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const baseArgs = args.length ? ["test", ...args] : ["test"];
const projectArgSpecified = args.some((value) => value === "--project" || value.startsWith("--project="));
const fallbackProjects = projectArgSpecified
  ? []
  : (process.env.E2E_FALLBACK_PROJECTS || "chromium")
      .split(",")
      .map((project) => project.trim())
      .filter(Boolean);

const finalFallbackProjects = fallbackProjects.length > 0 ? fallbackProjects : ["chromium"];

const testArgMatrix = projectArgSpecified
  ? [baseArgs]
  : finalFallbackProjects.map((project) => [...baseArgs, `--project=${project}`]);

const candidates = [
  process.env.PLAYWRIGHT_BIN,
  join(process.cwd(), "node_modules/.bin/playwright"),
  join(process.cwd(), "node_modules/.bin/playwright.cmd"),
  "npx",
];

const makeEnv = {
  ...process.env,
  E2E_NO_WEB_SERVER: "1",
  E2E_SKIP_WEBSERVER: "1",
};

const launchFailureSignatures = [
  "Target page, context or browser has been closed",
  "browserType.launch",
  "Process exited with code",
  "Executable doesn't exist",
  "Looks like Playwright was just installed or updated",
  "could not launch a browser process",
  "not found. Available projects",
];

const hasLaunchFailure = (output) =>
  launchFailureSignatures.some((signature) => output.includes(signature));

for (const command of candidates) {
  if (!command || command.length === 0) {
    continue;
  }

  const isNpx = command === "npx";
  const runner = isNpx ? "playwright" : undefined;
  for (const testArgs of testArgMatrix) {
    const spawnArgs = isNpx ? [runner, ...testArgs] : testArgs;
    const result = spawnSync(command, spawnArgs, { stdio: "pipe", env: makeEnv });
    const stdout = result.stdout ? new TextDecoder().decode(result.stdout) : "";
    const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
    const output = stdout + stderr;

    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }

    if (result.error) {
      if (result.error.code === "ENOENT") {
        continue;
      }
      console.error(`Playwright 실행 실패: ${result.error.message}`);
      process.exit(1);
    }

    const status = result.status ?? 0;
    if (status === 0) {
      process.exit(0);
    }

    if (projectArgSpecified) {
      process.exit(status);
    }

    const projectIndex = testArgMatrix.indexOf(testArgs);
    const hasNextProject = projectIndex < testArgMatrix.length - 1;
    if (!projectArgSpecified && hasLaunchFailure(output) && hasNextProject) {
      const failedProject = testArgs.find((arg) => arg.startsWith("--project=")) || "unknown";
      console.error(`Playwright 프로젝트 ${failedProject} 실행 실패를 감지했습니다. 다음 프로젝트로 우회합니다.`);
      continue;
    }

    if (!projectArgSpecified && hasLaunchFailure(output) && hasNextProject === false) {
      const failedProject = testArgs.find((arg) => arg.startsWith("--project=")) || "unknown";
      console.error(`Playwright 프로젝트 ${failedProject} 실행 실패 후 fallback 프로젝트가 없습니다.`);
    }

    process.exit(status);
  }
}

console.error(
  "Playwright 실행 실패: node_modules/.bin/playwright 또는 npx 경로를 찾지 못했거나, 모든 fallback 프로젝트가 실패했습니다. npm install이 되어 있는지 확인하세요.",
);
process.exit(1);
