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

async function emitPtyData(page: Page, id: string, data: string): Promise<void> {
  await page.evaluate(
    ({ event, payload }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__lumTest?.emitTauriEvent(event, payload);
    },
    { event: "pty_data", payload: { id, data } },
  );
}

async function getInvokeCalls(page: Page): Promise<Array<{ cmd: string; args: unknown }>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).__lumTest?.getInvokeCalls?.() ?? []) as Array<{ cmd: string; args: unknown }>;
  });
}

async function resetInvokeCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__lumTest?.resetInvokeCalls?.();
  });
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

    // 새 탭 추가 버튼(+ 아이콘, aria-label="새 탭 (Cmd/Ctrl+T)")이 표시되어야 한다
    await expect(page.getByRole("button", { name: "새 탭 (Cmd/Ctrl+T)" })).toBeVisible();
  });

  test("첫 실행 웰컴 힌트는 닫은 뒤 바로 입력 흐름으로 진입할 수 있다", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("lum.mock.appConfig", JSON.stringify({ ui_hints_shown: false }));
      localStorage.setItem("lum.mock.onboardingComplete", "1");
      localStorage.removeItem("lum.hintsShown");
    });

    await page.goto("/");
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });

    const welcomeDialog = page.getByRole("dialog", { name: "LUM — AI 터미널 힌트" });
    await expect(welcomeDialog).toBeVisible({ timeout: 5_000 });
    await welcomeDialog.getByRole("button", { name: "시작하기" }).click();
    await expect(welcomeDialog).toBeHidden({ timeout: 5_000 });

    await expect(page.locator("input[type='text']").first()).toBeVisible({ timeout: 5_000 });
  });

  test("첫 실행 온보딩은 시작 단계에서 하드웨어 분석 단계로 정상 진입한다", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("lum.mock.appConfig", JSON.stringify({ ui_hints_shown: true }));
      localStorage.setItem("lum.mock.onboardingComplete", "0");
      localStorage.setItem("lum.hintsShown", "1");
    });

    await page.goto("/");
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("LUM에 오신 것을 환영합니다")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(page.getByText("하드웨어 자동 분석")).toBeVisible({ timeout: 5_000 });
  });

  test("온보딩 완료 단계의 터미널 시작하기는 온보딩을 닫고 메인 화면으로 진입한다", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("lum.mock.appConfig", JSON.stringify({ ui_hints_shown: true }));
      localStorage.setItem("lum.mock.onboardingComplete", "0");
      localStorage.setItem("lum.hintsShown", "1");
    });

    await page.goto("/");
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("LUM에 오신 것을 환영합니다")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(page.getByText("하드웨어 자동 분석")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("성능 모드 선택")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("xLLM 서버 확인")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "나중에 설정" }).click();
    await expect(page.getByText("AI 모델 준비")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "나중에 설치" }).click();
    await expect(page.getByText("설정 완료!")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "터미널 시작하기" }).click();

    await expect(page.getByText("설정 완료!")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("input[type='text']").first()).toBeVisible({ timeout: 5_000 });
    await expect.poll(async () => {
      const calls = await getInvokeCalls(page);
      return calls.some((call) => call.cmd === "complete_onboarding");
    }, { timeout: 5_000 }).toBe(true);
  });

  test("온보딩 종료 직후에도 헤더 툴바로 새 탭을 바로 열 수 있다", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("lum.mock.appConfig", JSON.stringify({ ui_hints_shown: true }));
      localStorage.setItem("lum.mock.onboardingComplete", "0");
      localStorage.setItem("lum.hintsShown", "1");
    });

    await page.goto("/");
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(page.getByText("하드웨어 자동 분석")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("성능 모드 선택")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("xLLM 서버 확인")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "나중에 설정" }).click();
    await expect(page.getByText("AI 모델 준비")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "나중에 설치" }).click();
    await expect(page.getByText("설정 완료!")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "터미널 시작하기" }).click();

    const shellTabs = page.getByText(/^Shell \d+$/);
    const beforeCount = await shellTabs.count();
    await page.getByRole("button", { name: "새 탭 (Cmd/Ctrl+T)" }).click();
    await expect(shellTabs).toHaveCount(beforeCount + 1, { timeout: 5_000 });
  });

  test("온보딩 종료 직후에도 액션 팔레트를 바로 열 수 있다", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("lum.mock.appConfig", JSON.stringify({ ui_hints_shown: true }));
      localStorage.setItem("lum.mock.onboardingComplete", "0");
      localStorage.setItem("lum.hintsShown", "1");
    });

    await page.goto("/");
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(page.getByText("하드웨어 자동 분석")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("성능 모드 선택")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("xLLM 서버 확인")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "나중에 설정" }).click();
    await expect(page.getByText("AI 모델 준비")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "나중에 설치" }).click();
    await expect(page.getByText("설정 완료!")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "터미널 시작하기" }).click();

    await page.getByRole("button", { name: "quick-input-action-palette" }).click();
    await expect(page.getByText("ACTION PALETTE")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[aria-label='action-palette-input']")).toBeVisible({ timeout: 5_000 });
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
    await page.getByRole("button", { name: "새 탭 (Cmd/Ctrl+T)" }).click();

    // 탭 개수가 1개 증가해야 한다.
    await expect(shellTabs).toHaveCount(beforeCount + 1, { timeout: 5_000 });
  });

  // ── 3. Cmd+Shift+H 로 SSH 연결 모달 열기 ─────────────────────────────────
  test("SSH 연결 버튼을 누르면 SSH 연결 모달이 열린다", async ({ page }) => {
    await waitForApp(page);

    // 모달이 아직 보이지 않아야 한다
    await expect(page.getByText("SSH 연결")).not.toBeVisible();

    // SSH 버튼 경로로 열기
    await page.getByRole("button", { name: "SSH 연결 (Cmd/Ctrl+Shift+H)" }).click();

    // SSH 모달 타이틀 "SSH 연결"이 표시되어야 한다
    await expect(page.getByText("SSH 연결").first()).toBeVisible({ timeout: 5_000 });

    // Escape 후 같은 버튼으로 다시 열 수 있어야 한다
    await page.keyboard.press("Escape");
    await expect(page.getByText("SSH 연결")).not.toBeVisible({ timeout: 3_000 });

    await page.getByRole("button", { name: "SSH 연결 (Cmd/Ctrl+Shift+H)" }).click();
    await expect(page.getByText("SSH 연결").first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Escape 로 열린 모달 닫기 ──────────────────────────────────────────
  test("Escape 키를 누르면 열린 모달이 닫힌다", async ({ page }) => {
    await waitForApp(page);

    // SSH 모달 열기
    await page.getByRole("button", { name: "SSH 연결 (Cmd/Ctrl+Shift+H)" }).click();
    await expect(page.getByText("SSH 연결").first()).toBeVisible({ timeout: 5_000 });

    // Escape 로 닫기
    await page.keyboard.press("Escape");
    await expect(page.getByText("SSH 연결")).not.toBeVisible({ timeout: 3_000 });
  });

  // ── 5. 액션 팔레트 열기 ───────────────────────────────────────────────────
  test("액션 팔레트 버튼을 누르면 ACTION PALETTE가 열린다", async ({ page }) => {
    await waitForApp(page);

    // 액션 팔레트가 아직 보이지 않아야 한다
    await expect(page.getByText("ACTION PALETTE")).not.toBeVisible();

    // 툴벨트 버튼 경로로 열기
    await page.getByRole("button", { name: "quick-input-action-palette" }).click();

    // 팔레트 헤더와 검색 인풋이 표시되어야 한다
    await expect(page.getByText("ACTION PALETTE")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[aria-label='action-palette-input']")).toBeVisible({ timeout: 5_000 });

    // Escape 로 닫기
    await page.keyboard.press("Escape");
    await expect(page.getByText("ACTION PALETTE")).not.toBeVisible({ timeout: 3_000 });
  });

  test("명령을 제출하면 리스트 뷰에 커맨드 블록이 표시된다", async ({ page }) => {
    await waitForApp(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("echo hello");
    await page.keyboard.press("Enter");

    await emitPtyData(
      page,
      "tab-1",
      "\u001b]133;A\u0007\u001b]133;C;echo hello\u0007hello\r\n\u001b]133;D;0\u0007",
    );

    await page.getByRole("button", { name: "리스트" }).click();
    await expect(page.getByText("echo hello", { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test("AI 질문을 제출하면 응답 스트림이 표시된다", async ({ page }) => {
    await waitForApp(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("최근 로그 요약해줘");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("ai-block-stream")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("AI 대화")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Mock AI 응답: 최근 로그 요약해줘")).toBeVisible({ timeout: 5_000 });
  });

  test("새 커맨드 블록은 Inspector Recent Blocks에도 반영된다", async ({ page }) => {
    await waitForApp(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("pwd");
    await page.keyboard.press("Enter");

    await emitPtyData(
      page,
      "tab-1",
      "\u001b]133;A\u0007\u001b]133;C;pwd\u0007/Users/mock\r\n\u001b]133;D;0\u0007",
    );

    const recentBlocksCard = page.locator("div").filter({ has: page.getByText("Recent Blocks") }).first();
    await expect(recentBlocksCard).toBeVisible({ timeout: 5_000 });
    await expect(recentBlocksCard.getByText("pwd", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(recentBlocksCard.getByText("/Users/mock", { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test("파일 탐색기 토글 상태는 새로고침 뒤에도 유지된다", async ({ page }) => {
    await waitForApp(page);

    const explorerToggle = page.getByRole("button", { name: "파일 탐색기" });
    await expect(explorerToggle).toHaveAttribute("aria-pressed", "true");

    await explorerToggle.click();
    await expect(explorerToggle).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });

    const reloadedExplorerToggle = page.getByRole("button", { name: "파일 탐색기" });
    await expect(reloadedExplorerToggle).toHaveAttribute("aria-pressed", "false");
  });

  test("파일 탐색기에서 폴더 이동 뒤 여기로 cd를 누르면 현재 탭 cwd가 반영된다", async ({ page }) => {
    await waitForApp(page);
    await resetInvokeCalls(page);

    await expect(page.getByText("project", { exact: true })).toBeVisible({ timeout: 5_000 });
    await page.getByText("project", { exact: true }).click();
    await expect(page.getByText("src", { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "터미널을 이 폴더로 이동" }).click();

    await expect.poll(async () => {
      const calls = await getInvokeCalls(page);
      return calls.some((call) => call.cmd === "write_to_pty"
        && typeof call.args === "object"
        && call.args !== null
        && (call.args as { data?: string }).data === "cd /workspace/project\r");
    }, { timeout: 5_000 }).toBe(true);

    await emitPtyData(page, "tab-1", "\u001b]7;file://localhost/workspace/project\u0007");

    const workspaceCard = page.locator("div").filter({ has: page.getByText("Workspace") }).first();
    await expect(workspaceCard.getByText("/workspace/project", { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test("Inspector 토글 상태는 새로고침 뒤에도 유지된다", async ({ page }) => {
    await waitForApp(page);

    const inspectorToggle = page.getByRole("button", { name: "Inspector", exact: true });
    await expect(inspectorToggle).toHaveAttribute("aria-pressed", "true");

    await inspectorToggle.click();
    await expect(inspectorToggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("tablist", { name: "Inspector 탭" })).toBeHidden({ timeout: 5_000 });

    await page.reload();
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });

    const reloadedInspectorToggle = page.getByRole("button", { name: "Inspector", exact: true });
    await expect(reloadedInspectorToggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("tablist", { name: "Inspector 탭" })).toBeHidden({ timeout: 5_000 });
  });

  test("Inspector 밀도 토글 상태는 새로고침 뒤에도 유지된다", async ({ page }) => {
    await waitForApp(page);

    await expect(page.getByText("COZY", { exact: true })).toBeVisible({ timeout: 5_000 });
    await page.getByLabel("Inspector 밀도 토글").click();
    await expect(page.getByText("COMPACT", { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.reload();
    await expect(page.getByText("LUM").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("COMPACT", { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test("Inspector 실패 블록의 LOAD는 AI 분석 프롬프트를 AI 바에 채운다", async ({ page }) => {
    await waitForApp(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("badcmd");
    await page.keyboard.press("Enter");

    await emitPtyData(
      page,
      "tab-1",
      "\u001b]133;A\u0007\u001b]133;C;badcmd\u0007command not found\r\n\u001b]133;D;127\u0007",
    );

    const recentBlocksCard = page.locator("div").filter({ has: page.getByText("Recent Blocks") }).first();
    await expect(recentBlocksCard.getByText("LOAD", { exact: true })).toBeVisible({ timeout: 5_000 });
    await recentBlocksCard.getByText("LOAD", { exact: true }).click();

    const aiInput = page.getByLabel("AI 질문 입력");
    await expect(aiInput).toBeVisible({ timeout: 5_000 });
    await expect(aiInput).toHaveValue(/아래 실패한 터미널 실행을 분석해줘\./);
    await expect(aiInput).toHaveValue(/Command: badcmd/);
    await expect(aiInput).toHaveValue(/Exit Code: 127/);
    await expect(page.getByRole("button", { name: "Inspector", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("Inspector 실패 블록의 AI ANALYZE는 결과 카드에 추천 커맨드를 표시한다", async ({ page }) => {
    await waitForApp(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("badcmd");
    await page.keyboard.press("Enter");

    await emitPtyData(
      page,
      "tab-1",
      "\u001b]133;A\u0007\u001b]133;C;badcmd\u0007command not found\r\n\u001b]133;D;127\u0007",
    );

    const failedBlockCard = page.locator("div").filter({ has: page.getByText("Failed Block") }).first();
    await expect(failedBlockCard.getByRole("button", { name: "AI ANALYZE" })).toBeVisible({ timeout: 5_000 });
    await failedBlockCard.getByRole("button", { name: "AI ANALYZE" }).click();

    const analyzeCard = page.locator("div").filter({ has: page.getByText("Last AI Analyze") }).first();
    await expect(analyzeCard).toBeVisible({ timeout: 5_000 });
    await expect(analyzeCard.getByText("DONE")).toBeVisible({ timeout: 5_000 });
    await expect(analyzeCard.getByText("Suggested Commands")).toBeVisible({ timeout: 5_000 });
    await expect(analyzeCard.getByRole("button", { name: "RUN" }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Last AI Analyze 추천 커맨드 LOAD는 AI 입력바에 첫 번째 커맨드를 채운다", async ({ page }) => {
    await waitForApp(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("badcmd");
    await page.keyboard.press("Enter");

    await emitPtyData(
      page,
      "tab-1",
      "\u001b]133;A\u0007\u001b]133;C;badcmd\u0007command not found\r\n\u001b]133;D;127\u0007",
    );

    const failedBlockCard = page.locator("div").filter({ has: page.getByText("Failed Block") }).first();
    await failedBlockCard.getByRole("button", { name: "AI ANALYZE" }).click();

    const analyzeCard = page.locator("div").filter({ has: page.getByText("Last AI Analyze") }).first();
    await expect(analyzeCard.getByText("DONE")).toBeVisible({ timeout: 5_000 });
    const firstSuggestedRow = page.locator("[data-inspector-command-menu-row='1']").first();
    await expect(firstSuggestedRow).toBeVisible({ timeout: 5_000 });
    await firstSuggestedRow.getByRole("button", { name: "LOAD" }).click();

    const aiInput = page.getByLabel("AI 질문 입력");
    await expect(aiInput).toBeVisible({ timeout: 5_000 });
    await expect(aiInput).toHaveValue("pwd");
  });

  test("Last AI Analyze 추천 커맨드 RUN은 첫 번째 커맨드를 PTY로 실행한다", async ({ page }) => {
    await waitForApp(page);
    await resetInvokeCalls(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("badcmd");
    await page.keyboard.press("Enter");

    await emitPtyData(
      page,
      "tab-1",
      "\u001b]133;A\u0007\u001b]133;C;badcmd\u0007command not found\r\n\u001b]133;D;127\u0007",
    );

    const failedBlockCard = page.locator("div").filter({ has: page.getByText("Failed Block") }).first();
    await failedBlockCard.getByRole("button", { name: "AI ANALYZE" }).click();

    const analyzeCard = page.locator("div").filter({ has: page.getByText("Last AI Analyze") }).first();
    await expect(analyzeCard.getByText("DONE")).toBeVisible({ timeout: 5_000 });
    const firstSuggestedRow = page.locator("[data-inspector-command-menu-row='1']").first();
    await expect(firstSuggestedRow).toBeVisible({ timeout: 5_000 });
    await firstSuggestedRow.getByRole("button", { name: "RUN" }).click();

    await expect.poll(async () => {
      const calls = await getInvokeCalls(page);
      return calls.some((call) => call.cmd === "write_to_pty"
        && typeof call.args === "object"
        && call.args !== null
        && (call.args as { data?: string }).data === "pwd\r");
    }, { timeout: 5_000 }).toBe(true);
  });

  test("추천 커맨드 RUN 뒤 알림 센터에 실행 피드백이 표시된다", async ({ page }) => {
    await waitForApp(page);

    const mainInput = page.locator("input[type='text']").first();
    await mainInput.click();
    await mainInput.fill("badcmd");
    await page.keyboard.press("Enter");

    await emitPtyData(
      page,
      "tab-1",
      "\u001b]133;A\u0007\u001b]133;C;badcmd\u0007command not found\r\n\u001b]133;D;127\u0007",
    );

    const failedBlockCard = page.locator("div").filter({ has: page.getByText("Failed Block") }).first();
    await failedBlockCard.getByRole("button", { name: "AI ANALYZE" }).click();

    const analyzeCard = page.locator("div").filter({ has: page.getByText("Last AI Analyze") }).first();
    await expect(analyzeCard.getByText("DONE")).toBeVisible({ timeout: 5_000 });
    const firstSuggestedRow = page.locator("[data-inspector-command-menu-row='1']").first();
    await expect(firstSuggestedRow).toBeVisible({ timeout: 5_000 });
    await firstSuggestedRow.getByRole("button", { name: "RUN" }).click();

    const notifButton = page.getByRole("button", { name: "알림 센터" });
    await notifButton.click();
    const notifPanel = page.getByRole("menu", { name: "알림 센터" });
    await expect(notifPanel).toBeVisible({ timeout: 5_000 });
    await expect(notifPanel.getByText("추천 커맨드 실행됨")).toBeVisible({ timeout: 5_000 });
    await expect(notifPanel.getByText("[1] pwd")).toBeVisible({ timeout: 5_000 });
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
    await page.getByRole("button", { name: "quick-input-action-palette" }).click();
    await page.getByRole("button", { name: "action-palette-item-history_open" }).click();
    await expect(page.getByText("INPUT HISTORY")).toBeVisible();
    await expectInViewport(page, "[aria-label='input-history-search']");
    await expectInViewport(page, "[aria-label='quick-input-history-close']");
    await page.keyboard.press("Escape");

    // ACTION PALETTE 패널 검증 (input intercept: Ctrl+K)
    await page.getByRole("button", { name: "quick-input-action-palette" }).click();
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
    await expect(advancedButton).toHaveAttribute("aria-label", /새 고급 기능이 있습니다/);
    await expect(advancedButton).toBeVisible();
    await advancedButton.click();
    const advancedPanel = page.getByRole("menu", { name: "고급 기능 메뉴" });
    await expect(advancedPanel).toBeVisible();
    await expect(advancedPanel.getByText("NEW FEATURE")).toBeVisible();
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

  test("Privacy Ledger 패널도 뷰포트 안에서 정상 표시된다", async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 520 });
    await waitForApp(page);

    const privacyButton = page.getByRole("button", {
      name: /Privacy Ledger — AI 호출 없음/,
    });
    await expect(privacyButton).toBeVisible();
    await privacyButton.click();

    const ledgerPanel = page.getByRole("dialog", { name: "Privacy Ledger 상세" });
    await expect(ledgerPanel).toBeVisible();
    await expect(ledgerPanel.getByRole("button", { name: "Privacy Ledger 상세 닫기" })).toBeVisible();
    await expectInViewport(page, "[role='dialog'][aria-label='Privacy Ledger 상세']");

    await page.keyboard.press("Escape");
    await expect(ledgerPanel).toBeHidden();
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
    await expect(notifButton).toBeFocused();

    await advancedButton.focus();
    await page.keyboard.press("Enter");
    await expect(advancedPanel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(advancedPanel).toBeHidden();
    await expect(advancedButton).toBeFocused();
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
