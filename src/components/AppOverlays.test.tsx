import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import AppOverlays, { getAppOverlaysFlowSummary } from "./AppOverlays";

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

vi.mock("./ModelManager", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="모델 관리자">
      <button type="button" onClick={onClose}>모델 닫기</button>
    </div>
  ),
}));

vi.mock("./CommitPanel", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="커밋 패널">
      <button type="button" onClick={onClose}>커밋 닫기</button>
    </div>
  ),
}));

vi.mock("./XllmPanel", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="xLLM 패널">
      <button type="button" onClick={onClose}>xLLM 닫기</button>
    </div>
  ),
}));

vi.mock("./McpPanel", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="MCP 패널">
      <button type="button" onClick={onClose}>MCP 닫기</button>
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

vi.mock("./HistorySearch", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="히스토리 검색">
      <button type="button" onClick={onClose}>히스토리 닫기</button>
    </div>
  ),
}));

vi.mock("./SshConnectModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="SSH 연결">
      <button type="button" onClick={onClose}>SSH 닫기</button>
    </div>
  ),
}));

vi.mock("./CommandPalette", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="명령어 팔레트">
      <button type="button" onClick={onClose}>명령어 팔레트 닫기</button>
    </div>
  ),
}));

vi.mock("./WorkspacePanel", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="워크스페이스">
      <button type="button" onClick={onClose}>워크스페이스 닫기</button>
    </div>
  ),
}));

type OverlayProps = React.ComponentProps<typeof AppOverlays>;

function createProps(overrides?: Partial<OverlayProps>): OverlayProps {
  const defaultPanels: OverlayProps["panels"] = {
    showModelManager: false,
    setShowModelManager: vi.fn(),
    showRagPanel: false,
    setShowRagPanel: vi.fn(),
    showHistorySearch: false,
    setShowHistorySearch: vi.fn(),
    showCommitPanel: false,
    setShowCommitPanel: vi.fn(),
    showXllmPanel: false,
    setShowXllmPanel: vi.fn(),
    showDiffReview: false,
    setShowDiffReview: vi.fn(),
    showThemePanel: false,
    setShowThemePanel: vi.fn(),
    showWorkspace: false,
    setShowWorkspace: vi.fn(),
    showScriptPanel: false,
    setShowScriptPanel: vi.fn(),
    showSysmon: false,
    setShowSysmon: vi.fn(),
    showNotifCenter: false,
    setShowNotifCenter: vi.fn(),
    showMcpPanel: false,
    setShowMcpPanel: vi.fn(),
    showPalette: false,
    setShowPalette: vi.fn(),
    showSshModal: false,
    setShowSshModal: vi.fn(),
    showSquadPanel: false,
    setShowSquadPanel: vi.fn(),
    showHealingDataset: false,
    setShowHealingDataset: vi.fn(),
    showRecall: false,
    setShowRecall: vi.fn(),
    showHistoryGraph: false,
    setShowHistoryGraph: vi.fn(),
    showLoraForge: false,
    setShowLoraForge: vi.fn(),
    showSkills: false,
    setShowSkills: vi.fn(),
    closeOverlays: vi.fn(),
  };

  const defaultAiChat: OverlayProps["aiChat"] = {
    messages: [],
    streaming: false,
    error: null,
    sendMessage: vi.fn(),
    cancel: vi.fn(),
    clear: vi.fn(),
  };

  const defaultSquadStore: OverlayProps["squadStore"] = {
    squads: [],
    loading: false,
    error: null,
    load: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  };

  return {
    panels: defaultPanels,
    selectedModel: "mock-model",
    aiChat: defaultAiChat,
    squadStore: defaultSquadStore,
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

function OverlayHarness({
  initialWelcome = false,
  initialOnboarding = false,
  initialHistorySearch = false,
  initialSshModal = false,
  initialPalette = false,
  initialWorkspace = false,
  initialModelManager = false,
  initialCommitPanel = false,
  initialXllmPanel = false,
  initialMcpPanel = false,
}: {
  initialWelcome?: boolean;
  initialOnboarding?: boolean;
  initialHistorySearch?: boolean;
  initialSshModal?: boolean;
  initialPalette?: boolean;
  initialWorkspace?: boolean;
  initialModelManager?: boolean;
  initialCommitPanel?: boolean;
  initialXllmPanel?: boolean;
  initialMcpPanel?: boolean;
}) {
  const [showWelcome, setShowWelcome] = React.useState(initialWelcome);
  const [showOnboarding, setShowOnboarding] = React.useState(initialOnboarding);
  const [showHistorySearch, setShowHistorySearch] = React.useState(initialHistorySearch);
  const [showSshModal, setShowSshModal] = React.useState(initialSshModal);
  const [showPalette, setShowPalette] = React.useState(initialPalette);
  const [showWorkspace, setShowWorkspace] = React.useState(initialWorkspace);
  const [showModelManager, setShowModelManager] = React.useState(initialModelManager);
  const [showCommitPanel, setShowCommitPanel] = React.useState(initialCommitPanel);
  const [showXllmPanel, setShowXllmPanel] = React.useState(initialXllmPanel);
  const [showMcpPanel, setShowMcpPanel] = React.useState(initialMcpPanel);

  return (
    <>
      <input type="text" aria-label="메인 입력" />
      <AppOverlays
        {...createProps({
          panels: {
            ...createProps().panels,
            showHistorySearch,
            setShowHistorySearch,
            showSshModal,
            setShowSshModal,
            showPalette,
            setShowPalette,
            showWorkspace,
            setShowWorkspace,
            showModelManager,
            setShowModelManager,
            showCommitPanel,
            setShowCommitPanel,
            showXllmPanel,
            setShowXllmPanel,
            showMcpPanel,
            setShowMcpPanel,
          },
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

  it("열린 오버레이 상태 흐름 요약을 계산한다", () => {
    expect(getAppOverlaysFlowSummary([])).toBeNull();
    expect(getAppOverlaysFlowSummary(["히스토리"])).toEqual({
      badges: ["1개 오버레이 열림", "히스토리 확인", "닫기 후 메인 입력 복귀"],
      helper: "전역 패널을 닫으면 포커스가 메인 입력으로 돌아갑니다.",
    });
    expect(getAppOverlaysFlowSummary(["워크스페이스", "명령어 팔레트"])).toEqual({
      badges: ["2개 오버레이 열림", "워크스페이스 외 1개", "닫기 후 메인 입력 복귀"],
      helper: "전역 패널을 닫으면 포커스가 메인 입력으로 돌아갑니다.",
    });
  });

  it("열린 오버레이가 없으면 전역 오버레이 상태를 비어 있음으로 노출한다", () => {
    render(<OverlayHarness />);

    expect(screen.getByLabelText("전역 오버레이 상태")).toHaveTextContent(
      "열린 전역 오버레이가 없습니다.",
    );
  });

  it("열린 오버레이가 있으면 공통 흐름 안내를 노출한다", async () => {
    render(<OverlayHarness initialHistorySearch />);

    const status = screen.getByLabelText("전역 오버레이 상태");
    expect(status).toHaveTextContent("1개 오버레이 열림");
    expect(status).toHaveTextContent("히스토리 확인");
    expect(status).toHaveTextContent("닫기 후 메인 입력 복귀");
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

  it("히스토리 검색을 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialHistorySearch />);

    const mainInput = screen.getByLabelText("메인 입력");
    fireEvent.click(screen.getByRole("button", { name: "히스토리 닫기" }));

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });

  it("SSH 모달을 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialSshModal />);

    const mainInput = screen.getByLabelText("메인 입력");
    fireEvent.click(screen.getByRole("button", { name: "SSH 닫기" }));

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });

  it("명령어 팔레트를 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialPalette />);

    const mainInput = screen.getByLabelText("메인 입력");
    fireEvent.click(screen.getByRole("button", { name: "명령어 팔레트 닫기" }));

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });

  it("워크스페이스 패널을 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialWorkspace />);

    const mainInput = screen.getByLabelText("메인 입력");
    fireEvent.click(screen.getByRole("button", { name: "워크스페이스 닫기" }));

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });

  it("모델 매니저 패널을 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialModelManager />);

    const mainInput = screen.getByLabelText("메인 입력");
    const closeButton = await screen.findByRole("button", { name: "모델 닫기" });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });

  it("커밋 패널을 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialCommitPanel />);

    const mainInput = screen.getByLabelText("메인 입력");
    fireEvent.click(screen.getByRole("button", { name: "커밋 닫기" }));

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });

  it("xLLM 패널을 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialXllmPanel />);

    const mainInput = screen.getByLabelText("메인 입력");
    const closeButton = await screen.findByRole("button", { name: "xLLM 닫기" });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });

  it("MCP 패널을 닫으면 메인 입력으로 포커스를 복귀한다", async () => {
    render(<OverlayHarness initialMcpPanel />);

    const mainInput = screen.getByLabelText("메인 입력");
    const closeButton = await screen.findByRole("button", { name: "MCP 닫기" });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(mainInput).toHaveFocus();
    });
  });
});
