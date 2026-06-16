import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInspectorPanelData } from "./useInspectorPanelData";
import { useInspectorPanelProps } from "./useInspectorPanelProps";
import type { CommandBlock } from "./useCommandBlocks";
import type { InspectorPanelProps, InspectorTabItem } from "../components/InspectorPanel/types";

const INSPECTOR_TABS: readonly InspectorTabItem[] = [
  { id: "summary", label: "요약", shortcut: "1" },
  { id: "rag", label: "RAG", shortcut: "2" },
  { id: "scripts", label: "Scripts", shortcut: "3" },
  { id: "sysmon", label: "System", shortcut: "4" },
];

function makeRef<T>(value: T): { current: T } {
  return { current: value };
}

function makeCommandBlock(overrides: Partial<CommandBlock> & { id: string; command: string; output: string; }): CommandBlock {
  return {
    id: overrides.id,
    command: overrides.command,
    output: overrides.output,
    exitCode: overrides.exitCode ?? null,
    startedAt: overrides.startedAt ?? 1_000,
    endedAt: overrides.endedAt ?? 1_050,
    ...overrides,
  };
}

function createActionHandlers(): Pick<InspectorPanelProps, "onDensityToggle" | "onClose" | "onTabSelect" | "onTabKeyDown" | "onFocusFailedBlock" | "onAnalyzeFailedBlock" | "onCopyFailedOutput" | "onCopyAnalyzePrompt" | "onLoadAnalyzePromptToAiBar" | "onSelectBlock" | "onCopyAnalyzeResult" | "onClearAnalyzeCache" | "onCopySuggestedCommand" | "onLoadSuggestedCommandToAiBar" | "onApplySuggestedCommand" | "onRerunBlock" | "onCommandMenuRowBlurCapture" | "onSuggestedCommandRowKeyDown" | "onCompactMenuKeyDown" | "onOpenCompactMenu" | "onCloseCommandMenu" | "onQuickActionsToggle" | "onQuickActionsToggleKeyDown" | "onQuickActionsAdvancedKeyDown" | "onToggleProjectBin" | "onOpenWorkspace" | "onOpenHistory" | "onOpenDiffReview" | "onOpenFailedBlock"> {
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

describe("Inspector panel data + props pipeline", () => {
  it("useInspectorPanelData 산출값이 useInspectorPanelProps에서 그대로 재사용된다", () => {
    const common = {
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
      activeTabGitInfo: { branch: "feat/inspector", changed: 2 },
      cmdBlocks: [
        makeCommandBlock({ id: "ok", command: "echo done", output: "done", exitCode: 0 }),
        makeCommandBlock({ id: "bad", command: "bad cmd", output: "ERR\nroot cause", exitCode: 2 }),
      ],
      selectedBlockId: "bad" as string | null,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: {
        scripts: [],
        loading: false,
        onLoad: vi.fn(async () => undefined),
        onRun: vi.fn(),
        onDelete: vi.fn(async () => undefined),
        onSave: vi.fn(async () => ({
          id: "script-1",
          name: "test",
          description: "test",
          commands: [],
          created_at: 1,
        })),
      },
    };

    const { result } = renderHook(() => {
      const data = useInspectorPanelData(common);
      return useInspectorPanelProps({
        ...data,
        ...createActionHandlers(),
      });
    });

    expect(result.current.failedBlocks).toHaveLength(1);
    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "bad",
      command: "bad cmd",
      exitCode: 2,
    });
    expect(result.current.analyzeCache).toBeNull();
    expect(result.current.activeTabBranch).toBe("feat/inspector");
  });

  it("선택 블록 변경 시 조립 결과의 focusedFailedBlock만 갱신되고 분석 캐시는 보존된다", () => {
    const cmdBlocks = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
      makeCommandBlock({ id: "b", command: "second fail", output: "f2", exitCode: 2 }),
    ];
    const base = {
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary" as const,
      inspectorDensity: "compact" as const,
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
      selectedBlockId: "a" as string | null,
      inspectorAnalyzeCache: {
        blockId: "stream",
        command: "stream cmd",
        requestedAt: 1,
        status: "done",
        result: "ok",
        rawResult: "ok",
        suggestedCommands: [],
      },
      inspectorCommandMenuIndex: 0,
      quickActionsExpanded: true,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: {
        scripts: [],
        loading: false,
        onLoad: vi.fn(async () => undefined),
        onRun: vi.fn(),
        onDelete: vi.fn(async () => undefined),
        onSave: vi.fn(async () => ({
          id: "script-1",
          name: "test",
          description: "test",
          commands: [],
          created_at: 1,
        })),
      },
    };

    const handlers = createActionHandlers();

    const { result, rerender } = renderHook((selectedBlockId: string | null) => {
      const data = useInspectorPanelData({
        ...base,
        selectedBlockId,
      });
      return {
        data,
        props: useInspectorPanelProps({
          ...data,
          ...handlers,
        }),
      };
    }, {
      initialProps: "a",
    });

    expect(result.current.data.focusedFailedBlock).toEqual({
      id: "a",
      command: "first fail",
      exitCode: 1,
      outputTail: "f1",
    });
    expect(result.current.props.focusedFailedBlock).toBe(result.current.data.focusedFailedBlock);
    expect(result.current.props.commandMenuIndex).toBe(0);

    rerender("b");

    expect(result.current.props.focusedFailedBlock).toEqual({
      id: "b",
      command: "second fail",
      exitCode: 2,
      outputTail: "f2",
    });
    expect(result.current.props.analyzeCache).toEqual({
      blockId: "stream",
      command: "stream cmd",
      requestedAt: 1,
      status: "done",
      result: "ok",
      rawResult: "ok",
      suggestedCommands: [],
    });
  });

  it("useInspectorPanelProps는 Command 메뉴 이벤트 핸들러를 동일 레퍼런스로 보존한다", () => {
    const cmdBlocks = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
    ];
    const handlers = createActionHandlers();
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
      cmdBlocks,
      selectedBlockId: "a" as string | null,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: 1,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
      inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
      inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
      scriptLibrary: {
        scripts: [],
        loading: false,
        onLoad: vi.fn(async () => undefined),
        onRun: vi.fn(),
        onDelete: vi.fn(async () => undefined),
        onSave: vi.fn(async () => ({
          id: "script-1",
          name: "test",
          description: "test",
          commands: [],
          created_at: 1,
        })),
      },
    };

    const { result } = renderHook(() => {
      const data = useInspectorPanelData(base);
      return useInspectorPanelProps({
        ...data,
        ...handlers,
      });
    });

    expect(result.current.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
  });

  it("inspectorCommandMenuIndex 변경은 useInspectorPanelProps에 그대로 반영된다", () => {
    const cmdBlocks = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
    ];

    const { result, rerender } = renderHook((inspectorCommandMenuIndex: number | null) => {
      const data = useInspectorPanelData({
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
        cmdBlocks,
        selectedBlockId: "a" as string | null,
        inspectorAnalyzeCache: null,
        inspectorCommandMenuIndex,
        quickActionsExpanded: false,
        inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
        inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
        inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
        scriptLibrary: {
          scripts: [],
          loading: false,
          onLoad: vi.fn(async () => undefined),
          onRun: vi.fn(),
          onDelete: vi.fn(async () => undefined),
          onSave: vi.fn(async () => ({
            id: "script-1",
            name: "test",
            description: "test",
            commands: [],
            created_at: 1,
          })),
        },
      });
      return useInspectorPanelProps({
        ...data,
        ...createActionHandlers(),
      });
    }, { initialProps: 0 });

    expect(result.current.commandMenuIndex).toBe(0);

    rerender(null);
    expect(result.current.commandMenuIndex).toBeNull();

    rerender(2);
    expect(result.current.commandMenuIndex).toBe(2);
  });

  it("inspectorDensity 변경 시 commandMenuIndex는 유지되며 props 연결이 유지된다", () => {
    const cmdBlocks = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
    ];
    const handlers = createActionHandlers();
    const { result, rerender } = renderHook(
      ([selectedBlockId, inspectorDensity]) => {
        const data = useInspectorPanelData({
          showInspector: true,
          selectedModel: "test-model",
          inspectorTab: "summary" as const,
          inspectorDensity,
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
          selectedBlockId,
          inspectorAnalyzeCache: null,
          inspectorCommandMenuIndex: 1,
          quickActionsExpanded: false,
          inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
          inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
          inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
          inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
          scriptLibrary: {
            scripts: [],
            loading: false,
            onLoad: vi.fn(async () => undefined),
            onRun: vi.fn(),
            onDelete: vi.fn(async () => undefined),
            onSave: vi.fn(async () => ({
              id: "script-1",
              name: "test",
              description: "test",
              commands: [],
              created_at: 1,
            })),
          },
        });
        return {
          data,
          props: useInspectorPanelProps({
            ...data,
            ...handlers,
          }),
        };
      },
      { initialProps: ["a" as string | null, "cozy" as const] },
    );

    expect(result.current.props.commandMenuIndex).toBe(1);
    expect(result.current.props.inspectorDensity).toBe("cozy");
    expect(result.current.data.inspectorDensity).toBe("cozy");
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);

    rerender(["a" as string | null, "compact" as const]);

    expect(result.current.props.commandMenuIndex).toBe(1);
    expect(result.current.props.inspectorDensity).toBe("compact");
    expect(result.current.data.inspectorDensity).toBe("compact");
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
  });

  it("선택 블록과 밀집도 동시 변경 시 commandMenuIndex와 핸들러 전달은 유지된다", () => {
    const cmdBlocks = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
      makeCommandBlock({ id: "b", command: "second fail", output: "f2", exitCode: 2 }),
    ];
    const handlers = createActionHandlers();

    const { result, rerender } = renderHook(
      ([selectedBlockId, inspectorDensity]) => {
        const data = useInspectorPanelData({
          showInspector: true,
          selectedModel: "test-model",
          inspectorTab: "summary" as const,
          inspectorDensity,
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
          selectedBlockId,
          inspectorAnalyzeCache: null,
          inspectorCommandMenuIndex: 1,
          quickActionsExpanded: false,
          inspectorMoreButtonRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
          inspectorMenuFirstActionRefs: makeRef({} as Record<number, HTMLButtonElement | null>),
          inspectorQuickActionsToggleRef: makeRef(null as HTMLButtonElement | null),
          inspectorQuickActionsAdvancedRef: makeRef(null as HTMLDivElement | null),
          scriptLibrary: {
            scripts: [],
            loading: false,
            onLoad: vi.fn(async () => undefined),
            onRun: vi.fn(),
            onDelete: vi.fn(async () => undefined),
            onSave: vi.fn(async () => ({
              id: "script-1",
              name: "test",
              description: "test",
              commands: [],
              created_at: 1,
            })),
          },
        });
        return {
          data,
          props: useInspectorPanelProps({
            ...data,
            ...handlers,
          }),
        };
      },
      {
        initialProps: ["a" as string | null, "cozy" as const],
      },
    );

    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "a", exitCode: 1, outputTail: "f1" });
    expect(result.current.props.commandMenuIndex).toBe(1);
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender(["b" as string | null, "compact" as const]);

    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "b", exitCode: 2, outputTail: "f2" });
    expect(result.current.props.commandMenuIndex).toBe(1);
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });
});
