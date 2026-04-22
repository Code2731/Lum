/**
 * LUM 터미널 에뮬레이터 — Playwright E2E 스모크 테스트 스위트.
 *
 * 전제 조건:
 *   - Vite 개발 서버가 localhost:1420 에서 실행 중이어야 한다.
 *   - playwright.config.ts 의 webServer 설정이 자동으로 서버를 시작한다.
 *
 * 각 테스트는 page.addInitScript 를 통해 window.__TAURI_INTERNALS__ 를 모킹해
 * 실제 Tauri 바이너리 없이도 UI가 정상 렌더링되도록 한다.
 */

import { test, expect, type Page } from "@playwright/test";
import { setupTauriMock } from "./setup/tauri-mock";

// 각 테스트 전에 Tauri invoke 모킹 스크립트를 페이지에 주입
async function injectTauriMock(page: Page): Promise<void> {
  await page.addInitScript(`
    (${setupTauriMock.toString()})();
  `);
}

// 앱이 완전히 로드되기를 기다리는 헬퍼 — 헤더의 "LUM" 텍스트가 보일 때까지 대기
async function waitForApp(page: Page): Promise<void> {
  await page.goto("/");
  // LUM 브랜드 텍스트가 헤더에 렌더링될 때까지 대기
  await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 케이스
// ─────────────────────────────────────────────────────────────────────────────

test.describe("LUM 스모크 테스트", () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page);
  });

  // ── 1. 앱 로드 및 탭 바 표시 ──────────────────────────────────────────────
  test("앱이 로드되고 터미널 탭 바가 표시된다", async ({ page }) => {
    await waitForApp(page);

    // 헤더에 LUM 브랜드가 있어야 한다
    await expect(page.getByText("LUM").first()).toBeVisible();

    // 기본 탭 "Shell 1"이 탭 바에 표시되어야 한다
    // 탭은 div.cursor-pointer 요소로 렌더링되고 텍스트로 탭 이름을 포함한다
    await expect(page.getByText("Shell 1").first()).toBeVisible();

    // 새 탭 추가 버튼(+ 아이콘, aria-label="새 탭 (Cmd+T)")이 표시되어야 한다
    await expect(page.getByRole("button", { name: "새 탭 (Cmd+T)" })).toBeVisible();
  });

  // ── 2. Cmd+T 로 새 탭 생성 ────────────────────────────────────────────────
  test("Cmd+T 를 누르면 새 탭이 생성된다", async ({ page }) => {
    await waitForApp(page);

    // 초기 탭 수 확인 — "Shell 1" 만 존재
    await expect(page.getByText("Shell 1").first()).toBeVisible();
    await expect(page.getByText("Shell 2")).not.toBeVisible();

    // Cmd+T (macOS) / Ctrl+T (Linux/Windows) 로 새 탭 생성
    await page.keyboard.press("Meta+t");

    // "Shell 2" 탭이 탭 바에 나타나야 한다
    await expect(page.getByText("Shell 2").first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 3. Cmd+Shift+H 로 SSH 연결 모달 열기 ─────────────────────────────────
  test("Cmd+Shift+H 를 누르면 SSH 연결 모달이 열린다", async ({ page }) => {
    await waitForApp(page);

    // 모달이 아직 보이지 않아야 한다
    await expect(page.getByText("SSH 연결")).not.toBeVisible();

    // SSH 단축키 발동
    await page.keyboard.press("Meta+Shift+h");

    // SSH 모달 타이틀 "SSH 연결"이 표시되어야 한다
    await expect(page.getByText("SSH 연결").first()).toBeVisible({ timeout: 5_000 });

    // 탭 바의 SSH 버튼(Lock 아이콘)을 통해서도 모달을 열 수 있어야 한다 — 대안 경로 검증
    // 이미 열린 상태이므로 닫고 버튼으로 다시 열기
    await page.keyboard.press("Escape");
    await expect(page.getByText("SSH 연결")).not.toBeVisible({ timeout: 3_000 });

    await page.getByRole("button", { name: "SSH 연결 (Cmd+Shift+H)" }).click();
    await expect(page.getByText("SSH 연결").first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Escape 로 열린 모달 닫기 ──────────────────────────────────────────
  test("Escape 키를 누르면 열린 모달이 닫힌다", async ({ page }) => {
    await waitForApp(page);

    // SSH 모달 열기
    await page.keyboard.press("Meta+Shift+h");
    await expect(page.getByText("SSH 연결").first()).toBeVisible({ timeout: 5_000 });

    // Escape 로 닫기
    await page.keyboard.press("Escape");
    await expect(page.getByText("SSH 연결")).not.toBeVisible({ timeout: 3_000 });
  });

  // ── 5. Cmd+K 로 커맨드 팔레트 열기 ───────────────────────────────────────
  test("Cmd+K 를 누르면 커맨드 팔레트가 열린다", async ({ page }) => {
    await waitForApp(page);

    // 커맨드 팔레트가 아직 보이지 않아야 한다
    await expect(
      page.getByPlaceholder("탭, 워크스페이스, 액션, 히스토리 검색…"),
    ).not.toBeVisible();

    // Cmd+K 발동
    await page.keyboard.press("Meta+k");

    // 팔레트의 검색 인풋이 표시되어야 한다
    await expect(
      page.getByPlaceholder("탭, 워크스페이스, 액션, 히스토리 검색…"),
    ).toBeVisible({ timeout: 5_000 });

    // Escape 로 닫기
    await page.keyboard.press("Escape");
    await expect(
      page.getByPlaceholder("탭, 워크스페이스, 액션, 히스토리 검색…"),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});
