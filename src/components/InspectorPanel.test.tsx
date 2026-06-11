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

  it("Inspector 닫기 버튼이 onClose를 호출한다", () => {
    const onClose = vi.fn();
    renderInspector({ onClose });

    fireEvent.click(screen.getByLabelText("Inspector 닫기"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("빠른 액션 더보기 토글을 누르면 onQuickActionsToggle가 호출된다", () => {
    const onQuickActionsToggle = vi.fn();
    renderInspector({ onQuickActionsToggle });

    fireEvent.click(screen.getByText("더보기"));

    expect(onQuickActionsToggle).toHaveBeenCalledTimes(1);
  });

  it("탭 전환 버튼 클릭 시 onTabSelect가 호출된다", () => {
    const onTabSelect = vi.fn();
    renderInspector({ onTabSelect });

    fireEvent.click(screen.getByRole("tab", { name: /RAG/ }));

    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("요약 탭 실패 분석 버튼이 onAnalyzeFailedBlock를 호출한다", () => {
    const onAnalyzeFailedBlock = vi.fn();
    renderInspector({ onAnalyzeFailedBlock });

    fireEvent.click(screen.getByText("AI ANALYZE"));

    expect(onAnalyzeFailedBlock).toHaveBeenCalledWith("fail-1");
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
});
