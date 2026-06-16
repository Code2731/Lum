import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InspectorPanelProps, InspectorAnalyzeCache, InspectorTabItem } from "../components/InspectorPanel/types";
import { useInspectorPanelProps } from "./useInspectorPanelProps";

const INSPECTOR_TABS: readonly InspectorTabItem[] = [
  { id: "summary", label: "개요", shortcut: "1" },
  { id: "rag", label: "RAG", shortcut: "2" },
  { id: "scripts", label: "Scripts", shortcut: "3" },
  { id: "sysmon", label: "System", shortcut: "4" },
];

function makeRef<T>(value: T): { current: T } {
  return { current: value };
}

function createScriptLibrary() {
  return {
    scripts: [],
    loading: false,
    onLoad: vi.fn(),
    onRun: vi.fn(),
    onDelete: vi.fn(),
    onSave: vi.fn(async () => ({
      id: "s1",
      name: "기본 스크립트",
      description: "기본 스크립트",
      commands: ["echo hi"],
      created_at: 1,
    })),
  };
}

function createHandlers() {
  return {
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
  };
}

function createAnalyzeCache(): InspectorAnalyzeCache {
  return {
    blockId: "block-1",
    command: "echo hi",
    requestedAt: 123,
    status: "done",
    result: "ok",
    rawResult: "ok",
    suggestedCommands: ["echo ok"],
  };
}

function createProps(overrides: Partial<InspectorPanelProps> = {}): InspectorPanelProps {
  const handlers = createHandlers();
  const props: InspectorPanelProps = {
    showInspector: true,
    selectedModel: "test-model",
    inspectorTab: "summary",
    inspectorDensity: "cozy",
    inspectorTabs: INSPECTOR_TABS,
    inspectorTabRefs: makeRef({
      summary: null,
      rag: null,
      scripts: null,
      sysmon: null,
    }),
    activeTabTitle: "Shell 1",
    activeTabPath: "/repo",
    activeTabBranch: "main",
    activeTabChanged: 1,
    noActivity: false,
    failedBlocks: [],
    focusedFailedBlock: null,
    analyzeCache: null,
    recentBlocks: [],
    commandMenuIndex: 0,
    quickActionsExpanded: false,
    inspectorMoreButtonRefs: makeRef({}),
    inspectorMenuFirstActionRefs: makeRef({}),
    inspectorQuickActionsToggleRef: makeRef(null),
    inspectorQuickActionsAdvancedRef: makeRef(null),
    scriptLibrary: createScriptLibrary(),
    ...handlers,
    ...overrides,
  };

  return { ...props, ...overrides };
}

describe("useInspectorPanelProps", () => {
  it("Data/Action 속성 이름을 정확히 InspectorPanelProps 형태로 조립한다", () => {
    const analyzeCache = createAnalyzeCache();
    const handlerOverrides = createHandlers();
    const base = createProps({
      noActivity: true,
      analyzeCache,
      activeTabBranch: "dev",
      activeTabChanged: 3,
      commandMenuIndex: null,
      quickActionsExpanded: true,
      onTabSelect: handlerOverrides.onTabSelect,
      onAnalyzeFailedBlock: handlerOverrides.onAnalyzeFailedBlock,
    });

    const { result } = renderHook(() => useInspectorPanelProps({
      ...base,
      noActivity: true,
      analyzeCache,
      onTabSelect: handlerOverrides.onTabSelect,
      onAnalyzeFailedBlock: handlerOverrides.onAnalyzeFailedBlock,
    }));

    expect(result.current.activeTabTitle).toBe("Shell 1");
    expect(result.current.activeTabPath).toBe("/repo");
    expect(result.current.activeTabBranch).toBe("dev");
    expect(result.current.activeTabChanged).toBe(3);
    expect(result.current.analyzeCache).toBe(analyzeCache);
    expect(result.current.commandMenuIndex).toBe(null);
    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.noActivity).toBe(true);
    expect(result.current.onTabSelect).toBe(handlerOverrides.onTabSelect);
    expect(result.current.onAnalyzeFailedBlock).toBe(handlerOverrides.onAnalyzeFailedBlock);
  });

  it("동일한 입력이면 반환 객체 참조를 유지하고, 변경된 값만 갱신한다", () => {
    const handlers = createHandlers();
    const base = createProps(handlers);

    const { result, rerender } = renderHook((props: InspectorPanelProps) => useInspectorPanelProps(props), {
      initialProps: base,
    });

    const afterBase = result.current;

    rerender({
      ...base,
      inspectorTab: "rag",
    });

    const afterTabChanged = result.current;
    expect(afterTabChanged).not.toBe(afterBase);
    expect(afterTabChanged.inspectorTab).toBe("rag");

    rerender({
      ...base,
      inspectorTab: "rag",
    });

    expect(result.current).toBe(afterTabChanged);
    expect(result.current.inspectorTab).toBe("rag");
  });

  it("동일한 핸들러 입력이면 액션 핸들러 레퍼런스를 유지한다", () => {
    const handlers = createHandlers();
    const base = createProps(handlers);

    const { result, rerender } = renderHook((activeTabChanged: number) => {
      return useInspectorPanelProps({
        ...base,
        activeTabChanged,
      });
    }, {
      initialProps: 1,
    });

    const afterBase = result.current;
    expect(afterBase.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(afterBase.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(afterBase.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(afterBase.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender(2);

    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
    expect(result.current.activeTabChanged).toBe(2);
  });

  it("inspectorDensity 변경 시 메뉴 인덱스 및 핸들러 전달이 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      commandMenuIndex: 2,
      inspectorDensity: "cozy",
    });

    const { result, rerender } = renderHook((inspectorDensity: InspectorPanelProps["inspectorDensity"]) => {
      return useInspectorPanelProps({
        ...base,
        inspectorDensity,
      });
    }, {
      initialProps: "cozy",
    });

    expect(result.current.commandMenuIndex).toBe(2);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);

    rerender("compact");

    expect(result.current.commandMenuIndex).toBe(2);
    expect(result.current.inspectorDensity).toBe("compact");
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
  });

  it("commandMenuIndex 전환 시에도 메뉴 관련 핸들러 레퍼런스가 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      commandMenuIndex: 1,
    });

    const { result, rerender } = renderHook((commandMenuIndex: number | null) => {
      return useInspectorPanelProps({
        ...base,
        commandMenuIndex,
      });
    }, {
      initialProps: 1 as number | null,
    });

    expect(result.current.commandMenuIndex).toBe(1);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender(null);

    expect(result.current.commandMenuIndex).toBeNull();
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender(3);

    expect(result.current.commandMenuIndex).toBe(3);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("inspectorDensity와 inspectorTab 동시 변경에서도 메뉴 핸들러 레퍼런스가 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      commandMenuIndex: 2,
      inspectorDensity: "cozy",
      inspectorTab: "summary",
    });

    const { result, rerender } = renderHook(
      ([inspectorDensity, inspectorTab]) => useInspectorPanelProps({
        ...base,
        inspectorDensity,
        inspectorTab,
      }),
      {
        initialProps: ["cozy", "summary"] as const,
      },
    );

    expect(result.current.commandMenuIndex).toBe(2);
    expect(result.current.inspectorDensity).toBe("cozy");
    expect(result.current.inspectorTab).toBe("summary");
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);

    rerender(["compact", "rag"]);

    expect(result.current.commandMenuIndex).toBe(2);
    expect(result.current.inspectorDensity).toBe("compact");
    expect(result.current.inspectorTab).toBe("rag");
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
  });
});
