import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/run-e2e-noserver.js");

const runScript = (
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
  cwdOverride: string = process.cwd(),
) => {
  const env = {
    ...process.env,
    E2E_DRY_RUN: "1",
    E2E_VERBOSE: "1",
    ...envOverrides,
  };

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: cwdOverride,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    status: typeof result.status === "number" ? result.status : 1,
    output,
  };
};

const makeMockPlaywright = ({
  stdout = "",
  stderr = "",
  exitCode = 1,
}: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}) => {
  const dir = mkdtempSync(join(tmpdir(), "lum-playwright-mock-"));
  const commandPath = join(dir, "mock-playwright.js");
  const script = [
    `#!${process.execPath}`,
    `process.stdout.write(${JSON.stringify(stdout)});`,
    `process.stderr.write(${JSON.stringify(stderr)});`,
    `process.exit(${exitCode});`,
    "",
  ].join("\n");
  writeFileSync(commandPath, script, "utf8");
  chmodSync(commandPath, 0o755);

  return {
    commandPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
};

const makeMockPlaywrightAt = ({
  commandPath,
  stdout = "",
  stderr = "",
  exitCode = 1,
}: {
  commandPath: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}) => {
  mkdirSync(dirname(commandPath), { recursive: true });
  const interpreter = process.execPath;
  const script = [
    `#!${interpreter}`,
    `process.stdout.write(${JSON.stringify(stdout)});`,
    `process.stderr.write(${JSON.stringify(stderr)});`,
    `process.exit(${exitCode});`,
    "",
  ].join("\n");
  writeFileSync(commandPath, script, "utf8");
  chmodSync(commandPath, 0o755);

  return {
    commandPath,
  };
};

const makeMockPlaywrightByProject = ({
  commandPath,
  projectBehaviors,
}: {
  commandPath: string;
  projectBehaviors: Record<
    string,
    {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    }
  >;
}) => {
  const fallbackBehavior = {
    stdout: "",
    stderr: "",
    exitCode: 1,
  };
  const behaviors = Object.entries(projectBehaviors).reduce(
    (acc, [project, behavior]) => {
      acc[project] = {
        stdout: behavior.stdout ?? "",
        stderr: behavior.stderr ?? "",
        exitCode: typeof behavior.exitCode === "number" ? behavior.exitCode : 1,
      };
      return acc;
    },
    {} as Record<string, { stdout: string; stderr: string; exitCode: number }>,
  );

  const script = [
    `#!${process.execPath}`,
    "const behaviors = " + JSON.stringify(behaviors) + ";",
    "const fallback = " + JSON.stringify(fallbackBehavior) + ";",
    "const args = process.argv.slice(2);",
    'const projectArg = args.find((arg) => arg.startsWith("--project="))?.split("=", 2)[1]?.trim() ?? "chromium";',
    "const behavior = behaviors[projectArg] || fallback;",
    "process.stdout.write(behavior.stdout);",
    "process.stderr.write(behavior.stderr);",
    "process.exit(behavior.exitCode);",
    "",
  ].join("\n");

  mkdirSync(dirname(commandPath), { recursive: true });
  writeFileSync(commandPath, script, "utf8");
  chmodSync(commandPath, 0o755);

  return {
    commandPath,
  };
};

const makeMockPlaywrightByProfile = ({
  commandPath,
  profileBehaviors,
}: {
  commandPath: string;
  profileBehaviors: Record<
    string,
    {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    }
  >;
}) => {
  const fallback = {
    stdout: "",
    stderr: "",
    exitCode: 1,
  };
  const normalizeProfile = `
    const env = process.env;
    if (env.E2E_HEADLESS === "0") return "headful";
    if (env.E2E_USE_PLAYWRIGHT_CHROMIUM === "1") return "bundled-chromium";
    if (env.E2E_CHROMIUM_ARGS?.includes("--no-sandbox")) return "no-sandbox";
    return "default";
  `;

  const script = [
    `#!${process.execPath}`,
    "const behaviors = " + JSON.stringify(profileBehaviors) + ";",
    "const fallback = " + JSON.stringify(fallback) + ";",
    "const detectProfile = () => {",
    normalizeProfile,
    "};",
    "const profile = detectProfile();",
    "const behavior = behaviors[profile] || fallback;",
    "process.stdout.write(behavior.stdout || \"\");",
    "process.stderr.write(behavior.stderr || \"\");",
    "process.exit(typeof behavior.exitCode === \"number\" ? behavior.exitCode : 1);",
    "",
  ].join("\n");

  mkdirSync(dirname(commandPath), { recursive: true });
  writeFileSync(commandPath, script, "utf8");
  chmodSync(commandPath, 0o755);

  return {
    commandPath,
  };
};

describe("run-e2e-noserver --project 인자", () => {
  it("inline 형태 --project= 값이 정상 처리된다", () => {
    const result = runScript(["--project=chromium", "--grep", "x"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("project filter: explicit --project 사용 (chromium)");
    expect(result.output).toContain("launch projects: chromium");
  });

  it("분리형 형태 --project 값이 정상 처리된다", () => {
    const result = runScript(["--project", "chromium", "--grep", "x"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("project filter: explicit --project 사용 (chromium)");
  });

  it("중복된 --project 지정은 에러로 실패한다", () => {
    const result = runScript(["--project", "chromium", "--project=firefox", "--grep", "x"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("중복으로 지정할 수 없습니다");
  });

  it("기본 동작에서는 fallback 프로젝트 순회 로그가 출력된다", () => {
    const result = runScript(["--grep", "x"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("project filter: fallback 프로젝트 순회");
    expect(result.output).toContain("launch projects: chromium");
  });

  it("E2E_FALLBACK_PROJECTS 환경변수가 있으면 해당 프로젝트 순서로 출력된다", () => {
    const result = runScript(["--grep", "x"], { E2E_FALLBACK_PROJECTS: "firefox,webkit" });

    expect(result.status).toBe(0);
    expect(result.output).toContain("launch projects: firefox, webkit");
    expect(result.output).toContain("project filter: fallback 프로젝트 순회");
  });

  it("E2E_FALLBACK_PROJECTS가 비면 chromium으로 fallback 된다", () => {
    const result = runScript(["--grep", "x"], { E2E_FALLBACK_PROJECTS: " ,  , " });

    expect(result.status).toBe(0);
    expect(result.output).toContain("launch projects: chromium");
  });

  it("명시적 --project는 fallback 환경변수와 무관하게 한 프로젝트만 사용한다", () => {
    const result = runScript(["--project=chromium", "--grep", "x"], {
      E2E_FALLBACK_PROJECTS: "firefox,webkit",
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain("project filter: explicit --project 사용 (chromium)");
    expect(result.output).toContain("launch projects: chromium");
    expect(result.output).not.toContain("launch projects: firefox, webkit");
  });

  it("알 수 없는 launch profile은 경고하고 유효 profile만 사용한다", () => {
    const result = runScript(["--grep", "x"], { E2E_LAUNCH_PROFILES: "default,unknown,headful" });

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      "[E2E-WARN] 알 수 없는 E2E_LAUNCH_PROFILES 값이 있어 건너뜁니다: unknown",
    );
    expect(result.output).toContain(
      "[E2E-HINT] 사용 가능한 launch profile: default, bundled-chromium, headful, no-sandbox",
    );
    expect(result.output).toContain("launch profiles: default, headful");
  });

  it("launch profile 중복은 dedup 되며, 모두 잘못되면 default만 사용한다", () => {
    const result = runScript(["--grep", "x"], { E2E_LAUNCH_PROFILES: "unknown,bad,not-exist" });

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      "[E2E-WARN] 알 수 없는 E2E_LAUNCH_PROFILES 값이 있어 건너뜁니다: unknown, bad, not-exist",
    );
    expect(result.output).toContain("launch profiles: default");
  });

  it("launch profile 대소문자/중복은 정규화 후 dedup 된다", () => {
    const result = runScript(["--grep", "x"], { E2E_LAUNCH_PROFILES: "Headful,headful,DEFAULT,bUndled-chromium,default" });

    expect(result.status).toBe(0);
    expect(result.output).toContain("launch profiles: headful, default, bundled-chromium");
  });

  it("recoverable launch 실패는 다음 launch profile로 재시도한다", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lum-playwright-profile-retry-"));
    const localPlaywright = join(tempDir, "node_modules", ".bin", "playwright");

    try {
      makeMockPlaywrightByProfile({
        commandPath: localPlaywright,
        profileBehaviors: {
          default: {
            stderr: "could not launch a browser process\n",
            exitCode: 1,
          },
          "no-sandbox": {
            stdout: "mocked no-sandbox success\n",
            exitCode: 0,
          },
        },
      });

      const result = runScript(
        ["--grep", "x"],
        {
          E2E_DRY_RUN: "0",
          E2E_VERBOSE: "1",
          E2E_LAUNCH_PROFILES: "default,no-sandbox",
          PLAYWRIGHT_BIN: localPlaywright,
        },
        tempDir,
      );

      expect(result.status).toBe(0);
      expect(result.output).toContain("mocked no-sandbox success");
      expect(result.output).toContain(
        "Playwright 프로젝트 chromium에서 launch profile 'default' 실패를 감지했습니다. 다음 launch profile로 재시도합니다.",
      );
      expect(result.output).not.toContain("launch profile 실패 이력");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("unrecoverable launch 실패는 launch profile fallback를 건너뛴다", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lum-playwright-profile-stop-"));
    const localPlaywright = join(tempDir, "node_modules", ".bin", "playwright");

    try {
      makeMockPlaywrightByProfile({
        commandPath: localPlaywright,
        profileBehaviors: {
          default: {
            stderr: "Permission denied (1100)\n",
            exitCode: 1,
          },
          "no-sandbox": {
            stdout: "mocked no-sandbox success\n",
            exitCode: 0,
          },
        },
      });

      const result = runScript(
        ["--grep", "x"],
        {
          E2E_DRY_RUN: "0",
          E2E_VERBOSE: "1",
          E2E_LAUNCH_PROFILES: "default,no-sandbox",
          PLAYWRIGHT_BIN: localPlaywright,
        },
        tempDir,
      );

      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "Playwright 프로젝트 chromium에서 복구 불가 launch 오류가 감지되었습니다. 더 진행하지 않고 중단합니다.",
      );
      expect(result.output).not.toContain("mocked no-sandbox success");
      expect(result.output).not.toContain("다음 launch profile로 재시도합니다.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("모든 Playwright 후보가 없으면 최종 에러로 종료된다", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lum-playwright-noserver-"));
    try {
      const result = runScript(
        ["--grep", "x"],
        {
          E2E_DRY_RUN: "0",
          E2E_VERBOSE: "1",
          E2E_LAUNCH_PROFILES: "default",
          PLAYWRIGHT_BIN: "/definitely-does-not-exist/playwright",
          PATH: "",
        },
        tempDir,
      );

      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "Playwright 실행 실패: node_modules/.bin/playwright 또는 npx 경로를 찾지 못했거나, 모든 fallback 프로젝트가 실패했습니다.",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("PLAYWRIGHT_BIN이 없어도 node_modules/.bin/playwright가 있으면 사용한다", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lum-playwright-fallback-"));
    const localPlaywright = join(tempDir, "node_modules", ".bin", "playwright");

    try {
      makeMockPlaywrightAt({
        commandPath: localPlaywright,
        stdout: "mocked playwright success\n",
        exitCode: 0,
      });

      const result = runScript(
        ["--grep", "x"],
        {
          E2E_DRY_RUN: "0",
          E2E_VERBOSE: "1",
          E2E_LAUNCH_PROFILES: "default",
          PLAYWRIGHT_BIN: "/definitely-does-not-exist/playwright",
          E2E_FALLBACK_PROJECTS: "chromium",
          PATH: "",
        },
        tempDir,
      );

      expect(result.status).toBe(0);
      expect(result.output).toContain("mocked playwright success");
      expect(result.output).not.toContain(
        "Playwright 실행 실패: node_modules/.bin/playwright 또는 npx 경로를 찾지 못했거나, 모든 fallback 프로젝트가 실패했습니다.",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("PLAYWRIGHT_BIN과 로컬 playwright가 없어도 npx로 fallback 실행된다", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lum-playwright-npx-fallback-"));

    try {
      makeMockPlaywrightAt({
        commandPath: join(tempDir, "npx"),
        stdout: "mocked npx success\n",
        exitCode: 0,
      });

      const result = runScript(
        ["--grep", "x"],
        {
          E2E_DRY_RUN: "0",
          E2E_VERBOSE: "1",
          E2E_LAUNCH_PROFILES: "default",
          PLAYWRIGHT_BIN: "/definitely-does-not-exist/playwright",
          E2E_FALLBACK_PROJECTS: "chromium",
          PATH: `${tempDir}`,
        },
        tempDir,
      );

      expect(result.status).toBe(0);
      expect(result.output).toContain("mocked npx success");
      expect(result.output).not.toContain(
        "Playwright 실행 실패: node_modules/.bin/playwright 또는 npx 경로를 찾지 못했거나, 모든 fallback 프로젝트가 실패했습니다.",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("firefox 실패 후 webkit 프로젝트로 fallback하여 최종 성공한다", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lum-playwright-project-fallback-"));
    const localPlaywright = join(tempDir, "node_modules", ".bin", "playwright");

    try {
      makeMockPlaywrightByProject({
        commandPath: localPlaywright,
        projectBehaviors: {
          firefox: {
            stderr: "could not launch a browser process\n",
            exitCode: 1,
          },
          webkit: {
            stdout: "mocked webkit success\n",
            exitCode: 0,
          },
        },
      });

      const result = runScript(
        ["--grep", "x"],
        {
          E2E_DRY_RUN: "0",
          E2E_VERBOSE: "1",
          E2E_LAUNCH_PROFILES: "default",
          PLAYWRIGHT_BIN: localPlaywright,
          E2E_FALLBACK_PROJECTS: "firefox,webkit",
          PATH: "",
        },
        tempDir,
      );

      expect(result.status).toBe(0);
      expect(result.output).toContain("mocked webkit success");
      expect(result.output).toContain("Playwright 프로젝트 firefox 실행 실패를 감지했습니다. 다음 프로젝트로 우회합니다.");
      expect(result.output).not.toContain("fallback 프로젝트가 없습니다.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("--project 값 누락은 에러로 실패한다", () => {
    const result = runScript(["--project", "--grep", "x"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("뒤에 프로젝트 이름이 필요합니다");
  });

  it("--project= 빈 값은 에러로 실패한다", () => {
    const result = runScript(["--project=", "--grep", "x"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("뒤에 프로젝트 이름이 필요합니다");
  });

  it("launch 실패 시그니처가 있으면 실패 힌트가 출력된다", () => {
    const mock = makeMockPlaywright({
      stderr: "could not launch a browser process\n",
      exitCode: 1,
    });

    try {
      const result = runScript(["--grep", "x"], {
        E2E_DRY_RUN: "0",
        E2E_VERBOSE: "1",
        E2E_LAUNCH_PROFILES: "default",
        PLAYWRIGHT_BIN: mock.commandPath,
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain("Playwright 프로젝트 chromium 실행 실패 후 fallback 프로젝트가 없습니다.");
      expect(result.output).toContain("[E2E-HELP] 브라우저 프로세스 런치 실패입니다.");
    } finally {
      mock.cleanup();
    }
  });

  it("복구 불가 launch 에러는 즉시 중단된다", () => {
    const mock = makeMockPlaywright({
      stderr: "Permission denied (1100)\n",
      exitCode: 1,
    });

    try {
      const result = runScript(["--grep", "x"], {
        E2E_DRY_RUN: "0",
        E2E_VERBOSE: "1",
        E2E_LAUNCH_PROFILES: "default",
        PLAYWRIGHT_BIN: mock.commandPath,
      });

      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "Playwright 프로젝트 chromium에서 복구 불가 launch 오류가 감지되었습니다. 더 진행하지 않고 중단합니다.",
      );
      expect(result.output).toContain("[E2E-HELP] 권한 제한으로 Mach port 초기화가 실패했습니다.");
    } finally {
      mock.cleanup();
    }
  });
});
