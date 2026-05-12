import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

type WebServerConfig = NonNullable<Parameters<typeof defineConfig>[0]["webServer"]>;

const shouldStartWebServer = process.env.E2E_NO_WEB_SERVER !== "1" && process.env.E2E_SKIP_WEBSERVER !== "1";
const hasChrome = existsSync("/Applications/Google Chrome.app");
const hasEdge = existsSync("/Applications/Microsoft Edge.app");
const preferredLocalBrowserChannel =
  process.platform === "darwin" && (hasChrome || hasEdge)
    ? hasChrome
      ? "chrome"
      : "msedge"
    : undefined;
const webServerConfig: WebServerConfig = shouldStartWebServer
  ? {
      command: "npm run dev -- --host 127.0.0.1 --port 1420",
      url: "http://127.0.0.1:1420",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    }
  : undefined;

/**
 * Playwright E2E 설정 — LUM 터미널 에뮬레이터 스모크 테스트 스위트.
 *
 * 실제 Tauri 바이너리 없이 Vite 개발 서버(port 1420)를 기준으로 실행.
 * window.__TAURI_INTERNALS__ 모킹은 각 테스트 파일의 beforeEach 에서 주입된다.
 *
 * 실행 방법:
 *   npx playwright test                         # 헤드리스 실행(가능하면 내부에서 서버 자동 시작)
 *   E2E_NO_WEB_SERVER=1 npx playwright test     # 서버가 이미 켜져 있을 때 사용
 *   E2E_SKIP_WEBSERVER=1 npx playwright test    # 동일 의미의 대체 변수
 *   npm run dev -- --host 127.0.0.1 --port 1420 # 사전 실행 후 위 Playwright 명령 수행
 *   npx playwright test --ui     # UI 모드
 *   npx playwright show-report   # 리포트 보기
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  /* 각 테스트 타임아웃 (ms) */
  timeout: 30_000,

  /* 기대값 타임아웃 */
  expect: {
    timeout: 10_000,
  },

  /* CI에서 재시도 */
  retries: process.env.CI ? 2 : 0,

  /* 병렬 워커 수 */
  workers: 1,

  /* 리포터 */
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],

  use: {
    /* Vite 개발 서버 주소 (vite.config.ts 의 server.port: 1420) */
    baseURL: "http://127.0.0.1:1420",

    /* 헤드리스 브라우저 */
    headless: true,

    /* 스크린샷 — 실패 시에만 */
    screenshot: "only-on-failure",

    /* 비디오 — 실패 시에만 */
    video: "retain-on-failure",

    /* 트레이스 — 첫 번째 재시도 시 */
    trace: "on-first-retry",

    /* Tauri는 decorations: false (커스텀 타이틀바) 이므로 뷰포트를 명시 */
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(preferredLocalBrowserChannel ? { channel: preferredLocalBrowserChannel } : {}),
      },
    },
  ],

  /**
   * Vite 개발 서버를 자동으로 시작/종료한다.
   * 샌드박스처럼 바인딩이 제한되는 환경에서는 E2E_NO_WEB_SERVER/ E2E_SKIP_WEBSERVER를
   * 1로 두고, 별도로 `npm run dev`를 띄운 뒤 테스트를 실행한다.
   */
  ...(webServerConfig ? { webServer: webServerConfig } : {}),
});
