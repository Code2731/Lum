import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 설정 — LUM 터미널 에뮬레이터 스모크 테스트 스위트.
 *
 * 실제 Tauri 바이너리 없이 Vite 개발 서버(port 1420)를 기준으로 실행.
 * window.__TAURI_INTERNALS__ 모킹은 각 테스트 파일의 beforeEach 에서 주입된다.
 *
 * 실행 방법:
 *   npx playwright test          # 헤드리스 실행
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
    baseURL: "http://localhost:1420",

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
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * Vite 개발 서버를 자동으로 시작/종료.
   * 이미 실행 중인 서버가 있으면 재사용한다.
   */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
