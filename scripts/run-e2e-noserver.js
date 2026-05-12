#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const childArgs = args.length ? ["test", ...args] : ["test"];

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

for (const command of candidates) {
  if (!command || command.length === 0) {
    continue;
  }

  const isNpx = command === "npx";
  const spawnArgs = isNpx ? ["playwright", ...childArgs] : childArgs;
  const result = spawnSync(command, spawnArgs, { stdio: "inherit", env: makeEnv });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      continue;
    }
    console.error(`Playwright 실행 실패: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

console.error(
  "Playwright 실행 실패: node_modules/.bin/playwright 또는 npx 경로를 찾지 못했습니다. npm install이 되어 있는지 확인하세요.",
);
process.exit(1);
