import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorPanel from "./InspectorPanel";
import type {
  InspectorAnalyzeCache,
  InspectorDensity,
  InspectorRecentBlock,
  InspectorFailedBlock,
  InspectorTab,
  InspectorTabItem,
} from "./InspectorPanel/types";

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

const noopRefs = {
  inspectorMoreButtonRefs: { current: {} as Record<number, HTMLButtonElement | null> },
  inspectorMenuFirstActionRefs: { current: {} as Record<number, HTMLButtonElement | null> },
  inspectorQuickActionsToggleRef: { current: null as HTMLButtonElement | null },
  inspectorQuickActionsAdvancedRef: { current: null as HTMLDivElement | null },
  inspectorTabRefs: { current: {} as Record<InspectorTab, HTMLButtonElement | null> },
};

describe("InspectorPanel", () => {
  it("showInspector가 false면 패널이 렌더링되지 않는다", () => {
    const { container } = render(
      <InspectorPanel
        showInspector={false}
        selectedModel="qwen2.5"
        inspectorTab="summary"
        inspectorDensity={"cozy" as InspectorDensity}
        inspectorTabs={baseTabItems}
        inspectorTabRefs={noopRefs.inspectorTabRefs}
        activeTabTitle="main"
        activeTabPath="/Users/dev"
        noActivity={true}
        failedBlocks={[]}
        focusedFailedBlock={null}
        analyzeCache={null}
        recentBlocks={[]}
        commandMenuIndex={null}
        quickActionsExpanded={false}
        inspectorMoreButtonRefs={noopRefs.inspectorMoreButtonRefs}
        inspectorMenuFirstActionRefs={noopRefs.inspectorMenuFirstActionRefs}
        inspectorQuickActionsToggleRef={noopRefs.inspectorQuickActionsToggleRef}
        inspectorQuickActionsAdvancedRef={noopRefs.inspectorQuickActionsAdvancedRef}
        onDensityToggle={vi.fn()}
        onClose={vi.fn()}
        onTabSelect={vi.fn()}
        onTabKeyDown={vi.fn()}
        onFocusFailedBlock={vi.fn()}
        onAnalyzeFailedBlock={vi.fn()}
        onCopyFailedOutput={vi.fn()}
        onCopyAnalyzePrompt={vi.fn()}
        onLoadAnalyzePromptToAiBar={vi.fn()}
        onSelectBlock={vi.fn()}
        onCopyAnalyzeResult={vi.fn()}
        onClearAnalyzeCache={vi.fn()}
        onCopySuggestedCommand={vi.fn()}
        onLoadSuggestedCommandToAiBar={vi.fn()}
        onApplySuggestedCommand={vi.fn()}
        onRerunBlock={vi.fn()}
        onCommandMenuRowBlurCapture={vi.fn()}
        onSuggestedCommandRowKeyDown={vi.fn()}
        onCompactMenuKeyDown={vi.fn()}
        onOpenCompactMenu={vi.fn()}
        onCloseCommandMenu={vi.fn()}
        onQuickActionsToggle={vi.fn()}
        onQuickActionsToggleKeyDown={vi.fn()}
        onQuickActionsAdvancedKeyDown={vi.fn()}
        onToggleProjectBin={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenDiffReview={vi.fn()}
        onOpenFailedBlock={vi.fn()}
        scriptLibrary={{
          scripts: [],
          loading: false,
          onLoad: vi.fn(),
          onRun: vi.fn(),
          onDelete: vi.fn(),
          onSave: vi.fn(),
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("요약 탭에서 Inspector 제목과 요약 정보가 렌더링된다", () => {
    render(
      <InspectorPanel
        showInspector
        selectedModel="qwen2.5"
        inspectorTab="summary"
        inspectorDensity={"cozy" as InspectorDensity}
        inspectorTabs={baseTabItems}
        inspectorTabRefs={noopRefs.inspectorTabRefs}
        activeTabTitle="main"
        activeTabPath="/Users/dev"
        noActivity={false}
        failedBlocks={baseFailedBlocks}
        focusedFailedBlock={baseFailedBlocks[0]}
        analyzeCache={null}
        recentBlocks={baseRecentBlocks}
        commandMenuIndex={null}
        quickActionsExpanded={false}
        inspectorMoreButtonRefs={noopRefs.inspectorMoreButtonRefs}
        inspectorMenuFirstActionRefs={noopRefs.inspectorMenuFirstActionRefs}
        inspectorQuickActionsToggleRef={noopRefs.inspectorQuickActionsToggleRef}
        inspectorQuickActionsAdvancedRef={noopRefs.inspectorQuickActionsAdvancedRef}
        onDensityToggle={vi.fn()}
        onClose={vi.fn()}
        onTabSelect={vi.fn()}
        onTabKeyDown={vi.fn()}
        onFocusFailedBlock={vi.fn()}
        onAnalyzeFailedBlock={vi.fn()}
        onCopyFailedOutput={vi.fn()}
        onCopyAnalyzePrompt={vi.fn()}
        onLoadAnalyzePromptToAiBar={vi.fn()}
        onSelectBlock={vi.fn()}
        onCopyAnalyzeResult={vi.fn()}
        onClearAnalyzeCache={vi.fn()}
        onCopySuggestedCommand={vi.fn()}
        onLoadSuggestedCommandToAiBar={vi.fn()}
        onApplySuggestedCommand={vi.fn()}
        onRerunBlock={vi.fn()}
        onCommandMenuRowBlurCapture={vi.fn()}
        onSuggestedCommandRowKeyDown={vi.fn()}
        onCompactMenuKeyDown={vi.fn()}
        onOpenCompactMenu={vi.fn()}
        onCloseCommandMenu={vi.fn()}
        onQuickActionsToggle={vi.fn()}
        onQuickActionsToggleKeyDown={vi.fn()}
        onQuickActionsAdvancedKeyDown={vi.fn()}
        onToggleProjectBin={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenDiffReview={vi.fn()}
        onOpenFailedBlock={vi.fn()}
        scriptLibrary={{
          scripts: [],
          loading: false,
          onLoad: vi.fn(),
          onRun: vi.fn(),
          onDelete: vi.fn(),
          onSave: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("Inspector")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("/Users/dev")).toBeInTheDocument();
    expect(screen.queryByText("FAILED Block")).not.toBeInTheDocument();
    expect(screen.getByText("실패 블록이 없습니다.")).toBeInTheDocument();
  });

  it("Inspector 닫기 버튼이 onClose를 호출한다", () => {
    const onClose = vi.fn();
    render(
      <InspectorPanel
        showInspector
        selectedModel="qwen2.5"
        inspectorTab="summary"
        inspectorDensity={"cozy" as InspectorDensity}
        inspectorTabs={baseTabItems}
        inspectorTabRefs={noopRefs.inspectorTabRefs}
        activeTabTitle="main"
        activeTabPath="/Users/dev"
        noActivity={true}
        failedBlocks={[]}
        focusedFailedBlock={null}
        analyzeCache={null}
        recentBlocks={[]}
        commandMenuIndex={null}
        quickActionsExpanded={false}
        inspectorMoreButtonRefs={noopRefs.inspectorMoreButtonRefs}
        inspectorMenuFirstActionRefs={noopRefs.inspectorMenuFirstActionRefs}
        inspectorQuickActionsToggleRef={noopRefs.inspectorQuickActionsToggleRef}
        inspectorQuickActionsAdvancedRef={noopRefs.inspectorQuickActionsAdvancedRef}
        onDensityToggle={vi.fn()}
        onClose={onClose}
        onTabSelect={vi.fn()}
        onTabKeyDown={vi.fn()}
        onFocusFailedBlock={vi.fn()}
        onAnalyzeFailedBlock={vi.fn()}
        onCopyFailedOutput={vi.fn()}
        onCopyAnalyzePrompt={vi.fn()}
        onLoadAnalyzePromptToAiBar={vi.fn()}
        onSelectBlock={vi.fn()}
        onCopyAnalyzeResult={vi.fn()}
        onClearAnalyzeCache={vi.fn()}
        onCopySuggestedCommand={vi.fn()}
        onLoadSuggestedCommandToAiBar={vi.fn()}
        onApplySuggestedCommand={vi.fn()}
        onRerunBlock={vi.fn()}
        onCommandMenuRowBlurCapture={vi.fn()}
        onSuggestedCommandRowKeyDown={vi.fn()}
        onCompactMenuKeyDown={vi.fn()}
        onOpenCompactMenu={vi.fn()}
        onCloseCommandMenu={vi.fn()}
        onQuickActionsToggle={vi.fn()}
        onQuickActionsToggleKeyDown={vi.fn()}
        onQuickActionsAdvancedKeyDown={vi.fn()}
        onToggleProjectBin={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenDiffReview={vi.fn()}
        onOpenFailedBlock={vi.fn()}
        scriptLibrary={{
          scripts: [],
          loading: false,
          onLoad: vi.fn(),
          onRun: vi.fn(),
          onDelete: vi.fn(),
          onSave: vi.fn(),
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Inspector 닫기"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("빠른 액션 더보기 토글을 누르면 onQuickActionsToggle가 호출된다", () => {
    const onQuickActionsToggle = vi.fn();
    render(
      <InspectorPanel
        showInspector
        selectedModel="qwen2.5"
        inspectorTab="summary"
        inspectorDensity={"cozy" as InspectorDensity}
        inspectorTabs={baseTabItems}
        inspectorTabRefs={noopRefs.inspectorTabRefs}
        activeTabTitle="main"
        activeTabPath="/Users/dev"
        noActivity={false}
        failedBlocks={baseFailedBlocks}
        focusedFailedBlock={baseFailedBlocks[0]}
        analyzeCache={null}
        recentBlocks={[]}
        commandMenuIndex={null}
        quickActionsExpanded={false}
        inspectorMoreButtonRefs={noopRefs.inspectorMoreButtonRefs}
        inspectorMenuFirstActionRefs={noopRefs.inspectorMenuFirstActionRefs}
        inspectorQuickActionsToggleRef={noopRefs.inspectorQuickActionsToggleRef}
        inspectorQuickActionsAdvancedRef={noopRefs.inspectorQuickActionsAdvancedRef}
        onDensityToggle={vi.fn()}
        onClose={vi.fn()}
        onTabSelect={vi.fn()}
        onTabKeyDown={vi.fn()}
        onFocusFailedBlock={vi.fn()}
        onAnalyzeFailedBlock={vi.fn()}
        onCopyFailedOutput={vi.fn()}
        onCopyAnalyzePrompt={vi.fn()}
        onLoadAnalyzePromptToAiBar={vi.fn()}
        onSelectBlock={vi.fn()}
        onCopyAnalyzeResult={vi.fn()}
        onClearAnalyzeCache={vi.fn()}
        onCopySuggestedCommand={vi.fn()}
        onLoadSuggestedCommandToAiBar={vi.fn()}
        onApplySuggestedCommand={vi.fn()}
        onRerunBlock={vi.fn()}
        onCommandMenuRowBlurCapture={vi.fn()}
        onSuggestedCommandRowKeyDown={vi.fn()}
        onCompactMenuKeyDown={vi.fn()}
        onOpenCompactMenu={vi.fn()}
        onCloseCommandMenu={vi.fn()}
        onQuickActionsToggle={onQuickActionsToggle}
        onQuickActionsToggleKeyDown={vi.fn()}
        onQuickActionsAdvancedKeyDown={vi.fn()}
        onToggleProjectBin={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenDiffReview={vi.fn()}
        onOpenFailedBlock={vi.fn()}
        scriptLibrary={{
          scripts: [],
          loading: false,
          onLoad: vi.fn(),
          onRun: vi.fn(),
          onDelete: vi.fn(),
          onSave: vi.fn(),
        }}
      />,
    );
    fireEvent.click(screen.getByText("더보기"));
    expect(onQuickActionsToggle).toHaveBeenCalledTimes(1);
  });

  it("탭 전환 버튼 클릭 시 onTabSelect가 호출된다", () => {
    const onTabSelect = vi.fn();
    render(
      <InspectorPanel
        showInspector
        selectedModel="qwen2.5"
        inspectorTab="summary"
        inspectorDensity={"cozy" as InspectorDensity}
        inspectorTabs={baseTabItems}
        inspectorTabRefs={noopRefs.inspectorTabRefs}
        activeTabTitle="main"
        activeTabPath="/Users/dev"
        noActivity={false}
        failedBlocks={baseFailedBlocks}
        focusedFailedBlock={baseFailedBlocks[0]}
        analyzeCache={null}
        recentBlocks={[]}
        commandMenuIndex={null}
        quickActionsExpanded={false}
        inspectorMoreButtonRefs={noopRefs.inspectorMoreButtonRefs}
        inspectorMenuFirstActionRefs={noopRefs.inspectorMenuFirstActionRefs}
        inspectorQuickActionsToggleRef={noopRefs.inspectorQuickActionsToggleRef}
        inspectorQuickActionsAdvancedRef={noopRefs.inspectorQuickActionsAdvancedRef}
        onDensityToggle={vi.fn()}
        onClose={vi.fn()}
        onTabSelect={onTabSelect}
        onTabKeyDown={vi.fn()}
        onFocusFailedBlock={vi.fn()}
        onAnalyzeFailedBlock={vi.fn()}
        onCopyFailedOutput={vi.fn()}
        onCopyAnalyzePrompt={vi.fn()}
        onLoadAnalyzePromptToAiBar={vi.fn()}
        onSelectBlock={vi.fn()}
        onCopyAnalyzeResult={vi.fn()}
        onClearAnalyzeCache={vi.fn()}
        onCopySuggestedCommand={vi.fn()}
        onLoadSuggestedCommandToAiBar={vi.fn()}
        onApplySuggestedCommand={vi.fn()}
        onRerunBlock={vi.fn()}
        onCommandMenuRowBlurCapture={vi.fn()}
        onSuggestedCommandRowKeyDown={vi.fn()}
        onCompactMenuKeyDown={vi.fn()}
        onOpenCompactMenu={vi.fn()}
        onCloseCommandMenu={vi.fn()}
        onQuickActionsToggle={vi.fn()}
        onQuickActionsToggleKeyDown={vi.fn()}
        onQuickActionsAdvancedKeyDown={vi.fn()}
        onToggleProjectBin={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenDiffReview={vi.fn()}
        onOpenFailedBlock={vi.fn()}
        scriptLibrary={{
          scripts: [],
          loading: false,
          onLoad: vi.fn(),
          onRun: vi.fn(),
          onDelete: vi.fn(),
          onSave: vi.fn(),
        }}
      />,
    );
    fireEvent.click(screen.getByText("RAG"));
    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("요약 탭 실패 분석 버튼이 onAnalyzeFailedBlock를 호출한다", () => {
    const onAnalyzeFailedBlock = vi.fn();
    render(
      <InspectorPanel
        showInspector
        selectedModel="qwen2.5"
        inspectorTab="summary"
        inspectorDensity={"cozy" as InspectorDensity}
        inspectorTabs={baseTabItems}
        inspectorTabRefs={noopRefs.inspectorTabRefs}
        activeTabTitle="main"
        activeTabPath="/Users/dev"
        noActivity={false}
        failedBlocks={baseFailedBlocks}
        focusedFailedBlock={baseFailedBlocks[0]}
        analyzeCache={null}
        recentBlocks={[]}
        commandMenuIndex={null}
        quickActionsExpanded={false}
        inspectorMoreButtonRefs={noopRefs.inspectorMoreButtonRefs}
        inspectorMenuFirstActionRefs={noopRefs.inspectorMenuFirstActionRefs}
        inspectorQuickActionsToggleRef={noopRefs.inspectorQuickActionsToggleRef}
        inspectorQuickActionsAdvancedRef={noopRefs.inspectorQuickActionsAdvancedRef}
        onDensityToggle={vi.fn()}
        onClose={vi.fn()}
        onTabSelect={vi.fn()}
        onTabKeyDown={vi.fn()}
        onFocusFailedBlock={vi.fn()}
        onAnalyzeFailedBlock={onAnalyzeFailedBlock}
        onCopyFailedOutput={vi.fn()}
        onCopyAnalyzePrompt={vi.fn()}
        onLoadAnalyzePromptToAiBar={vi.fn()}
        onSelectBlock={vi.fn()}
        onCopyAnalyzeResult={vi.fn()}
        onClearAnalyzeCache={vi.fn()}
        onCopySuggestedCommand={vi.fn()}
        onLoadSuggestedCommandToAiBar={vi.fn()}
        onApplySuggestedCommand={vi.fn()}
        onRerunBlock={vi.fn()}
        onCommandMenuRowBlurCapture={vi.fn()}
        onSuggestedCommandRowKeyDown={vi.fn()}
        onCompactMenuKeyDown={vi.fn()}
        onOpenCompactMenu={vi.fn()}
        onCloseCommandMenu={vi.fn()}
        onQuickActionsToggle={vi.fn()}
        onQuickActionsToggleKeyDown={vi.fn()}
        onQuickActionsAdvancedKeyDown={vi.fn()}
        onToggleProjectBin={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onOpenHistory={vi.fn()}
        onOpenDiffReview={vi.fn()}
        onOpenFailedBlock={vi.fn()}
        scriptLibrary={{
          scripts: [],
          loading: false,
          onLoad: vi.fn(),
          onRun: vi.fn(),
          onDelete: vi.fn(),
          onSave: vi.fn(),
        }}
      />,
    );
    fireEvent.click(screen.getByText("AI ANALYZE"));
    expect(onAnalyzeFailedBlock).toHaveBeenCalledWith("fail-1");
  });
});
