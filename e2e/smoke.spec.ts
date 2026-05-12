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
  // 초기 웰컴 힌트 모달이 떠 있으면 닫아 테스트 상호작용을 복구한다.
  const startButton = page.getByRole("button", { name: "시작하기" });
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  }
  await expect(page.getByRole("dialog", { name: "LUM — AI 터미널 힌트" })).toBeHidden({ timeout: 5_000 });
}

// locator 가 현재 뷰포트 내부에 완전히 들어오는지 검증하는 헬퍼
async function expectInViewport(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const safeViewport = viewport!;
  const safeBox = box!;
  expect(safeBox.x).toBeGreaterThanOrEqual(0);
  expect(safeBox.y).toBeGreaterThanOrEqual(0);
  expect(safeBox.x + safeBox.width).toBeLessThanOrEqual(safeViewport.width);
  expect(safeBox.y + safeBox.height).toBeLessThanOrEqual(safeViewport.height);
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
  test("새 탭 버튼을 누르면 새 탭이 생성된다", async ({ page }) => {
    await waitForApp(page);

    // 초기 탭 수를 기록한다. (세션 복원/카운터 상태에 따라 번호는 유동적)
    const shellTabs = page.getByText(/^Shell \d+$/);
    const beforeCount = await shellTabs.count();
    expect(beforeCount).toBeGreaterThan(0);

    // 브라우저 환경 E2E에서는 Ctrl/Cmd+T가 브라우저 새 탭 단축키와 충돌하므로
    // 동일 동작을 담당하는 헤더 버튼 경로를 검증한다.
    await page.getByRole("button", { name: "새 탭 (Cmd+T)" }).click();

    // 탭 개수가 1개 증가해야 한다.
    await expect(shellTabs).toHaveCount(beforeCount + 1, { timeout: 5_000 });
  });

  // ── 3. Cmd+Shift+H 로 SSH 연결 모달 열기 ─────────────────────────────────
  test("Cmd+Shift+H 를 누르면 SSH 연결 모달이 열린다", async ({ page }) => {
    await waitForApp(page);

    // 모달이 아직 보이지 않아야 한다
    await expect(page.getByText("SSH 연결")).not.toBeVisible();

    // SSH 단축키 발동
    await page.keyboard.press("Control+Shift+h");

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
    await page.keyboard.press("Control+Shift+h");
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
    await page.keyboard.press("Control+k");

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

  // ── 6. 좁은 뷰포트 오버레이 하네스 ───────────────────────────────────────
  test("좁은 뷰포트에서도 주요 오버레이가 화면 안에 유지된다", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 520 });
    await waitForApp(page);

    // 히스토리 버튼 활성화를 위해 shell 입력 2건 생성
    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("ls -la");
    await page.keyboard.press("Enter");
    await mainInput.fill("pwd");
    await page.keyboard.press("Enter");

    // INPUT HISTORY 패널 검증
    await page.getByRole("button", { name: "quick-input-history-open" }).click();
    await expect(page.getByText("INPUT HISTORY")).toBeVisible();
    await expectInViewport(page, "[aria-label='input-history-search']");
    await expectInViewport(page, "[aria-label='quick-input-history-close']");
    await page.keyboard.press("Escape");

    // ACTION PALETTE 패널 검증 (input intercept: Ctrl+K)
    await mainInput.click();
    await page.keyboard.press("Control+k");
    await expect(page.getByText("ACTION PALETTE")).toBeVisible();
    await expectInViewport(page, "[aria-label='action-palette-input']");
    await expectInViewport(page, "[aria-label='action-palette-close']");
    await page.keyboard.press("Escape");

    // SHORTCUT CHEATSHEET 패널 검증 (input intercept: Ctrl+/)
    await mainInput.click();
    await page.keyboard.press("Control+/");
    await expect(page.getByText("SHORTCUT CHEATSHEET")).toBeVisible();
    await expectInViewport(page, "[aria-label='shortcut-help-close']");
    await page.keyboard.press("Escape");
  });

  test("헤더 오버레이가 뷰포트 밖으로 벗어나지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 520 });
    await waitForApp(page);

    const advancedButton = page.getByRole("button", {
      name: "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)",
    });
    await expect(advancedButton).toBeVisible();
    await advancedButton.click();
    const advancedPanel = page.getByRole("menu", { name: "고급 기능 메뉴" });
    await expect(advancedPanel).toBeVisible();
    await expectInViewport(page, "[role='menu'][aria-label='고급 기능 메뉴']");
    await expect(advancedPanel.getByRole("menuitem", { name: "MCP 서버" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(advancedPanel).toBeHidden();

    const notifButton = page.getByRole("button", { name: "알림 센터" });
    await expect(notifButton).toBeVisible();
    await notifButton.click();
    const notifPanel = page.getByRole("menu", { name: "알림 센터" });
    const notifClose = notifPanel.getByRole("button", { name: "알림 센터 닫기" });
    await expectInViewport(page, "[role='menu'][aria-label='알림 센터']");
    await expect(notifClose).toBeVisible();

    const closeBox = await notifClose.boundingBox();
    const viewport = page.viewportSize();
    expect(closeBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(closeBox!.x).toBeGreaterThanOrEqual(0);
    expect(closeBox!.y).toBeGreaterThanOrEqual(0);
    expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(viewport!.width);
    expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(viewport!.height);
    await page.keyboard.press("Escape");
    await expect(notifPanel).toBeHidden();
  });

  test("고급 기능과 알림 센터는 키보드로도 상호 배타적으로 열리고 포커스가 복구된다", async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 520 });
    await waitForApp(page);

    const advancedButton = page.getByRole("button", {
      name: "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)",
    });
    const notifButton = page.getByRole("button", { name: "알림 센터" });
    const advancedPanel = page.getByRole("menu", { name: "고급 기능 메뉴" });
    const notifPanel = page.getByRole("menu", { name: "알림 센터" });

    await advancedButton.focus();
    await page.keyboard.press("Enter");
    await expect(advancedPanel).toBeVisible();
    await expect(notifPanel).toBeHidden();

    await notifButton.focus();
    await page.keyboard.press("Space");
    await expect(notifPanel).toBeVisible();
    await expect(advancedPanel).toBeHidden();
    await expect(notifPanel.getByRole("button", { name: "알림 센터 닫기" })).toBeVisible();
    await expectInViewport(page, "[role='menu'][aria-label='알림 센터']");

    await page.keyboard.press("Escape");
    await expect(notifPanel).toBeHidden();
    await expect(notifButton).toHaveFocus();

    await advancedButton.focus();
    await page.keyboard.press("Enter");
    await expect(advancedPanel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(advancedPanel).toBeHidden();
    await expect(advancedButton).toHaveFocus();
  });

  test("고급 기능과 알림 센터는 동시에 열리지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 520 });
    await waitForApp(page);

    const advancedButton = page.getByRole("button", {
      name: "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)",
    });
    const notifButton = page.getByRole("button", { name: "알림 센터" });
    const advancedPanel = page.getByRole("menu", { name: "고급 기능 메뉴" });
    const notifPanel = page.getByRole("menu", { name: "알림 센터" });

    await advancedButton.click();
    await expect(advancedPanel).toBeVisible();
    await expect(notifPanel).toBeHidden();

    await notifButton.click();
    await expect(notifPanel).toBeVisible();
    await expect(advancedPanel).toBeHidden();

    await advancedButton.click();
    await expect(advancedPanel).toBeVisible();
    await expect(notifPanel).toBeHidden();
  });
});
