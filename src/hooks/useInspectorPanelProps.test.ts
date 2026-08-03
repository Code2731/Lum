import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InspectorPanelProps, InspectorAnalyzeCache, InspectorTab, InspectorTabItem } from "../components/InspectorPanel/types";
import { getInspectorPanelPropsMeta, useInspectorPanelProps } from "./useInspectorPanelProps";

const INSPECTOR_TABS: readonly InspectorTabItem[] = [
  { id: "summary", label: "개요", shortcut: "1" },
  { id: "rag", label: "RAG", shortcut: "2" },
  { id: "scripts", label: "Scripts", shortcut: "3" },
  { id: "sysmon", label: "System", shortcut: "4" },
];

function makeRef<T>(value: T): { current: T } {
  return { current: value };
}

function createScriptLibrary(): InspectorPanelProps["scriptLibrary"] {
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
  it("인스펙터 상위 props 상태를 메타로 요약한다", () => {
    const props = createProps({
      showInspector: true,
      activeTabTitle: "Shell 1",
      inspectorTab: "summary",
      quickActionsExpanded: true,
      failedBlocks: [
        {
          id: "fail-1",
          command: "npm test",
          exitCode: 1,
          outputTail: "error",
        },
      ],
    });

    expect(getInspectorPanelPropsMeta(props)).toEqual({
      title: "Shell 1 인스펙터",
      badges: ["탭 summary", "실패 1개", "빠른 액션 펼침"],
      helper: "현재 탭의 실패 블록, 최근 실행, 빠른 액션, 분석 흐름을 하나의 인스펙터 패널로 묶어 보여줍니다.",
    });
  });

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

  it("quickActionsExpanded 변경은 데이터 props만 갱신하고 액션 핸들러 레퍼런스는 유지한다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      quickActionsExpanded: false,
    });

    const { result, rerender } = renderHook((quickActionsExpanded: boolean) => {
      return useInspectorPanelProps({
        ...base,
        quickActionsExpanded,
      });
    }, {
      initialProps: false,
    });

    const before = result.current;
    expect(before.quickActionsExpanded).toBe(false);

    rerender(true);

    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.onQuickActionsToggle).toBe(handlers.onQuickActionsToggle);
    expect(result.current.onQuickActionsToggleKeyDown).toBe(handlers.onQuickActionsToggleKeyDown);
    expect(result.current.onQuickActionsAdvancedKeyDown).toBe(handlers.onQuickActionsAdvancedKeyDown);
  });

  it("scriptLibrary 참조 변경 시 최신 scriptLibrary만 갱신된다", () => {
    const handlers = createHandlers();
    const libraryA = createScriptLibrary();
    const libraryB = createScriptLibrary();
    libraryB.loading = true;
    libraryB.scripts = [
      {
        id: "script-2",
        name: "배포",
        description: "배포 스크립트",
        commands: ["npm run deploy"],
        created_at: 2,
      },
    ];

    const base = createProps({
      ...handlers,
      scriptLibrary: libraryA,
    });

    const { result, rerender } = renderHook((scriptLibrary: InspectorPanelProps["scriptLibrary"]) => {
      return useInspectorPanelProps({
        ...base,
        scriptLibrary,
      });
    }, {
      initialProps: libraryA,
    });

    expect(result.current.scriptLibrary).toBe(libraryA);
    expect(result.current.onOpenWorkspace).toBe(handlers.onOpenWorkspace);

    rerender(libraryB);

    expect(result.current.scriptLibrary).toBe(libraryB);
    expect(result.current.scriptLibrary.loading).toBe(true);
    expect(result.current.scriptLibrary.scripts).toHaveLength(1);
    expect(result.current.onOpenWorkspace).toBe(handlers.onOpenWorkspace);
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
      ([inspectorDensity, inspectorTab]: [InspectorPanelProps["inspectorDensity"], InspectorTab]) => useInspectorPanelProps({
        ...base,
        inspectorDensity,
        inspectorTab,
      }),
      {
        initialProps: ["cozy", "summary"] as [InspectorPanelProps["inspectorDensity"], InspectorTab],
      },
    );

    expect(result.current.commandMenuIndex).toBe(2);
    expect(result.current.inspectorDensity).toBe("cozy");
    expect(result.current.inspectorTab).toBe("summary");
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);

    rerender(["compact", "rag"] as [InspectorPanelProps["inspectorDensity"], InspectorTab]);

    expect(result.current.commandMenuIndex).toBe(2);
    expect(result.current.inspectorDensity).toBe("compact");
    expect(result.current.inspectorTab).toBe("rag");
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
  });

  it("quickActionsExpanded 동시 변경 시 메뉴 핸들러 레퍼런스가 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      commandMenuIndex: 1,
      quickActionsExpanded: false,
    });

    const { result, rerender } = renderHook(
      ([quickActionsExpanded, commandMenuIndex]: [boolean, number | null]) => useInspectorPanelProps({
        ...base,
        quickActionsExpanded,
        commandMenuIndex,
      }),
      {
        initialProps: [false, 1] as [boolean, number | null],
      },
    );

    expect(result.current.quickActionsExpanded).toBe(false);
    expect(result.current.commandMenuIndex).toBe(1);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender([true, null] as [boolean, number | null]);

    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.commandMenuIndex).toBeNull();
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("quickActionsExpanded, inspectorDensity, inspectorTab 동시 변경에서도 핸들러 레퍼런스가 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      commandMenuIndex: 3,
      quickActionsExpanded: false,
      inspectorDensity: "cozy",
      inspectorTab: "summary",
    });

    const { result, rerender } = renderHook(
      ([quickActionsExpanded, inspectorDensity, inspectorTab]: [boolean, InspectorPanelProps["inspectorDensity"], InspectorTab]) => useInspectorPanelProps({
        ...base,
        quickActionsExpanded,
        inspectorDensity,
        inspectorTab,
      }),
      {
        initialProps: [false, "cozy", "summary"] as [boolean, InspectorPanelProps["inspectorDensity"], InspectorTab],
      },
    );

    expect(result.current.quickActionsExpanded).toBe(false);
    expect(result.current.inspectorDensity).toBe("cozy");
    expect(result.current.inspectorTab).toBe("summary");
    expect(result.current.commandMenuIndex).toBe(3);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender([true, "compact", "rag"] as [boolean, InspectorPanelProps["inspectorDensity"], InspectorTab]);

    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.inspectorDensity).toBe("compact");
    expect(result.current.inspectorTab).toBe("rag");
    expect(result.current.commandMenuIndex).toBe(3);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("noActivity 변경 시에도 메뉴 핸들러 레퍼런스는 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      commandMenuIndex: 0,
      noActivity: true,
    });

    const { result, rerender } = renderHook((noActivity: boolean) => useInspectorPanelProps({
      ...base,
      noActivity,
    }), {
      initialProps: true,
    });

    expect(result.current.noActivity).toBe(true);
    expect(result.current.commandMenuIndex).toBe(0);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender(false);

    expect(result.current.noActivity).toBe(false);
    expect(result.current.commandMenuIndex).toBe(0);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("noActivity와 quickActionsExpanded 동시 변경 시 핸들러 레퍼런스가 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      noActivity: true,
      commandMenuIndex: 4,
      quickActionsExpanded: false,
    });

    const { result, rerender } = renderHook(
      ([noActivity, quickActionsExpanded]: [boolean, boolean]) => useInspectorPanelProps({
        ...base,
        noActivity,
        quickActionsExpanded,
      }),
      {
        initialProps: [true, false] as [boolean, boolean],
      },
    );

    expect(result.current.noActivity).toBe(true);
    expect(result.current.quickActionsExpanded).toBe(false);
    expect(result.current.commandMenuIndex).toBe(4);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender([false, true] as [boolean, boolean]);

    expect(result.current.noActivity).toBe(false);
    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.commandMenuIndex).toBe(4);
    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("noActivity+quickActions 조합 전환 후에도 onCompactMenuKeyDown 호출이 유지된다", () => {
    const handlers = createHandlers();
    const base = createProps({
      ...handlers,
      noActivity: true,
      quickActionsExpanded: false,
      commandMenuIndex: 0,
    });
    const event = { key: "ArrowDown", preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;

    const { result, rerender } = renderHook(
      ([noActivity, quickActionsExpanded]: [boolean, boolean]) => useInspectorPanelProps({
        ...base,
        noActivity,
        quickActionsExpanded,
      }),
      {
        initialProps: [true, false] as [boolean, boolean],
      },
    );

    expect(result.current.noActivity).toBe(true);
    expect(result.current.quickActionsExpanded).toBe(false);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    result.current.onCompactMenuKeyDown(event, 0);

    rerender([false, true] as [boolean, boolean]);

    expect(result.current.noActivity).toBe(false);
    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(handlers.onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
    expect(handlers.onCompactMenuKeyDown).toHaveBeenCalledWith(event, 0);

    result.current.onCompactMenuKeyDown(event, 1);

    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(handlers.onCompactMenuKeyDown).toHaveBeenCalledTimes(2);
    expect(handlers.onCompactMenuKeyDown).toHaveBeenNthCalledWith(2, event, 1);
  });
});
