#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);

const candidates = [
  process.env.PLAYWRIGHT_BIN,
  join(process.cwd(), "node_modules/.bin/playwright"),
  join(process.cwd(), "node_modules/.bin/playwright.cmd"),
  "npx",
];

const command = candidates.find((cmd) => cmd && cmd.length > 0) || "npx";
const testArgs = command.endsWith("playwright") || command.endsWith("playwright.cmd")
  ? ["test", ...args]
  : ["playwright", "test", ...args];

const result = spawnSync(command, testArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    E2E_NO_WEB_SERVER: "1",
    E2E_SKIP_WEBSERVER: "1",
  },
});

if (!result || result.error) {
  console.error("Playwright 실행 실패: node_modules/.bin/playwright가 없으면 npm install이 먼저 필요할 수 있습니다.");
  process.exit(1);
}

process.exit(result.status ?? 0);
