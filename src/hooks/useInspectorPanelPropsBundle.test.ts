import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInspectorPanelPropsBundle } from "./useInspectorPanelPropsBundle";
import type { InspectorPanelActionHandlerProps } from "./useInspectorPanelPropsBundle";
import type { CommandBlock } from "./useCommandBlocks";
import type { InspectorTabItem } from "../components/InspectorPanel/types";

const INSPECTOR_TABS: readonly InspectorTabItem[] = [
  { id: "summary", label: "개요", shortcut: "1" },
  { id: "rag", label: "RAG", shortcut: "2" },
  { id: "scripts", label: "Scripts", shortcut: "3" },
  { id: "sysmon", label: "System", shortcut: "4" },
];

function makeRef<T>(value: T): { current: T } {
  return { current: value };
}

function makeCommandBlock(overrides: Partial<CommandBlock> & { id: string; command: string; output: string }): CommandBlock {
  return {
    id: overrides.id,
    command: overrides.command,
    output: overrides.output,
    exitCode: overrides.exitCode ?? 1,
    startedAt: overrides.startedAt ?? 1_000,
    endedAt: overrides.endedAt ?? 1_050,
    ...overrides,
  };
}

function createScriptLibrary() {
  return {
    scripts: [],
    loading: false,
    onLoad: vi.fn(async () => undefined),
    onRun: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    onSave: vi.fn(async () => ({
      id: "script-1",
      name: "테스트",
      description: "테스트",
      commands: [],
      created_at: 1,
    })),
  };
}

function createHandlers(): InspectorPanelActionHandlerProps {
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

describe("useInspectorPanelPropsBundle", () => {
  it("useInspectorPanelData와 handlers를 정확히 결합해 InspectorPanelProps를 반환한다", () => {
    const handlers = createHandlers();
    const resultData = {
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "main", changed: 2 },
      cmdBlocks: [
        makeCommandBlock({ id: "ok", command: "echo hi", output: "ok", exitCode: 0 }),
        makeCommandBlock({ id: "bad", command: "bad cmd", output: "ERR", exitCode: 2 }),
      ],
      selectedBlockId: "bad",
      inspectorAnalyzeCache: {
        blockId: "stream",
        command: "stream cmd",
        requestedAt: 10,
        status: "done",
        result: "ok",
        rawResult: "ok",
        suggestedCommands: ["echo done"],
      },
      commandMenuIndex: 3,
      showInspectorQuickActionsExpanded: true,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    };

    const { result } = renderHook(() => useInspectorPanelPropsBundle(resultData));

    expect(result.current.showInspector).toBe(true);
    expect(result.current.selectedModel).toBe("test-model");
    expect(result.current.activeTabTitle).toBe("Shell 1");
    expect(result.current.activeTabBranch).toBe("main");
    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.commandMenuIndex).toBe(3);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.onOpenDiffReview).toBe(handlers.onOpenDiffReview);
    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "bad",
      exitCode: 2,
    });
  });

  it("activeTab / activeTabGitInfo 변경 시 activeTab 파생값이 갱신된다", () => {
    const handlers = createHandlers();
    const commonProps = {
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo-a" },
      activeTabGitInfo: { branch: "main", changed: 2 },
      cmdBlocks: [
        makeCommandBlock({ id: "a", command: "fail", output: "err", exitCode: 1 }),
      ],
      selectedBlockId: "a",
      inspectorAnalyzeCache: null,
      commandMenuIndex: 0,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    };

    const { result, rerender } = renderHook(
      (props: typeof commonProps) => useInspectorPanelPropsBundle(props),
      {
        initialProps: commonProps,
      },
    );

    expect(result.current.activeTabTitle).toBe("Shell 1");
    expect(result.current.activeTabPath).toBe("/repo-a");
    expect(result.current.activeTabBranch).toBe("main");
    expect(result.current.activeTabChanged).toBe(2);

    rerender({
      ...commonProps,
      activeTab: { title: "Shell 2", cwd: "/repo-b" },
      activeTabGitInfo: { branch: "feature/ui", changed: 7 },
    });

    expect(result.current.activeTabTitle).toBe("Shell 2");
    expect(result.current.activeTabPath).toBe("/repo-b");
    expect(result.current.activeTabBranch).toBe("feature/ui");
    expect(result.current.activeTabChanged).toBe(7);

    rerender({
      ...commonProps,
      activeTab: null,
      activeTabGitInfo: null,
    });

    expect(result.current.activeTabTitle).toBe("탭 없음");
    expect(result.current.activeTabPath).toBe("cwd 없음");
    expect(result.current.activeTabBranch).toBeUndefined();
    expect(result.current.activeTabChanged).toBeUndefined();
  });

  it("activeTab의 제목/경로가 비어있으면 fallback 값이 적용된다", () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook(
      (activeTab: { title: string; cwd: string } | null) => useInspectorPanelPropsBundle({
        showInspector: true,
        selectedModel: "test-model",
        inspectorTab: "summary" as const,
        inspectorDensity: "cozy" as const,
        inspectorTabs: INSPECTOR_TABS,
        inspectorTabRefs: makeRef({
          summary: null,
          rag: null,
          scripts: null,
          sysmon: null,
        }),
        activeTab,
        activeTabGitInfo: null,
        cmdBlocks: [makeCommandBlock({ id: "a", command: "ok", output: "out", exitCode: 0 })],
        selectedBlockId: "a",
        inspectorAnalyzeCache: null,
        commandMenuIndex: null,
        showInspectorQuickActionsExpanded: false,
        inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
        inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
        scriptLibrary: createScriptLibrary(),
        handlers,
      }),
      {
        initialProps: { title: "   ", cwd: "   " } as const,
      },
    );

    expect(result.current.activeTabTitle).toBe("탭 없음");
    expect(result.current.activeTabPath).toBe("cwd 없음");

    rerender({ title: "  shell-a  ", cwd: "  /repo  " });

    expect(result.current.activeTabTitle).toBe("shell-a");
    expect(result.current.activeTabPath).toBe("/repo");
  });

  it("activeTabGitInfo가 비어있거나 공백이면 branch가 undefined로 정규화된다", () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook(
      (activeTabGitInfo: { branch?: string; changed?: number } | null) => useInspectorPanelPropsBundle({
        showInspector: true,
        selectedModel: "test-model",
        inspectorTab: "summary" as const,
        inspectorDensity: "cozy" as const,
        inspectorTabs: INSPECTOR_TABS,
        inspectorTabRefs: makeRef({
          summary: null,
          rag: null,
          scripts: null,
          sysmon: null,
        }),
        activeTab: { title: "Shell 1", cwd: "/repo" },
        activeTabGitInfo,
        cmdBlocks: [makeCommandBlock({ id: "a", command: "ok", output: "out", exitCode: 0 })],
        selectedBlockId: "a",
        inspectorAnalyzeCache: null,
        commandMenuIndex: null,
        showInspectorQuickActionsExpanded: false,
        inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
        inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
        scriptLibrary: createScriptLibrary(),
        handlers,
      }),
      {
        initialProps: { branch: "   ", changed: 3 } as const,
      },
    );

    expect(result.current.activeTabBranch).toBeUndefined();
    expect(result.current.activeTabChanged).toBe(3);

    rerender({ branch: "  feature/main  ", changed: 4 });
    expect(result.current.activeTabBranch).toBe("feature/main");
    expect(result.current.activeTabChanged).toBe(4);
  });

  it("activeTabChanged는 음수나 실수 입력을 정규화해서 비정상값을 제거한다", () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook(
      (activeTabGitInfo: { branch?: string; changed?: number } | null) => useInspectorPanelPropsBundle({
        showInspector: true,
        selectedModel: "test-model",
        inspectorTab: "summary" as const,
        inspectorDensity: "cozy" as const,
        inspectorTabs: INSPECTOR_TABS,
        inspectorTabRefs: makeRef({
          summary: null,
          rag: null,
          scripts: null,
          sysmon: null,
        }),
        activeTab: { title: "Shell 1", cwd: "/repo" },
        activeTabGitInfo,
        cmdBlocks: [makeCommandBlock({ id: "a", command: "ok", output: "out", exitCode: 0 })],
        selectedBlockId: "a",
        inspectorAnalyzeCache: null,
        commandMenuIndex: null,
        showInspectorQuickActionsExpanded: false,
        inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
        inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
        scriptLibrary: createScriptLibrary(),
        handlers,
      }),
      {
        initialProps: { branch: "main", changed: -1 } as const,
      },
    );

    expect(result.current.activeTabChanged).toBeUndefined();

    rerender({ branch: "main", changed: 2.7 });
    expect(result.current.activeTabChanged).toBe(2);

    rerender({ branch: "main", changed: Number.NaN });
    expect(result.current.activeTabChanged).toBeUndefined();

    rerender({ branch: "main", changed: Number.MAX_SAFE_INTEGER });
    expect(result.current.activeTabChanged).toBe(Number.MAX_SAFE_INTEGER);

    rerender({ branch: "main", changed: Number.MAX_SAFE_INTEGER + 1 });
    expect(result.current.activeTabChanged).toBeUndefined();
  });

  it("inspectorFailedBlocks는 공백 명령을 제외하고 실패 블록만 정렬·trim해서 노출한다", () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useInspectorPanelPropsBundle({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [
        makeCommandBlock({ id: "whitespace", command: "   ", output: "should-ignore", exitCode: 1 }),
        makeCommandBlock({ id: "success", command: "ok", output: "success", exitCode: 0 }),
        makeCommandBlock({ id: "failed", command: "  bad cmd  ", output: " line1\nline2", exitCode: 2 }),
      ],
      selectedBlockId: null,
      inspectorAnalyzeCache: null,
      commandMenuIndex: 0,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    }));

    expect(result.current.failedBlocks).toHaveLength(1);
    expect(result.current.failedBlocks[0]).toMatchObject({
      id: "failed",
      command: "bad cmd",
      exitCode: 2,
      outputTail: "line2",
    });
  });

  it("recentBlocks는 공백 명령을 제외하고 duration을 안전하게 계산한다", () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useInspectorPanelPropsBundle({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [
        { id: "first", command: "first", output: "ok", exitCode: 0, startedAt: 1_000, endedAt: 1_050 },
        { id: "second", command: "  ", output: "ignore", exitCode: 1, startedAt: 1_050, endedAt: 1_100 },
        { id: "third", command: "third", output: "out", exitCode: 1, startedAt: 1_200, endedAt: 1_150 },
        { id: "fourth", command: "fourth", output: "done", exitCode: 0, startedAt: 1_300, endedAt: null },
      ] as const as CommandBlock[],
      selectedBlockId: null,
      inspectorAnalyzeCache: null,
      commandMenuIndex: 0,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    }));

    expect(result.current.recentBlocks).toHaveLength(3);
    expect(result.current.recentBlocks.map((block) => block.id)).toEqual(["fourth", "third", "first"]);
    expect(result.current.recentBlocks[1]).toMatchObject({
      id: "third",
      durationMs: 0,
      command: "third",
      exitCode: 1,
      outputTail: "out",
    });
    expect(result.current.recentBlocks[2]).toMatchObject({
      id: "first",
      durationMs: 50,
      exitCode: 0,
      command: "first",
      outputTail: "ok",
    });
    expect(result.current.recentBlocks[0]).toMatchObject({
      id: "fourth",
      durationMs: null,
      exitCode: 0,
      command: "fourth",
      outputTail: "done",
    });
  });

  it("선택한 블록 ID가 없는 경우 실패 블록은 최신 항목으로 안전하게 폴백한다", () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useInspectorPanelPropsBundle({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [
        makeCommandBlock({ id: "good", command: "first fail", output: "f1", exitCode: 1 }),
        makeCommandBlock({ id: "latest", command: "second fail", output: "f2", exitCode: 1 }),
      ],
      selectedBlockId: "not-exist",
      inspectorAnalyzeCache: null,
      commandMenuIndex: 0,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    }));

    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "latest",
      exitCode: 1,
      outputTail: "f2",
    });
  });

  it("선택한 블록 ID가 실패 블록이 아니면 최신 실패 블록으로 폴백한다", () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useInspectorPanelPropsBundle({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [
        makeCommandBlock({ id: "failed-first", command: "first fail", output: "f1", exitCode: 1 }),
        makeCommandBlock({ id: "success", command: "ok", output: "ok", exitCode: 0 }),
        makeCommandBlock({ id: "failed-latest", command: "latest fail", output: "f2", exitCode: 1 }),
      ],
      selectedBlockId: "success",
      inspectorAnalyzeCache: null,
      commandMenuIndex: 0,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    }));

    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "failed-latest",
      exitCode: 1,
      outputTail: "f2",
    });
  });

  it("noActivity+quickActions 조합 전환 후에도 메뉴 핸들러 레퍼런스가 유지된다", () => {
    const handlers = createHandlers();
    const cmdBlocks: CommandBlock[] = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
      makeCommandBlock({ id: "b", command: "second fail", output: "f2", exitCode: 2 }),
    ];

    const base = {
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks,
      selectedBlockId: "a",
      inspectorAnalyzeCache: {
        blockId: "stream",
        command: "stream cmd",
        requestedAt: 10,
        status: "done",
        result: "ok",
        rawResult: "ok",
        suggestedCommands: [],
      },
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    } as const;

    const { result, rerender } = renderHook(
      ([showInspector, showInspectorQuickActionsExpanded, commandMenuIndex, noActivity]) => useInspectorPanelPropsBundle({
        ...base,
        showInspector,
        showInspectorQuickActionsExpanded,
        commandMenuIndex,
        cmdBlocks: noActivity ? [] : cmdBlocks,
        inspectorAnalyzeCache: noActivity
          ? null
          : {
              blockId: "stream",
              command: "stream cmd",
              requestedAt: 10,
              status: "done",
              result: "ok",
              rawResult: "ok",
              suggestedCommands: [],
            },
      }),
      {
        initialProps: [true, false, 4, true] as const,
      },
    );

    expect(result.current.noActivity).toBe(true);
    expect(result.current.quickActionsExpanded).toBe(false);
    expect(result.current.commandMenuIndex).toBe(4);
    expect(result.current.onQuickActionsToggle).toBe(handlers.onQuickActionsToggle);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);

    rerender([false, true, 5, false]);

    expect(result.current.noActivity).toBe(false);
    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.commandMenuIndex).toBe(5);
    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "a",
      exitCode: 1,
      outputTail: "f1",
    });
    expect(result.current.onQuickActionsToggle).toBe(handlers.onQuickActionsToggle);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
  });

  it("onCompactMenuKeyDown는 커스텀 핸들러가 그대로 호출된다", () => {
    const handlers = createHandlers();
    const event = { key: "ArrowDown", preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
    const { result } = renderHook(() => useInspectorPanelPropsBundle({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [makeCommandBlock({ id: "a", command: "bad cmd", output: "err", exitCode: 2 })],
      selectedBlockId: "a",
      inspectorAnalyzeCache: null,
      commandMenuIndex: 1,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    }));

    result.current.onCompactMenuKeyDown(event, 0);

    expect(handlers.onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
    expect(handlers.onCompactMenuKeyDown).toHaveBeenCalledWith(event, 0);
  });

  it("selectedModel / inspectorDensity / inspectorTab 변경 시 번들 반환값이 갱신된다", () => {
    const handlers = createHandlers();
    const baseProps = {
      showInspector: true,
      selectedModel: "model-a",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [
        makeCommandBlock({ id: "a", command: "cmd", output: "out", exitCode: 0 }),
      ],
      selectedBlockId: "a",
      inspectorAnalyzeCache: null,
      commandMenuIndex: 2,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    };

    const { result, rerender } = renderHook(
      (props: typeof baseProps) => useInspectorPanelPropsBundle(props),
      {
        initialProps: baseProps,
      },
    );

    expect(result.current.selectedModel).toBe("model-a");
    expect(result.current.inspectorDensity).toBe("cozy");
    expect(result.current.inspectorTab).toBe("summary");

    rerender({
      ...baseProps,
      selectedModel: "model-b",
      inspectorDensity: "compact",
      inspectorTab: "rag" as const,
    });

    expect(result.current.selectedModel).toBe("model-b");
    expect(result.current.inspectorDensity).toBe("compact");
    expect(result.current.inspectorTab).toBe("rag");
  });

  it("showInspector / quickActionsExpanded / commandMenuIndex / analyzeCache 변경이 번들에 반영된다", () => {
    const handlers = createHandlers();
    const base = {
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [
        makeCommandBlock({ id: "a", command: "fail", output: "err", exitCode: 1 }),
      ],
      selectedBlockId: "a",
      inspectorAnalyzeCache: {
        blockId: "stream",
        command: "stream cmd",
        requestedAt: 10,
        status: "done",
        result: "ok",
        rawResult: "ok",
        suggestedCommands: ["echo ok"],
      },
      commandMenuIndex: 0,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    };

    const { result, rerender } = renderHook(
      (props: typeof base) => useInspectorPanelPropsBundle(props),
      {
        initialProps: base,
      },
    );

    expect(result.current.showInspector).toBe(true);
    expect(result.current.quickActionsExpanded).toBe(false);
    expect(result.current.commandMenuIndex).toBe(0);
    expect(result.current.noActivity).toBe(false);

    rerender({
      ...base,
      showInspector: false,
      showInspectorQuickActionsExpanded: true,
      commandMenuIndex: 5,
      inspectorAnalyzeCache: null,
    });

    expect(result.current.showInspector).toBe(false);
    expect(result.current.quickActionsExpanded).toBe(true);
    expect(result.current.commandMenuIndex).toBe(5);
    expect(result.current.noActivity).toBe(true);
  });

  it("commandMenuIndex가 null일 때도 noActivity 계산은 캐시 기준으로 일관된다", () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook(
      ([showInspectorQuickActionsExpanded, commandMenuIndex, hasAnalyzeCache]) => useInspectorPanelPropsBundle({
        showInspector: true,
        selectedModel: "test-model",
        inspectorTab: "summary" as const,
        inspectorDensity: "cozy" as const,
        inspectorTabs: INSPECTOR_TABS,
        inspectorTabRefs: makeRef({
          summary: null,
          rag: null,
          scripts: null,
          sysmon: null,
        }),
        activeTab: { title: "Shell 1", cwd: "/repo" },
        activeTabGitInfo: null,
        cmdBlocks: [],
        selectedBlockId: null,
        inspectorAnalyzeCache: hasAnalyzeCache ? {
          blockId: "stream",
          command: "stream cmd",
          requestedAt: 10,
          status: "done",
          result: "ok",
          rawResult: "ok",
          suggestedCommands: [],
        } : null,
        commandMenuIndex,
        showInspectorQuickActionsExpanded,
        inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
        inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
        scriptLibrary: createScriptLibrary(),
        handlers,
      }),
      {
        initialProps: [false, null, true] as const,
      },
    );

    expect(result.current.noActivity).toBe(false);

    rerender([false, null, false]);
    expect(result.current.noActivity).toBe(true);
    expect(result.current.commandMenuIndex).toBeNull();

    rerender([false, 2, false]);
    expect(result.current.noActivity).toBe(true);
    expect(result.current.commandMenuIndex).toBe(2);
  });

  it("inspectorFailedBlocks의 outputTail은 160자 제한을 넘으면 끝이 생략된다", () => {
    const handlers = createHandlers();
    const longOutput = `head\n${"x".repeat(170)}\n`;

    const { result } = renderHook(() => useInspectorPanelPropsBundle({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "cozy" as const,
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({
        summary: null,
        rag: null,
        scripts: null,
        sysmon: null,
      }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: null,
      cmdBlocks: [
        makeCommandBlock({ id: "failed", command: "bad cmd", output: longOutput, exitCode: 1 }),
      ],
      selectedBlockId: null,
      inspectorAnalyzeCache: null,
      commandMenuIndex: 0,
      showInspectorQuickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: createScriptLibrary(),
      handlers,
    }));

    expect(result.current.failedBlocks).toHaveLength(1);
    expect(result.current.failedBlocks[0].outputTail).toBe(`${"x".repeat(160)}...`);
  });

  it("noActivity와 selectedBlockId, 분석 캐시 상태를 오갈 때 실패 블록이 없으면 focus는 null로 유지된다", () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook(
      ([inspectorAnalyzeCache, selectedBlockId]) => useInspectorPanelPropsBundle({
        showInspector: true,
        selectedModel: "test-model",
        inspectorTab: "summary" as const,
        inspectorDensity: "cozy" as const,
        inspectorTabs: INSPECTOR_TABS,
        inspectorTabRefs: makeRef({
          summary: null,
          rag: null,
          scripts: null,
          sysmon: null,
        }),
        activeTab: { title: "Shell 1", cwd: "/repo" },
        activeTabGitInfo: null,
        cmdBlocks: [],
        selectedBlockId,
        inspectorAnalyzeCache,
        commandMenuIndex: 0,
        showInspectorQuickActionsExpanded: false,
        inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
        inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
        scriptLibrary: createScriptLibrary(),
        handlers,
      }),
      {
        initialProps: [
          {
            blockId: "stream",
            command: "stream cmd",
            requestedAt: 10,
            status: "done",
            result: "ok",
            rawResult: "ok",
            suggestedCommands: ["echo ok"],
          } as const,
          "some-block",
        ] as const,
      },
    );

    expect(result.current.noActivity).toBe(false);
    expect(result.current.analyzeCache).toEqual(expect.objectContaining({ status: "done" }));
    expect(result.current.focusedFailedBlock).toBeNull();

    rerender([null, "some-block"]);
    expect(result.current.noActivity).toBe(true);
    expect(result.current.analyzeCache).toBeNull();
    expect(result.current.focusedFailedBlock).toBeNull();
  });
});
