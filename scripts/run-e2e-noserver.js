#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const baseArgs = args.length ? ["test", ...args] : ["test"];

const isProjectValue = (value) => typeof value === "string" && value.trim() !== "" && !value.startsWith("--");
const getProjectArgInfo = (rawArgs) => {
  const occurrences = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--project") {
      const nextValue = rawArgs[index + 1];
      if (!isProjectValue(nextValue)) {
        throw new Error("Playwright 실행 인자 오류: `--project` 뒤에 프로젝트 이름이 필요합니다. 예: `--project chromium`");
      }
      occurrences.push(nextValue.trim());
      index += 1;
      continue;
    }

    if (arg.startsWith("--project=")) {
      const inlineValue = arg.slice("--project=".length).trim();
      if (!inlineValue) {
        throw new Error(
          "Playwright 실행 인자 오류: `--project=` 뒤에 프로젝트 이름이 필요합니다. 예: `--project=chromium`",
        );
      }
      occurrences.push(inlineValue);
    }
  }

  if (occurrences.length === 0) {
    return { specified: false, value: "unknown" };
  }

  if (occurrences.length > 1) {
    throw new Error(
      "Playwright 실행 인자 오류: `--project`는 중복으로 지정할 수 없습니다. `--project=이름` 또는 `--project 이름` 중 한 번만 사용하세요.",
    );
  }

  return { specified: true, value: occurrences[0] };
};

let projectArgInfo;
try {
  projectArgInfo = getProjectArgInfo(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const projectArgSpecified = projectArgInfo.specified;
const explicitProject = projectArgInfo.value;

const fallbackProjects = projectArgSpecified
  ? []
  : (process.env.E2E_FALLBACK_PROJECTS || "chromium")
      .split(",")
      .map((project) => project.trim())
      .filter(Boolean);

const finalFallbackProjects = fallbackProjects.length > 0 ? fallbackProjects : ["chromium"];
const displayProjects = projectArgSpecified ? [explicitProject] : finalFallbackProjects;

const testArgMatrix = projectArgSpecified
  ? [baseArgs]
  : finalFallbackProjects.map((project) => [...baseArgs, `--project=${project}`]);

const candidates = [
  process.env.PLAYWRIGHT_BIN,
  join(process.cwd(), "node_modules/.bin/playwright"),
  join(process.cwd(), "node_modules/.bin/playwright.cmd"),
  "npx",
];

const isVerbose = process.env.E2E_VERBOSE === "1";
const isDryRun = process.env.E2E_DRY_RUN === "1";

const makeEnv = {
  ...process.env,
  E2E_NO_WEB_SERVER: "1",
  E2E_SKIP_WEBSERVER: "1",
};

const launchProfileTemplates = {
  default: {},
  "bundled-chromium": { E2E_USE_PLAYWRIGHT_CHROMIUM: "1" },
  headful: { E2E_HEADLESS: "0" },
  "no-sandbox": {
    E2E_CHROMIUM_ARGS: "--disable-gpu --disable-dev-shm-usage --no-sandbox",
  },
};

const defaultLaunchProfiles = ["default", "bundled-chromium", "headful", "no-sandbox"];
const rawLaunchProfiles = process.env.E2E_LAUNCH_PROFILES
  ? process.env.E2E_LAUNCH_PROFILES.split(",").map((profile) => profile.trim()).filter(Boolean)
  : defaultLaunchProfiles;

const dedup = new Set();
const launchProfileList = [];
const skippedProfiles = [];
for (const profileName of rawLaunchProfiles) {
  const key = profileName.toLowerCase();
  if (!launchProfileTemplates[key]) {
    skippedProfiles.push(profileName);
    continue;
  }
  if (dedup.has(key)) {
    continue;
  }
  dedup.add(key);
  launchProfileList.push({ name: key, env: launchProfileTemplates[key] });
}
if (launchProfileList.length === 0) {
  launchProfileList.push({ name: "default", env: launchProfileTemplates.default });
}
if (skippedProfiles.length > 0) {
  console.error(
    `[E2E-WARN] 알 수 없는 E2E_LAUNCH_PROFILES 값이 있어 건너뜁니다: ${skippedProfiles.join(", ")}`,
  );
  console.error(`[E2E-HINT] 사용 가능한 launch profile: ${Object.keys(launchProfileTemplates).join(", ")}`);
}
const launchFallbackProfiles = launchProfileList;

const getProjectFromArgs = (testArgs) => {
  const inline = testArgs.find((arg) => arg.startsWith("--project="));
  if (inline) {
    const value = inline.split("=", 2)[1]?.trim();
    return value ? value : "unknown";
  }

  const index = testArgs.findIndex((arg) => arg === "--project");
  if (index !== -1 && index + 1 < testArgs.length) {
    const value = testArgs[index + 1]?.trim();
    return value ? value : "unknown";
  }

  return "unknown";
};

const launchFailureSignatures = [
  "Target page, context or browser has been closed",
  "browserType.launch",
  "Process exited with code",
  "Executable doesn't exist",
  "Looks like Playwright was just installed or updated",
  "could not launch a browser process",
  "not found. Available projects",
  "chrome_crashpad_handler: --database is required",
  "bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer",
  "Permission denied (1100)",
  "Check failed: kr == KERN_SUCCESS",
  "kill EPERM",
];
const unrecoverableLaunchSignatures = [
  "chrome_crashpad_handler: --database is required",
  "Permission denied (1100)",
  "bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer",
  "Check failed: kr == KERN_SUCCESS",
];

const launchFailureHints = [
  {
    matches: (output) =>
      output.includes("bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer") ||
      output.includes("Permission denied (1100)"),
    message:
      "권한 제한으로 Mach port 초기화가 실패했습니다. 이 환경에서는 `E2E_HEADLESS=0`(headful) 또는 별도 Playwright 환경에서의 실행을 먼저 확인하세요. " +
      "`E2E_USE_PLAYWRIGHT_CHROMIUM=1` + `E2E_CHROMIUM_ARGS=--disable-gpu --disable-dev-shm-usage --no-sandbox`를 조합해도 실패한다면, 브라우저 바이너리 설치 상태 및 샌드박스 권한을 점검하세요.",
  },
  {
    matches: (output) => output.includes("Executable doesn't exist"),
    message:
      "브라우저 실행 파일이 없다는 오류가 확인되었습니다. `npx playwright install --with-deps chromium` 또는 `npx playwright install` 후 다시 실행하세요.",
  },
  {
    matches: (output) => output.includes("could not launch a browser process"),
    message: "브라우저 프로세스 런치 실패입니다. `E2E_FALLBACK_PROJECTS`는 프로젝트(브라우저 종류) 순서를 바꾸거나 `E2E_USE_PLAYWRIGHT_CHROMIUM=1`을 적용해 보세요.",
  },
  {
    matches: (output) =>
      output.includes("chrome_crashpad_handler: --database is required") ||
      output.includes("Check failed: kr == KERN_SUCCESS") ||
      output.includes("kill EPERM"),
    message:
      "브라우저 런타임 초기화 충돌이 감지되었습니다. `E2E_USE_PLAYWRIGHT_CHROMIUM=1` + `E2E_CHROMIUM_ARGS=--disable-gpu --disable-dev-shm-usage --no-sandbox` 조합 또는 `E2E_HEADLESS=0`(headful)로 재시도해 보세요.",
  },
];

const printFailureHints = (output) => {
  const seen = new Set();
  for (const hint of launchFailureHints) {
    if (hint.matches(output) && !seen.has(hint.message)) {
      console.error(`[E2E-HELP] ${hint.message}`);
      seen.add(hint.message);
    }
  }
};

const buildCommandEnv = (profile) => ({
  ...makeEnv,
  ...profile.env,
});

const printInfo = (...messages) => {
  if (isVerbose || isDryRun) {
    for (const message of messages) {
      console.error(`[E2E-INFO] ${message}`);
    }
  }
};

const hasLaunchFailure = (output) =>
  launchFailureSignatures.some((signature) => output.includes(signature));
const hasUnrecoverableLaunchFailure = (output) =>
  unrecoverableLaunchSignatures.some((signature) => output.includes(signature));

if (isDryRun) {
  printInfo("Dry-run enabled. No tests will be executed.");
  if (projectArgSpecified) {
    printInfo(`project filter: explicit --project 사용 (${explicitProject})`);
  } else {
    printInfo("project filter: fallback 프로젝트 순회");
  }
  printInfo(`launch projects: ${displayProjects.join(", ")}`);
  printInfo(`launch profiles: ${launchFallbackProfiles.map((profile) => profile.name).join(", ")}`);
  printInfo(
    `playwright candidates: ${candidates.filter((candidate) => Boolean(candidate) && candidate.length > 0).join(", ")}`,
  );
  printInfo(`total attempts 예상: ${candidates.filter((candidate) => Boolean(candidate) && candidate.length > 0).length * launchFallbackProfiles.length * testArgMatrix.length}개`);
  process.exit(0);
}

for (const command of candidates) {
  if (!command || command.length === 0) {
    continue;
  }

  const isNpx = command === "npx";
  const runner = isNpx ? "playwright" : undefined;
  for (const testArgs of testArgMatrix) {
    const failedProfiles = [];
    let lastStatus = null;
    let lastOutput = "";
    let commandUnavailable = false;

    let unrecoverable = false;
    for (const profileIndex of launchFallbackProfiles.keys()) {
      const profile = launchFallbackProfiles[profileIndex];
      const spawnArgs = isNpx ? [runner, ...testArgs] : testArgs;
      const result = spawnSync(command, spawnArgs, { stdio: "pipe", env: buildCommandEnv(profile) });
      const stdout = result.stdout ? new TextDecoder().decode(result.stdout) : "";
      const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
      const output = stdout + stderr;
      lastOutput = output;
      lastStatus = result.status ?? 0;

      if (stdout) {
        process.stdout.write(stdout);
      }
      if (stderr) {
        process.stderr.write(stderr);
      }

      if (result.error) {
        if (result.error.code === "ENOENT") {
          commandUnavailable = true;
          break;
        }
        console.error(`Playwright 실행 실패: ${result.error.message}`);
        process.exit(1);
      }

      if (lastStatus === 0) {
        process.exit(0);
      }

      if (hasUnrecoverableLaunchFailure(output)) {
        unrecoverable = true;
        break;
      }

      if (!hasLaunchFailure(output)) {
        break;
      }

      const failedProfile = profile.name;
      const failedProject = getProjectFromArgs(testArgs);
      if (profileIndex < launchFallbackProfiles.length - 1) {
        failedProfiles.push(failedProfile);
        console.error(
          `Playwright 프로젝트 ${failedProject}에서 launch profile '${failedProfile}' 실패를 감지했습니다. 다음 launch profile로 재시도합니다.`,
        );
        continue;
      }

      if (failedProfiles.length > 0) {
        console.error(
          `Playwright 프로젝트 ${failedProject}에서 launch profile 실패 이력: ${failedProfiles.join(", ")} → ${failedProfile}`,
        );
      }
      break;
    }

    if (unrecoverable) {
      const failedProject = getProjectFromArgs(testArgs);
      console.error(
        `Playwright 프로젝트 ${failedProject}에서 복구 불가 launch 오류가 감지되었습니다. 더 진행하지 않고 중단합니다.`,
      );
      printFailureHints(lastOutput);
      process.exit(lastStatus ?? 1);
    }

    if (commandUnavailable) {
      continue;
    }

    const status = lastStatus ?? 1;
    if (status === 0) {
      continue;
    }

    if (!projectArgSpecified) {
      const projectIndex = testArgMatrix.indexOf(testArgs);
      const hasNextProject = projectIndex < testArgMatrix.length - 1;
      const failedProject = getProjectFromArgs(testArgs);
      if (hasLaunchFailure(lastOutput) && hasNextProject) {
        console.error(`Playwright 프로젝트 ${failedProject} 실행 실패를 감지했습니다. 다음 프로젝트로 우회합니다.`);
        continue;
      }
      if (hasLaunchFailure(lastOutput) && !hasNextProject) {
        console.error(`Playwright 프로젝트 ${failedProject} 실행 실패 후 fallback 프로젝트가 없습니다.`);
      }
      if (hasLaunchFailure(lastOutput)) {
        printFailureHints(lastOutput);
      }
      process.exit(status);
    }

    process.exit(status);
  }
}

console.error(
  "Playwright 실행 실패: node_modules/.bin/playwright 또는 npx 경로를 찾지 못했거나, 모든 fallback 프로젝트가 실패했습니다. npm install이 되어 있는지 확인하세요.",
);
process.exit(1);
