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

const doneWithoutSuggestionsCache: InspectorAnalyzeCache = {
  ...baseAnalyzeCache,
  suggestedCommands: [],
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

  it("cozy 밀도에서는 Compact 보기 타이틀을 노출한다", () => {
    renderInspector({ inspectorDensity: "cozy" });

    expect(screen.getByLabelText("Inspector 밀도 토글")).toHaveAttribute("title", "Compact 보기");
    expect(screen.getByText("COZY")).toBeInTheDocument();
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

  it("브랜치가 없으면 워크스페이스 배지를 숨긴다", () => {
    renderInspector({
      activeTabBranch: undefined,
      activeTabChanged: 5,
    });

    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  it("빠른 액션 더보기 토글을 누르면 onQuickActionsToggle가 호출된다", () => {
    const onQuickActionsToggle = vi.fn();
    renderInspector({ onQuickActionsToggle });

    fireEvent.click(screen.getByText("더보기"));

    expect(onQuickActionsToggle).toHaveBeenCalledTimes(1);
  });

  it("빠른 액션이 접혀 있으면 더보기 라벨과 collapsed 상태를 보여준다", () => {
    renderInspector({ quickActionsExpanded: false });

    expect(screen.getByText("더보기")).toBeInTheDocument();
    expect(screen.getByText("더보기").closest("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("빠른 액션이 접혀 있으면 고급 액션 영역 DOM을 렌더링하지 않는다", () => {
    renderInspector({ quickActionsExpanded: false });

    expect(document.querySelector("[data-inspector-quick-actions-advanced]")).toBeNull();
  });

  it("빠른 액션 토글은 확장 영역 id를 aria-controls로 가리킨다", () => {
    renderInspector({ quickActionsExpanded: true });

    expect(screen.getByText("축소").closest("button")).toHaveAttribute("aria-controls", "inspector-quick-actions-advanced");
    expect(screen.getByText("History").closest("[data-inspector-quick-actions-advanced]")).toHaveAttribute(
      "id",
      "inspector-quick-actions-advanced",
    );
  });

  it("빠른 액션 토글 버튼은 data attribute를 노출한다", () => {
    renderInspector({ quickActionsExpanded: false });

    expect(screen.getByText("더보기").closest("button")).toHaveAttribute("data-inspector-quick-actions-toggle");
  });

  it("빠른 액션 관련 ref는 토글 버튼과 확장 영역 DOM을 보관한다", () => {
    const refs = createRefs();
    render(
      <InspectorPanel
        {...makeInspectorProps({
          quickActionsExpanded: true,
          inspectorQuickActionsToggleRef: refs.inspectorQuickActionsToggleRef,
          inspectorQuickActionsAdvancedRef: refs.inspectorQuickActionsAdvancedRef,
        })}
      />,
    );

    expect(refs.inspectorQuickActionsToggleRef.current).toBe(screen.getByText("축소").closest("button"));
    expect(refs.inspectorQuickActionsAdvancedRef.current).toBe(
      screen.getByText("History").closest("[data-inspector-quick-actions-advanced]"),
    );
  });

  it("빠른 액션이 접힌 상태에서도 토글 ref는 버튼을 가리키고 확장 영역 ref는 null이다", () => {
    const refs = createRefs();
    render(
      <InspectorPanel
        {...makeInspectorProps({
          quickActionsExpanded: false,
          inspectorQuickActionsToggleRef: refs.inspectorQuickActionsToggleRef,
          inspectorQuickActionsAdvancedRef: refs.inspectorQuickActionsAdvancedRef,
        })}
      />,
    );

    expect(refs.inspectorQuickActionsToggleRef.current).toBe(screen.getByText("더보기").closest("button"));
    expect(refs.inspectorQuickActionsAdvancedRef.current).toBeNull();
  });

  it("빠른 액션이 확장되면 축소 라벨과 expanded 상태를 보여준다", () => {
    renderInspector({ quickActionsExpanded: true });

    expect(screen.getByText("축소")).toBeInTheDocument();
    expect(screen.getByText("축소").closest("button")).toHaveAttribute("aria-expanded", "true");
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

  it("탭 리스트 keydown은 onTabKeyDown으로 전달된다", () => {
    const onTabKeyDown = vi.fn();
    renderInspector({ onTabKeyDown });

    fireEvent.keyDown(screen.getByRole("tablist", { name: "Inspector 탭" }), { key: "ArrowRight" });

    expect(onTabKeyDown).toHaveBeenCalledTimes(1);
  });

  it("탭 버튼 Enter 입력은 해당 탭 선택 콜백을 호출한다", () => {
    const onTabSelect = vi.fn();
    renderInspector({ onTabSelect });

    fireEvent.keyDown(screen.getByRole("tab", { name: /RAG/ }), { key: "Enter" });

    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("탭 버튼 Space 입력도 해당 탭 선택 콜백을 호출한다", () => {
    const onTabSelect = vi.fn();
    renderInspector({ onTabSelect });

    fireEvent.keyDown(screen.getByRole("tab", { name: /RAG/ }), { key: " " });

    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("탭 버튼은 단축키 메타데이터를 노출한다", () => {
    renderInspector();

    expect(screen.getByRole("tab", { name: /RAG/ })).toHaveAttribute("aria-keyshortcuts", "Alt+2");
  });

  it("활성 탭은 aria-selected=true와 tabIndex 0을 가진다", () => {
    renderInspector({ inspectorTab: "summary" });

    expect(screen.getByRole("tab", { name: /요약/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /요약/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /RAG/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /RAG/ })).toHaveAttribute("tabindex", "-1");
  });

  it("요약 탭 버튼과 패널도 aria-controls와 aria-labelledby로 연결된다", () => {
    renderInspector({ inspectorTab: "summary" });

    expect(screen.getByRole("tab", { name: /요약/ })).toHaveAttribute("aria-controls", "inspector-tabpanel-summary");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "inspector-tab-summary");
  });

  it("탭 ref 맵은 렌더된 탭 버튼 DOM을 보관한다", () => {
    const refs = createRefs();
    render(
      <InspectorPanel
        {...makeInspectorProps({
          inspectorTabRefs: refs.inspectorTabRefs,
        })}
      />,
    );

    expect(refs.inspectorTabRefs.current.summary).toBe(screen.getByRole("tab", { name: /요약/ }));
    expect(refs.inspectorTabRefs.current.rag).toBe(screen.getByRole("tab", { name: /RAG/ }));
    expect(refs.inspectorTabRefs.current.scripts).toBe(screen.getByRole("tab", { name: /Scripts/ }));
    expect(refs.inspectorTabRefs.current.sysmon).toBe(screen.getByRole("tab", { name: /System/ }));
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

  it("탭 버튼과 패널은 aria-controls와 aria-labelledby로 연결된다", () => {
    renderInspector({ inspectorTab: "rag" });

    expect(screen.getByRole("tab", { name: /RAG/ })).toHaveAttribute("aria-controls", "inspector-tabpanel-rag");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "inspector-tab-rag");
  });

  it("Scripts 탭 버튼과 패널도 접근성 속성으로 연결된다", () => {
    renderInspector({ inspectorTab: "scripts" });

    expect(screen.getByRole("tab", { name: /Scripts/ })).toHaveAttribute("aria-controls", "inspector-tabpanel-scripts");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "inspector-tab-scripts");
  });

  it("System 탭 버튼과 패널도 접근성 속성으로 연결된다", () => {
    renderInspector({ inspectorTab: "sysmon" });

    expect(screen.getByRole("tab", { name: /System/ })).toHaveAttribute("aria-controls", "inspector-tabpanel-sysmon");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "inspector-tab-sysmon");
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

  it("cozy 분석 카드는 일반 밀도 안내 문구를 보여준다", () => {
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      inspectorDensity: "cozy",
    });

    expect(screen.getByText("R 실행 · C 복사 · L 로드")).toBeInTheDocument();
  });

  it("추천 커맨드가 없으면 Suggested Commands 영역을 숨긴다", () => {
    renderInspector({
      analyzeCache: doneWithoutSuggestionsCache,
      inspectorDensity: "cozy",
    });

    expect(screen.queryByText("Suggested Commands")).not.toBeInTheDocument();
    expect(screen.queryByText("R 실행 · C 복사 · L 로드")).not.toBeInTheDocument();
    expect(screen.getByText("RUN #1")).toBeInTheDocument();
  });

  it("분석 캐시가 없으면 빈 상태 문구를 보여준다", () => {
    renderInspector({ analyzeCache: null });

    expect(screen.getByText("아직 실행된 분석이 없습니다.")).toBeInTheDocument();
  });

  it("분석 캐시가 없으면 상단 CLEAR 액션을 숨긴다", () => {
    renderInspector({ analyzeCache: null });

    expect(screen.queryByText("CLEAR")).not.toBeInTheDocument();
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

  it("compact 분석 카드는 compact 안내 문구를 보여준다", () => {
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      inspectorDensity: "compact",
    });

    expect(screen.getByText("R 실행 · MORE→C/L")).toBeInTheDocument();
  });

  it("cozy 추천 커맨드 행은 tabIndex -1을 가진다", () => {
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      inspectorDensity: "cozy",
    });

    const commandRow = document.querySelector('[data-inspector-command-menu-row="1"]') as HTMLDivElement;
    expect(commandRow).toHaveAttribute("tabindex", "-1");
  });

  it("compact 추천 커맨드 행은 tabIndex 0을 가진다", () => {
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      inspectorDensity: "compact",
    });

    const commandRow = document.querySelector('[data-inspector-command-menu-row="1"]') as HTMLDivElement;
    expect(commandRow).toHaveAttribute("tabindex", "0");
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

  it("추천 커맨드 두 번째 행 blur는 row index 1을 전달한다", () => {
    const onCommandMenuRowBlurCapture = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      onCommandMenuRowBlurCapture,
    });

    const commandRow = document.querySelector('[data-inspector-command-menu-row="2"]') as HTMLDivElement;
    fireEvent.blur(commandRow);

    expect(onCommandMenuRowBlurCapture).toHaveBeenCalledTimes(1);
    expect(onCommandMenuRowBlurCapture.mock.calls[0]?.[1]).toBe(1);
  });

  it("추천 커맨드 행 keydown은 누른 키와 행 인덱스를 함께 전달한다", () => {
    const onSuggestedCommandRowKeyDown = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      onSuggestedCommandRowKeyDown,
    });

    const commandRow = document.querySelector('[data-inspector-command-menu-row="1"]') as HTMLDivElement;
    fireEvent.keyDown(commandRow, { key: "Q" });

    expect(onSuggestedCommandRowKeyDown).toHaveBeenCalledTimes(1);
    const [eventArg, rowArg] = onSuggestedCommandRowKeyDown.mock.calls[0] ?? [];
    expect(rowArg).toBe(0);
    expect(eventArg.key).toBe("Q");
  });

  it("추천 커맨드 두 번째 행 keydown에서 row index 1이 전달된다", () => {
    const onSuggestedCommandRowKeyDown = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      onSuggestedCommandRowKeyDown,
    });

    const commandRow = document.querySelector('[data-inspector-command-menu-row="2"]') as HTMLDivElement;
    fireEvent.keyDown(commandRow, { key: "ArrowLeft" });

    expect(onSuggestedCommandRowKeyDown).toHaveBeenCalledTimes(1);
    expect(onSuggestedCommandRowKeyDown.mock.calls[0]?.[1]).toBe(1);
    expect(commandRow).toHaveAttribute("data-inspector-command-menu-row", "2");
  });

  it("compact 모드에서도 추천 커맨드 행 keydown 이벤트가 행 인덱스를 전달한다", () => {
    const onSuggestedCommandRowKeyDown = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      inspectorDensity: "compact",
      onSuggestedCommandRowKeyDown,
    });

    const commandRow = document.querySelector('[data-inspector-command-menu-row="1"]') as HTMLDivElement;
    fireEvent.keyDown(commandRow, { key: "Q" });

    expect(onSuggestedCommandRowKeyDown).toHaveBeenCalledTimes(1);
    expect(onSuggestedCommandRowKeyDown.mock.calls[0]?.[1]).toBe(0);
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

  it("compact MORE 버튼의 비지원 키는 onOpenCompactMenu를 호출하지 않는다", () => {
    const onOpenCompactMenu = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      inspectorDensity: "compact",
      onOpenCompactMenu,
    });

    const moreButton = screen.getAllByText("MORE")[0];
    fireEvent.keyDown(moreButton, { key: "Tab" });
    fireEvent.keyDown(moreButton, { key: "ArrowUp" });

    expect(onOpenCompactMenu).not.toHaveBeenCalled();
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

  it("compact MORE 버튼은 각 추천 행의 메뉴 id를 aria-controls로 연결한다", () => {
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      inspectorDensity: "compact",
      commandMenuIndex: 1,
    });

    const moreButtons = screen.getAllByText("MORE");
    expect(moreButtons[0].closest("button")).toHaveAttribute("aria-controls", "inspector-command-menu-0");
    expect(moreButtons[1].closest("button")).toHaveAttribute("aria-controls", "inspector-command-menu-1");
    expect(screen.getByRole("menu")).toHaveAttribute("id", "inspector-command-menu-1");
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

  it("compact 분석 메뉴는 menuitem 역할의 액션 버튼들을 노출한다", () => {
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      commandMenuIndex: 0,
      inspectorDensity: "compact",
    });

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(2);
    expect(menuItems[0]).toHaveTextContent("COPY (C)");
    expect(menuItems[1]).toHaveTextContent("LOAD (L)");
  });

  it("compact 분석 메뉴가 열리면 첫 메뉴 액션 ref가 COPY 버튼을 가리킨다", () => {
    const refs = createRefs();
    render(
      <InspectorPanel
        {...makeInspectorProps({
          analyzeCache: baseAnalyzeCache,
          commandMenuIndex: 0,
          inspectorDensity: "compact",
          inspectorMenuFirstActionRefs: refs.inspectorMenuFirstActionRefs,
        })}
      />,
    );

    expect(refs.inspectorMenuFirstActionRefs.current[0]).toBe(screen.getByText("COPY (C)").closest("button"));
  });

  it("compact 추천 커맨드 MORE 버튼 ref는 각 행의 버튼 DOM을 보관한다", () => {
    const refs = createRefs();
    render(
      <InspectorPanel
        {...makeInspectorProps({
          analyzeCache: multiAnalyzeCache,
          inspectorDensity: "compact",
          inspectorMoreButtonRefs: refs.inspectorMoreButtonRefs,
        })}
      />,
    );

    const moreButtons = screen.getAllByText("MORE");
    expect(refs.inspectorMoreButtonRefs.current[0]).toBe(moreButtons[0].closest("button"));
    expect(refs.inspectorMoreButtonRefs.current[1]).toBe(moreButtons[1].closest("button"));
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

  it("compact 분석 메뉴에서 Escape keydown도 row index를 전달한다", () => {
    const onCompactMenuKeyDown = vi.fn();
    renderInspector({
      analyzeCache: baseAnalyzeCache,
      commandMenuIndex: 0,
      inspectorDensity: "compact",
      onCompactMenuKeyDown,
    });

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
    expect(onCompactMenuKeyDown.mock.calls[0][1]).toBe(0);
  });

  it("compact 두 번째 행에서 메뉴 keydown은 row index 1을 전달한다", () => {
    const onCompactMenuKeyDown = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      commandMenuIndex: 1,
      inspectorDensity: "compact",
      onCompactMenuKeyDown,
    });

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowRight" });

    expect(onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
    expect(onCompactMenuKeyDown.mock.calls[0][1]).toBe(1);
  });

  it("compact 두 번째 행에서 Escape keydown은 row index 1을 전달한다", () => {
    const onCompactMenuKeyDown = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      commandMenuIndex: 1,
      inspectorDensity: "compact",
      onCompactMenuKeyDown,
    });

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
    expect(onCompactMenuKeyDown.mock.calls[0][1]).toBe(1);
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

    expect(onCloseCommandMenu).toHaveBeenCalledWith(true);
  });

  it("compact 두 번째 행의 RUN 버튼은 onCloseCommandMenu(false)를 호출한다", () => {
    const onCloseCommandMenu = vi.fn();
    renderInspector({
      analyzeCache: multiAnalyzeCache,
      commandMenuIndex: 0,
      inspectorDensity: "compact",
      onCloseCommandMenu,
    });

    fireEvent.click(screen.getByText("RUN (R) #2"));

    expect(onCloseCommandMenu).toHaveBeenCalledWith(false);
  });
});
