import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorPanel from "./InspectorPanel";
import type {
  InspectorAnalyzeCache,
  InspectorFailedBlock,
  InspectorRecentBlock,
  InspectorTab,
  InspectorTabItem,
} from "./InspectorPanel/types";

type InspectorPanelProps = ComponentProps<typeof InspectorPanel>;

vi.mock("./RagPanel", () => ({
  default: ({ model, compact }: { model: string; compact?: boolean }) => (
    <div data-testid="rag-panel">RAG mock {model} {compact ? "compact" : "cozy"}</div>
  ),
}));

vi.mock("./ScriptLibraryPanel", () => ({
  default: ({ compact }: { compact?: boolean }) => (
    <div data-testid="script-library-panel">Scripts mock {compact ? "compact" : "cozy"}</div>
  ),
}));

vi.mock("./SystemMonitorPanel", () => ({
  default: ({ compact }: { compact?: boolean }) => (
    <div data-testid="system-monitor-panel">System mock {compact ? "compact" : "cozy"}</div>
  ),
}));

const baseTabItems: InspectorTabItem[] = [
  { id: "summary", label: "요약", shortcut: "1" },
  { id: "rag", label: "RAG", shortcut: "2" },
  { id: "scripts", label: "Scripts", shortcut: "3" },
  { id: "sysmon", label: "System", shortcut: "4" },
];

const baseFailedBlocks: InspectorFailedBlock[] = [
  { id: "fail-1", command: "npm test", exitCode: 1, outputTail: "ERR_FAIL" },
];

const baseRecentBlocks: InspectorRecentBlock[] = [
  {
    id: "block-1",
    command: "echo ok",
    exitCode: 0,
    durationMs: 1540,
    outputTail: "ok",
  },
];

const baseAnalyzeCache: InspectorAnalyzeCache = {
  blockId: "fail-1",
  command: "npm test",
  requestedAt: 1,
  status: "done",
  result: "테스트 스냅샷이 실패했습니다.",
  rawResult: "raw output",
  suggestedCommands: ["npm test -- --runInBand", "npm run lint"],
};

const streamingAnalyzeCache: InspectorAnalyzeCache = {
  ...baseAnalyzeCache,
  status: "streaming",
  result: "",
  suggestedCommands: [],
};

const errorAnalyzeCache: InspectorAnalyzeCache = {
  ...baseAnalyzeCache,
  status: "error",
  result: "stderr: command failed",
  suggestedCommands: [],
};

const multiAnalyzeCache: InspectorAnalyzeCache = {
  ...baseAnalyzeCache,
  suggestedCommands: ["npm test -- --runInBand", "npm run lint"],
};

function createRefs() {
  return {
    inspectorMoreButtonRefs: { current: {} as Record<number, HTMLButtonElement | null> },
    inspectorMenuFirstActionRefs: { current: {} as Record<number, HTMLButtonElement | null> },
    inspectorQuickActionsToggleRef: { current: null as HTMLButtonElement | null },
    inspectorQuickActionsAdvancedRef: { current: null as HTMLDivElement | null },
    inspectorTabRefs: { current: {} as Record<InspectorTab, HTMLButtonElement | null> },
  };
}

function createScriptLibrary(): InspectorPanelProps["scriptLibrary"] {
  return {
    scripts: [],
    loading: false,
    onLoad: vi.fn(async () => undefined),
    onRun: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    onSave: vi.fn(async (name: string, description: string, commands: string[]) => ({
      id: "script-1",
      name,
      description,
      commands,
      created_at: 1,
    })),
  };
}

function makeInspectorProps(overrides: Partial<InspectorPanelProps> = {}): InspectorPanelProps {
  const refs = createRefs();

  return {
    showInspector: true,
    selectedModel: "qwen2.5",
    inspectorTab: "summary",
    inspectorDensity: "cozy",
    inspectorTabs: baseTabItems,
    inspectorTabRefs: refs.inspectorTabRefs,
    activeTabTitle: "main",
    activeTabPath: "/Users/dev",
    activeTabBranch: undefined,
    activeTabChanged: undefined,
    noActivity: false,
    failedBlocks: baseFailedBlocks,
    focusedFailedBlock: baseFailedBlocks[0],
    analyzeCache: null,
    recentBlocks: baseRecentBlocks,
    commandMenuIndex: null,
    quickActionsExpanded: false,
    inspectorMoreButtonRefs: refs.inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs: refs.inspectorMenuFirstActionRefs,
    inspectorQuickActionsToggleRef: refs.inspectorQuickActionsToggleRef,
    inspectorQuickActionsAdvancedRef: refs.inspectorQuickActionsAdvancedRef,
    onDensityToggle: vi.fn(),
    onClose: vi.fn(),
    onTabSelect: vi.fn(),
    onTabKeyDown: vi.fn(),
    onFocusFailedBlock: vi.fn(),
    onAnalyzeFailedBlock: vi.fn(),
    onCopyFailedOutput: vi.fn(),
    onCopyAnalyzePrompt: vi.fn(),
    onLoadAnalyzePromptToAiBar: vi.fn(),
    onSelectBlock: vi.fn(),
    onCopyAnalyzeResult: vi.fn(),
    onClearAnalyzeCache: vi.fn(),
    onCopySuggestedCommand: vi.fn(),
    onLoadSuggestedCommandToAiBar: vi.fn(),
    onApplySuggestedCommand: vi.fn(),
    onRerunBlock: vi.fn(),
    onCommandMenuRowBlurCapture: vi.fn(),
    onSuggestedCommandRowKeyDown: vi.fn(),
    onCompactMenuKeyDown: vi.fn(),
    onOpenCompactMenu: vi.fn(),
    onCloseCommandMenu: vi.fn(),
    onQuickActionsToggle: vi.fn(),
    onQuickActionsToggleKeyDown: vi.fn(),
    onQuickActionsAdvancedKeyDown: vi.fn(),
    onToggleProjectBin: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenDiffReview: vi.fn(),
    onOpenFailedBlock: vi.fn(),
    scriptLibrary: createScriptLibrary(),
    ...overrides,
  };
}

function renderInspector(overrides: Partial<InspectorPanelProps> = {}) {
  return render(<InspectorPanel {...makeInspectorProps(overrides)} />);
}

describe("InspectorPanel", () => {
  it("showInspector가 false면 패널이 렌더링되지 않는다", () => {
    const { container } = renderInspector({ showInspector: false });

    expect(container.firstChild).toBeNull();
  });

  it("요약 탭에서 Inspector 제목과 요약 정보가 렌더링된다", () => {
    renderInspector();

    expect(screen.getByText("Inspector")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("/Users/dev")).toBeInTheDocument();
    expect(screen.getByText("Failed Block")).toBeInTheDocument();
    expect(screen.getByText("Recent Blocks")).toBeInTheDocument();
  });

  it("noActivity 상태에서는 Inspector 안내 문구를 보여준다", () => {
    renderInspector({
      noActivity: true,
      failedBlocks: [],
      focusedFailedBlock: null,
      recentBlocks: [],
    });

    expect(
      screen.getByText("터미널에서 최근 명령을 실행하면 여기에서 실패 블록·추천 커맨드·최근 기록을 확인할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Failed Block")).not.toBeInTheDocument();
  });

  it("Inspector 닫기 버튼이 onClose를 호출한다", () => {
    const onClose = vi.fn();
    renderInspector({ onClose });

    fireEvent.click(screen.getByLabelText("Inspector 닫기"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Inspector 밀도 토글 버튼이 onDensityToggle를 호출하고 현재 밀도 라벨을 보여준다", () => {
    const onDensityToggle = vi.fn();
    renderInspector({
      inspectorDensity: "compact",
      onDensityToggle,
    });

    expect(screen.getByText("COMPACT")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Inspector 밀도 토글"));

    expect(onDensityToggle).toHaveBeenCalledTimes(1);
  });

  it("브랜치와 변경 개수가 있으면 워크스페이스 배지를 보여준다", () => {
    renderInspector({
      activeTabBranch: "feature/inspector",
      activeTabChanged: 3,
    });

    expect(screen.getByText("feature/inspector")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("변경 개수가 0이면 숫자 배지를 숨긴다", () => {
    renderInspector({
      activeTabBranch: "feature/inspector",
      activeTabChanged: 0,
    });

    expect(screen.getByText("feature/inspector")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("빠른 액션 더보기 토글을 누르면 onQuickActionsToggle가 호출된다", () => {
    const onQuickActionsToggle = vi.fn();
    renderInspector({ onQuickActionsToggle });

    fireEvent.click(screen.getByText("더보기"));

    expect(onQuickActionsToggle).toHaveBeenCalledTimes(1);
  });

  it("빠른 액션 더보기 토글은 keydown 핸들러를 호출한다", () => {
    const onQuickActionsToggleKeyDown = vi.fn();
    renderInspector({ onQuickActionsToggleKeyDown });

    fireEvent.keyDown(screen.getByText("더보기"), { key: "ArrowDown" });

    expect(onQuickActionsToggleKeyDown).toHaveBeenCalledTimes(1);
  });

  it("확장된 빠른 액션 버튼들은 각 콜백을 호출한다", () => {
    const onOpenHistory = vi.fn();
    const onOpenDiffReview = vi.fn();
    const onOpenFailedBlock = vi.fn();
    const onTabSelect = vi.fn();
    renderInspector({
      quickActionsExpanded: true,
      onOpenHistory,
      onOpenDiffReview,
      onOpenFailedBlock,
      onTabSelect,
    });

    fireEvent.click(screen.getByText("History"));
    fireEvent.click(screen.getByText("Diff"));
    fireEvent.click(screen.getByText("Failed"));
    fireEvent.click(screen.getAllByText("Scripts")[1]);
    fireEvent.click(screen.getAllByText("System")[1]);

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onOpenDiffReview).toHaveBeenCalledTimes(1);
    expect(onOpenFailedBlock).toHaveBeenCalledTimes(1);
    expect(onTabSelect).toHaveBeenNthCalledWith(1, "scripts");
    expect(onTabSelect).toHaveBeenNthCalledWith(2, "sysmon");
  });

  it("확장된 빠른 액션 영역은 keydown 핸들러를 호출한다", () => {
    const onQuickActionsAdvancedKeyDown = vi.fn();
    renderInspector({
      quickActionsExpanded: true,
      onQuickActionsAdvancedKeyDown,
    });

    fireEvent.keyDown(screen.getByText("History").closest("[data-inspector-quick-actions-advanced]")!, {
      key: "ArrowRight",
    });

    expect(onQuickActionsAdvancedKeyDown).toHaveBeenCalledTimes(1);
  });

  it("탭 전환 버튼 클릭 시 onTabSelect가 호출된다", () => {
    const onTabSelect = vi.fn();
    renderInspector({ onTabSelect });

    fireEvent.click(screen.getByRole("tab", { name: /RAG/ }));

    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("RAG 탭은 RAG 패널에 모델과 밀도 상태를 전달한다", () => {
    renderInspector({
      inspectorTab: "rag",
      inspectorDensity: "compact",
      selectedModel: "local-coder",
    });

    expect(screen.getByTestId("rag-panel")).toHaveTextContent("local-coder compact");
    expect(screen.queryByText("Failed Block")).not.toBeInTheDocument();
  });

  it("Scripts 탭은 스크립트 라이브러리 패널을 렌더링한다", () => {
    renderInspector({
      inspectorTab: "scripts",
      scriptLibrary: {
        ...createScriptLibrary(),
        scripts: [
          {
            id: "script-1",
            name: "테스트 실행",
            description: "unit",
            commands: ["npm test"],
            created_at: 1,
          },
        ],
      },
    });

    expect(screen.getByTestId("script-library-panel")).toHaveTextContent("Scripts mock cozy");
    expect(screen.queryByText("Failed Block")).not.toBeInTheDocument();
  });

  it("System 탭은 시스템 모니터 패널을 렌더링한다", () => {
    renderInspector({
      inspectorTab: "sysmon",
      inspectorDensity: "compact",
    });

    expect(screen.getByTestId("system-monitor-panel")).toHaveTextContent("System mock compact");
    expect(screen.queryByText("Failed Block")).not.toBeInTheDocument();
  });

  it("요약 탭 실패 분석 버튼이 onAnalyzeFailedBlock를 호출한다", () => {
    const onAnalyzeFailedBlock = vi.fn();
    renderInspector({ onAnalyzeFailedBlock });

    fireEvent.click(screen.getByText("AI ANALYZE"));

    expect(onAnalyzeFailedBlock).toHaveBeenCalledWith("fail-1");
  });

  it("실패 블록이 없으면 빈 상태 문구를 보여준다", () => {
    renderInspector({
      failedBlocks: [],
      focusedFailedBlock: null,
    });

    expect(screen.getByText("실패 블록이 없습니다.")).toBeInTheDocument();
  });

  it("요약 탭 실패 블록 보조 액션들은 각 콜백을 호출한다", () => {
    const onFocusFailedBlock = vi.fn();
    const onCopyFailedOutput = vi.fn();
    const onCopyAnalyzePrompt = vi.fn();
    const onLoadAnalyzePromptToAiBar = vi.fn();
    const onSelectBlock = vi.fn();
    renderInspector({
      onFocusFailedBlock,
      onCopyFailedOutput,
      onCopyAnalyzePrompt,
      onLoadAnalyzePromptToAiBar,
      onSelectBlock,
    });

    fireEvent.click(screen.getByText("NEXT FAIL"));
    fireEvent.click(screen.getByText("COPY LOG"));
    fireEvent.click(screen.getByText("COPY PROMPT"));
    fireEvent.click(screen.getByText("LOAD PROMPT"));
    fireEvent.click(screen.getByText("SELECT"));

    expect(onFocusFailedBlock).toHaveBeenCalledTimes(1);
    expect(onCopyFailedOutput).toHaveBeenCalledWith("fail-1");
    expect(onCopyAnalyzePrompt).toHaveBeenCalledWith("fail-1");
    expect(onLoadAnalyzePromptToAiBar).toHaveBeenCalledWith("fail-1");
    expect(onSelectBlock).toHaveBeenCalledWith("fail-1");
  });

  it("기본 빠른 액션 버튼들은 각 콜백을 호출한다", () => {
    const onToggleProjectBin = vi.fn();
    const onOpenWorkspace = vi.fn();
    const onTabSelect = vi.fn();
    renderInspector({
      onToggleProjectBin,
      onOpenWorkspace,
      onTabSelect,
    });

    fireEvent.click(screen.getByRole("button", { name: /Project Bin/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Workspace$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^RAG$/ }));

    expect(onToggleProjectBin).toHaveBeenCalledTimes(1);
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("완료된 분석 캐시의 추천 커맨드를 렌더링하고 실행 콜백을 호출한다", () => {
    const onApplySuggestedCommand = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      onApplySuggestedCommand,
    });

    expect(screen.getByText("DONE")).toBeInTheDocument();
    expect(screen.getByText("Suggested Commands")).toBeInTheDocument();
    expect(screen.getByText("npm test -- --runInBand")).toBeInTheDocument();

    fireEvent.click(screen.getByText("RUN #1"));

    expect(onApplySuggestedCommand).toHaveBeenCalledWith(0);
  });

  it("분석 캐시가 없으면 빈 상태 문구를 보여준다", () => {
    renderInspector({ analyzeCache: null });

    expect(screen.getByText("아직 실행된 분석이 없습니다.")).toBeInTheDocument();
  });

  it("streaming 분석 캐시는 진행 중 상태 문구를 보여준다", () => {
    renderInspector({ analyzeCache: streamingAnalyzeCache });

    expect(screen.getByText("STREAMING")).toBeInTheDocument();
    expect(screen.getByText("응답을 기다리는 중...")).toBeInTheDocument();
    expect(screen.queryByText("Suggested Commands")).not.toBeInTheDocument();
  });

  it("error 분석 캐시는 오류 상태와 결과를 보여준다", () => {
    renderInspector({ analyzeCache: errorAnalyzeCache });

    expect(screen.getByText("ERROR")).toBeInTheDocument();
    expect(screen.getByText("stderr: command failed")).toBeInTheDocument();
    expect(screen.queryByText("Suggested Commands")).not.toBeInTheDocument();
  });

  it("분석 캐시가 있으면 COPY와 CLEAR 액션을 호출한다", () => {
    const onCopyAnalyzeResult = vi.fn();
    const onClearAnalyzeCache = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      onCopyAnalyzeResult,
      onClearAnalyzeCache,
    });

    fireEvent.click(screen.getAllByText("COPY")[0]);
    fireEvent.click(screen.getByText("CLEAR"));

    expect(onCopyAnalyzeResult).toHaveBeenCalledTimes(1);
    expect(onClearAnalyzeCache).toHaveBeenCalledTimes(1);
  });

  it("최근 블록 액션들은 선택, 재실행, 분석 프롬프트 로드를 호출한다", () => {
    const onSelectBlock = vi.fn();
    const onRerunBlock = vi.fn();
    const onLoadAnalyzePromptToAiBar = vi.fn();
    renderInspector({
      recentBlocks: [
        {
          id: "block-2",
          command: "npm run build",
          exitCode: 1,
          durationMs: 2300,
          outputTail: "build failed",
        },
      ],
      onSelectBlock,
      onRerunBlock,
      onLoadAnalyzePromptToAiBar,
    });

    fireEvent.click(screen.getByText("SEL"));
    fireEvent.click(screen.getByText("RUN"));
    fireEvent.click(screen.getByText("LOAD"));

    expect(onSelectBlock).toHaveBeenCalledWith("block-2");
    expect(onRerunBlock).toHaveBeenCalledWith("npm run build");
    expect(onLoadAnalyzePromptToAiBar).toHaveBeenCalledWith("block-2");
  });

  it("성공한 최근 블록은 LOAD 버튼을 노출하지 않는다", () => {
    renderInspector({
      recentBlocks: [
        {
          id: "block-3",
          command: "echo ok",
          exitCode: 0,
          durationMs: 120,
          outputTail: "ok",
        },
      ],
    });

    expect(screen.queryByText("LOAD")).not.toBeInTheDocument();
  });

  it("compact 분석 메뉴의 MORE 버튼은 닫힌 상태에서 메뉴 열기 콜백을 호출한다", () => {
    const onOpenCompactMenu = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      inspectorDensity: "compact",
      onOpenCompactMenu,
    });

    fireEvent.click(screen.getAllByText("MORE")[0]);

    expect(onOpenCompactMenu).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("compact 분석 카드의 RUN (R)은 두 번째 추천 커맨드 인덱스를 전달한다", () => {
    const onApplySuggestedCommand = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      inspectorDensity: "compact",
      onApplySuggestedCommand,
    });

    fireEvent.click(screen.getAllByText("RUN (R)")[1]);

    expect(onApplySuggestedCommand).toHaveBeenCalledWith(1);
  });

  it("추천 커맨드 행 blur와 keydown은 row index를 전달한다", () => {
    const onCommandMenuRowBlurCapture = vi.fn();
    const onSuggestedCommandRowKeyDown = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      onCommandMenuRowBlurCapture,
      onSuggestedCommandRowKeyDown,
    });

    const commandRow = document.querySelector('[data-inspector-command-menu-row="1"]') as HTMLDivElement;

    fireEvent.blur(commandRow);
    fireEvent.keyDown(commandRow, { key: "ArrowDown" });

    expect(onCommandMenuRowBlurCapture).toHaveBeenCalledTimes(1);
    expect(onCommandMenuRowBlurCapture.mock.calls[0][1]).toBe(0);
    expect(onSuggestedCommandRowKeyDown).toHaveBeenCalledTimes(1);
    expect(onSuggestedCommandRowKeyDown.mock.calls[0][1]).toBe(0);
  });

  it("compact 분석 메뉴의 MORE 버튼은 키보드로도 메뉴 열기 콜백을 호출한다", () => {
    const onOpenCompactMenu = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      inspectorDensity: "compact",
      onOpenCompactMenu,
    });

    const moreButton = screen.getAllByText("MORE")[0];
    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    fireEvent.keyDown(moreButton, { key: "Enter" });
    fireEvent.keyDown(moreButton, { key: "Escape" });

    expect(onOpenCompactMenu).toHaveBeenNthCalledWith(1, 0);
    expect(onOpenCompactMenu).toHaveBeenNthCalledWith(2, 0);
    expect(onOpenCompactMenu).toHaveBeenCalledTimes(2);
  });

  it("열린 compact 메뉴는 두 번째 행의 aria-expanded 상태를 반영한다", () => {
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      inspectorDensity: "compact",
      commandMenuIndex: 1,
    });

    const moreButtons = screen.getAllByText("MORE");
    expect(moreButtons[0].closest("button")).toHaveAttribute("aria-expanded", "false");
    expect(moreButtons[1].closest("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("compact 분석 메뉴가 열린 상태에서 복사와 로드 콜백을 호출한다", () => {
    const onCopySuggestedCommand = vi.fn();
    const onLoadSuggestedCommandToAiBar = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      commandMenuIndex: 0,
      inspectorDensity: "compact",
      onCopySuggestedCommand,
      onLoadSuggestedCommandToAiBar,
    });

    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(screen.getByText("COPY (C)"));
    fireEvent.click(screen.getByText("LOAD (L)"));

    expect(onCopySuggestedCommand).toHaveBeenCalledWith(0);
    expect(onLoadSuggestedCommandToAiBar).toHaveBeenCalledWith(0);
  });

  it("일반 밀도 추천 커맨드 버튼들은 두 번째 인덱스를 전달한다", () => {
    const onCopySuggestedCommand = vi.fn();
    const onLoadSuggestedCommandToAiBar = vi.fn();
    const onApplySuggestedCommand = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      onCopySuggestedCommand,
      onLoadSuggestedCommandToAiBar,
      onApplySuggestedCommand,
    });

    fireEvent.click(screen.getByTitle("2번 커맨드 복사 (C)"));
    fireEvent.click(screen.getByTitle("2번 커맨드 AI 입력바 로드 (L)"));
    fireEvent.click(screen.getByTitle("2번 커맨드 실행 (R)"));

    expect(onCopySuggestedCommand).toHaveBeenCalledWith(1);
    expect(onLoadSuggestedCommandToAiBar).toHaveBeenCalledWith(1);
    expect(onApplySuggestedCommand).toHaveBeenCalledWith(1);
  });

  it("compact 분석 메뉴가 열린 상태에서 메뉴 keydown 콜백에 row index를 전달한다", () => {
    const onCompactMenuKeyDown = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      commandMenuIndex: 0,
      inspectorDensity: "compact",
      onCompactMenuKeyDown,
    });

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowRight" });

    expect(onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
    expect(onCompactMenuKeyDown.mock.calls[0][1]).toBe(0);
  });

  it("compact 분석 메뉴가 열린 상태에서 MORE 버튼을 다시 누르면 메뉴 닫기 콜백을 호출한다", () => {
    const onCloseCommandMenu = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      commandMenuIndex: 0,
      inspectorDensity: "compact",
      onCloseCommandMenu,
    });

    fireEvent.click(screen.getAllByText("MORE")[0]);

    expect(onCloseCommandMenu).toHaveBeenCalledTimes(1);
  });
});
