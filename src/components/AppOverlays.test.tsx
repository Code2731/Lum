import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import AppOverlays from "./AppOverlays";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./WelcomeHints", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="LUM - AI 터미널 힌트">
      <button type="button" onClick={onClose}>시작하기</button>
    </div>
  ),
}));

vi.mock("./OnboardingWizard", () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div role="dialog" aria-label="LUM 온보딩">
      <button type="button" onClick={onComplete}>터미널 시작하기</button>
    </div>
  ),
}));

type OverlayProps = React.ComponentProps<typeof AppOverlays>;

function createProps(overrides?: Partial<OverlayProps>): OverlayProps {
  return {
    panels: {
      showModelManager: false, setShowModelManager: vi.fn(),
      showHistorySearch: false, setShowHistorySearch: vi.fn(),
      showCommitPanel: false, setShowCommitPanel: vi.fn(),
      showXllmPanel: false, setShowXllmPanel: vi.fn(),
      showMcpPanel: false, setShowMcpPanel: vi.fn(),
      showHealingDataset: false, setShowHealingDataset: vi.fn(),
      showHistoryGraph: false, setShowHistoryGraph: vi.fn(),
      showRecall: false, setShowRecall: vi.fn(),
      showLoraForge: false, setShowLoraForge: vi.fn(),
      showSkills: false, setShowSkills: vi.fn(),
      showSquadPanel: false, setShowSquadPanel: vi.fn(),
      showDiffReview: false, setShowDiffReview: vi.fn(),
      showThemePanel: false, setShowThemePanel: vi.fn(),
      showWorkspace: false, setShowWorkspace: vi.fn(),
      showPalette: false, setShowPalette: vi.fn(),
      showSshModal: false, setShowSshModal: vi.fn(),
    } as OverlayProps["panels"],
    selectedModel: "mock-model",
    aiChat: { sendMessage: vi.fn() } as OverlayProps["aiChat"],
    squadStore: {
      squads: [],
      loading: false,
      error: null,
      create: vi.fn(),
      remove: vi.fn(),
    } as OverlayProps["squadStore"],
    resetHealing: vi.fn(),
    addTab: vi.fn(),
    tabs: [],
    activeTabId: "tab-1",
    activeTabIdRef: { current: "tab-1" },
    appearance: { fontSize: 13 } as OverlayProps["appearance"],
    saveAppearance: vi.fn(),
    workspaces: [],
    wsTabs: [],
    wsLoading: false,
    saveWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    handleRestoreWorkspace: vi.fn(),
    quickActions: [],
    recentCmds: [],
    switchTabWithReset: vi.fn(),
    ptyWriteRefs: { current: new Map() },
    activePaneIdRef: { current: "pane-1" },
    handleHistorySelect: vi.fn(),
    handleCommitExecute: vi.fn(),
    tabCtxMenu: null,
    setTabCtxMenu: vi.fn(),
    contextTab: undefined,
    updateTabColor: vi.fn(),
    updateTabGroup: vi.fn(),
    handleSshConnect: vi.fn(),
    showWelcome: false,
    setShowWelcome: vi.fn(),
    showOnboarding: false,
    setShowOnboarding: vi.fn(),
    ...overrides,
  };
}

function OverlayHarness({ initialWelcome = false, initialOnboarding = false }: { initialWelcome?: boolean; initialOnboarding?: boolean }) {
  const [showWelcome, setShowWelcome] = React.useState(initialWelcome);
  const [showOnboarding, setShowOnboarding] = React.useState(initialOnboarding);

  return (
    <>
      <input type="text" aria-label="메인 입력" />
      <AppOverlays
        {...createProps({
          showWelcome,
          setShowWelcome,
          showOnboarding,
          setShowOnboarding,
        })}
      />
    </>
  );
}

describe("AppOverlays", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("웰컴 힌트를 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialWelcome />);

    const mainInput = screen.getByLabelText("메인 입력");
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
    expect(invoke).toHaveBeenCalledWith("save_ui_preferences", { hintsShown: true });
  });

  it("온보딩을 완료하면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialOnboarding />);

    const mainInput = screen.getByLabelText("메인 입력");
    fireEvent.click(await screen.findByRole("button", { name: "터미널 시작하기" }));

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });
});
