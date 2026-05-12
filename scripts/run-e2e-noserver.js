#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["playwright", "test", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_NO_WEB_SERVER: "1",
    },
  },
);

process.exit(result.status ?? 0);
