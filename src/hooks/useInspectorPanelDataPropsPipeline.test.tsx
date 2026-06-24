import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInspectorPanelData } from "./useInspectorPanelData";
import { useInspectorPanelProps } from "./useInspectorPanelProps";
import type { CommandBlock } from "./useCommandBlocks";
import type {
  InspectorAnalyzeCache,
  InspectorDensity,
  InspectorPanelProps,
  InspectorTabItem,
} from "../components/InspectorPanel/types";

type InspectorPanelDataOptions = Parameters<typeof useInspectorPanelData>[0];

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
    ...overrides,
    id: overrides.id,
    command: overrides.command,
    output: overrides.output,
    exitCode: overrides.exitCode ?? null,
    startedAt: overrides.startedAt ?? 1_000,
    endedAt: overrides.endedAt ?? 1_050,
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
    const common: InspectorPanelDataOptions = {
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
    const base: InspectorPanelDataOptions = {
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

  it.each([
    { label: "개행", selectedBlockId: "fail-2\n" },
    { label: "앞뒤 공백", selectedBlockId: " fail-2 " },
    { label: "탭", selectedBlockId: "fail-2\t" },
    { label: "BOM", selectedBlockId: "\uFEFFfail-2" },
    { label: "빈 문자열", selectedBlockId: "" },
    { label: "공백 문자열", selectedBlockId: "   " },
    { label: "개행만", selectedBlockId: "\n" },
    { label: "탭만", selectedBlockId: "\t" },
    { label: "BOM만", selectedBlockId: "\uFEFF" },
  ])("선택 블록 ID에 $label이 포함되면 파이프라인도 최신 실패 블록으로 폴백한다", ({ selectedBlockId }) => {
    const { result } = renderHook(() => {
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
        cmdBlocks: [
          makeCommandBlock({ id: "fail-1", command: "cat", output: "fail1", exitCode: 1 }),
          makeCommandBlock({ id: "fail-2", command: "ls", output: "fail2", exitCode: 2 }),
        ],
        selectedBlockId: selectedBlockId as string,
        inspectorAnalyzeCache: null,
        inspectorCommandMenuIndex: 0,
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

      const handlers = createActionHandlers();
      return useInspectorPanelProps({
        ...data,
        ...handlers,
      });
    });

    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "fail-2",
      exitCode: 2,
      outputTail: "fail2",
    });
  });

  it.each([
    { label: "개행+공백+미존재 ID", selectedBlockId: " fail-999\n" },
    { label: "탭+미존재 ID", selectedBlockId: "\tfail-999\t" },
    { label: "BOM+미존재 ID", selectedBlockId: "\uFEFFfail-999" },
    { label: "미존재 공백-only", selectedBlockId: "   " },
    { label: "미존재 탭-only", selectedBlockId: "\t" },
    { label: "미존재 BOM-only", selectedBlockId: "\uFEFF" },
  ])("존재하지 않는 선택 블록 ID($label)면 파이프라인이 최신 실패 블록으로 폴백한다", ({ selectedBlockId }) => {
    const { result } = renderHook(() => {
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
        cmdBlocks: [
          makeCommandBlock({ id: "fail-1", command: "cat", output: "fail1", exitCode: 1 }),
          makeCommandBlock({ id: "fail-2", command: "ls", output: "fail2", exitCode: 2 }),
        ],
        selectedBlockId: selectedBlockId as string | null,
        inspectorAnalyzeCache: null,
        inspectorCommandMenuIndex: 0,
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
    });

    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "fail-2",
      exitCode: 2,
      outputTail: "fail2",
    });
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
    }, { initialProps: 0 as number | null });

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
      ([selectedBlockId, inspectorDensity]: [string | null, InspectorDensity]) => {
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
      { initialProps: ["a", "cozy"] as [string | null, InspectorDensity] },
    );

    expect(result.current.props.commandMenuIndex).toBe(1);
    expect(result.current.props.inspectorDensity).toBe("cozy");
    expect(result.current.data.inspectorDensity).toBe("cozy");
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);

    rerender(["a", "compact"] as [string | null, InspectorDensity]);

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
      ([selectedBlockId, inspectorDensity]: [string | null, InspectorDensity]) => {
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
        initialProps: ["a", "cozy"] as [string | null, InspectorDensity],
      },
    );

    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "a", exitCode: 1, outputTail: "f1" });
    expect(result.current.props.commandMenuIndex).toBe(1);
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender(["b", "compact"] as [string | null, InspectorDensity]);

    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "b", exitCode: 2, outputTail: "f2" });
    expect(result.current.props.commandMenuIndex).toBe(1);
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("quickActionsExpanded 동시 변경에서도 commandMenuIndex와 메뉴 핸들러 전달은 유지된다", () => {
    const cmdBlocks = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
      makeCommandBlock({ id: "b", command: "second fail", output: "f2", exitCode: 2 }),
    ];
    const handlers = createActionHandlers();

    const { result, rerender } = renderHook(
      ([selectedBlockId, quickActionsExpanded]: [string | null, boolean]) => {
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
          selectedBlockId,
          inspectorAnalyzeCache: null,
          inspectorCommandMenuIndex: 0,
          quickActionsExpanded,
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
        initialProps: ["a" as string | null, false],
      },
    );

    expect(result.current.props.quickActionsExpanded).toBe(false);
    expect(result.current.props.commandMenuIndex).toBe(0);
    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "a", exitCode: 1, outputTail: "f1" });
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender(["b" as string | null, true]);

    expect(result.current.props.quickActionsExpanded).toBe(true);
    expect(result.current.props.commandMenuIndex).toBe(0);
    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "b", exitCode: 2, outputTail: "f2" });
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("analyzeCache 변경과 quickActions 전환이 동시에 일어나도 핸들러 전달은 유지된다", () => {
    const cmdBlocks = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
      makeCommandBlock({ id: "b", command: "second fail", output: "f2", exitCode: 2 }),
    ];
    const handlers = createActionHandlers();
    const firstCache = {
      blockId: "stream-a",
      command: "stream cmd a",
      requestedAt: 1,
      status: "done" as const,
      result: "ok",
      rawResult: "ok",
      suggestedCommands: ["echo a"],
    };
    const secondCache = {
      blockId: "stream-b",
      command: "stream cmd b",
      requestedAt: 2,
      status: "done" as const,
      result: "ok2",
      rawResult: "ok2",
      suggestedCommands: ["echo b"],
    };

    const { result, rerender } = renderHook(
      ([inspectorAnalyzeCache, quickActionsExpanded, selectedBlockId]: [InspectorAnalyzeCache, boolean, string | null]) => {
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
          selectedBlockId,
          inspectorAnalyzeCache,
          inspectorCommandMenuIndex: 0,
          quickActionsExpanded,
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
        initialProps: [firstCache, false, "a"] as [InspectorAnalyzeCache, boolean, string | null],
      },
    );

    expect(result.current.props.commandMenuIndex).toBe(0);
    expect(result.current.props.quickActionsExpanded).toBe(false);
    expect(result.current.props.analyzeCache).toEqual(firstCache);
    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "a", exitCode: 1, outputTail: "f1" });
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender([secondCache, true, "b"] as [InspectorAnalyzeCache, boolean, string | null]);

    expect(result.current.props.commandMenuIndex).toBe(0);
    expect(result.current.props.quickActionsExpanded).toBe(true);
    expect(result.current.props.analyzeCache).toEqual(secondCache);
    expect(result.current.props.focusedFailedBlock).toMatchObject({ id: "b", exitCode: 2, outputTail: "f2" });
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
  });

  it("noActivity 전환에도 commandMenuIndex와 메뉴 핸들러 전달은 유지된다", () => {
    const handlers = createActionHandlers();
    const emptyCmdBlocks: CommandBlock[] = [];
    const withBlock = [
      makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
    ];

    const { result, rerender } = renderHook(
      ([cmdBlocks, quickActionsExpanded, inspectAnalyzeCache]: [CommandBlock[], boolean, InspectorAnalyzeCache | null]) => {
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
          selectedBlockId: cmdBlocks[0]?.id ?? null,
          inspectorAnalyzeCache: inspectAnalyzeCache,
          inspectorCommandMenuIndex: 2,
          quickActionsExpanded,
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
        initialProps: [emptyCmdBlocks, false, null] as [CommandBlock[], boolean, InspectorAnalyzeCache | null],
      },
    );

    expect(result.current.data.noActivity).toBe(true);
    expect(result.current.props.noActivity).toBe(true);
    expect(result.current.props.commandMenuIndex).toBe(2);
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);

    rerender([withBlock, true, {
      blockId: "stream",
      command: "stream cmd",
      requestedAt: 1,
      status: "done" as const,
      result: "ok",
      rawResult: "ok",
      suggestedCommands: [],
    }] as [CommandBlock[], boolean, InspectorAnalyzeCache | null]);

    expect(result.current.data.noActivity).toBe(false);
    expect(result.current.props.noActivity).toBe(false);
    expect(result.current.props.commandMenuIndex).toBe(2);
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
    expect(result.current.props.focusedFailedBlock).toEqual({
      id: "a",
      command: "first fail",
      exitCode: 1,
      outputTail: "f1",
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

  it("noActivity와 quickActionsExpanded 동시 변경에서도 메뉴 핸들러 전달은 유지된다", () => {
    const handlers = createActionHandlers();
    const { result, rerender } = renderHook(
      ([noActivity, quickActionsExpanded, selectedBlockId]: [boolean, boolean, string | null]) => {
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
          cmdBlocks: noActivity
            ? []
            : [
                makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 }),
                makeCommandBlock({ id: "b", command: "second fail", output: "f2", exitCode: 2 }),
              ],
          selectedBlockId,
          inspectorAnalyzeCache: null,
          inspectorCommandMenuIndex: 7,
          quickActionsExpanded,
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
        const props = useInspectorPanelProps({
          ...data,
          ...handlers,
        });
        return {
          data,
          props,
          quickActionsExpanded,
        };
      },
      {
        initialProps: [true, false, "a"] as [boolean, boolean, string | null],
      },
    );

    expect(result.current.props.noActivity).toBe(true);
    expect(result.current.props.quickActionsExpanded).toBe(false);
    expect(result.current.props.commandMenuIndex).toBe(7);
    expect(result.current.data.inspectorCommandMenuIndex).toBeUndefined();
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
    expect(result.current.props.focusedFailedBlock).toBeNull();

    rerender([false, true, "b"] as [boolean, boolean, string | null]);

    expect(result.current.props.noActivity).toBe(false);
    expect(result.current.props.quickActionsExpanded).toBe(true);
    expect(result.current.props.commandMenuIndex).toBe(7);
    expect(result.current.props.onCommandMenuRowBlurCapture).toBe(handlers.onCommandMenuRowBlurCapture);
    expect(result.current.props.onSuggestedCommandRowKeyDown).toBe(handlers.onSuggestedCommandRowKeyDown);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.onOpenCompactMenu).toBe(handlers.onOpenCompactMenu);
    expect(result.current.props.focusedFailedBlock).toMatchObject({
      id: "b",
      exitCode: 2,
      outputTail: "f2",
    });
    expect(result.current.props.focusedFailedBlock).toMatchObject({
      id: "b",
      exitCode: 2,
      outputTail: "f2",
    });
  });

  it("파이프라인 경로에서 onCompactMenuKeyDown 호출이 noActivity+quickActions 전환에도 유지된다", () => {
    const handlers = createActionHandlers();
    const event = { key: "ArrowDown", preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;

    const { result, rerender } = renderHook(
      ([noActivity, quickActionsExpanded, selectedBlockId]: [boolean, boolean, string | null]) => {
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
          cmdBlocks: noActivity
            ? []
            : [makeCommandBlock({ id: "a", command: "first fail", output: "f1", exitCode: 1 })],
          selectedBlockId,
          inspectorAnalyzeCache: noActivity
            ? null
            : {
                blockId: "stream",
                command: "stream cmd",
                requestedAt: 1,
                status: "done" as const,
                result: "ok",
                rawResult: "ok",
                suggestedCommands: [],
              },
          inspectorCommandMenuIndex: 7,
          quickActionsExpanded,
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

        const props = useInspectorPanelProps({
          ...data,
          ...handlers,
        });
        return {
          data,
          props,
        };
      },
      {
        initialProps: [true, false, null] as [boolean, boolean, string | null],
      },
    );

    expect(result.current.props.noActivity).toBe(true);
    expect(result.current.props.quickActionsExpanded).toBe(false);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    result.current.props.onCompactMenuKeyDown(event, 0);

    rerender([false, true, "a"] as [boolean, boolean, string | null]);

    expect(result.current.props.noActivity).toBe(false);
    expect(result.current.props.quickActionsExpanded).toBe(true);
    expect(result.current.props.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);
    expect(result.current.props.focusedFailedBlock).toMatchObject({
      id: "a",
      exitCode: 1,
      outputTail: "f1",
    });
    result.current.props.onCompactMenuKeyDown(event, 1);

    expect(handlers.onCompactMenuKeyDown).toHaveBeenCalledTimes(2);
    expect(handlers.onCompactMenuKeyDown).toHaveBeenNthCalledWith(1, event, 0);
    expect(handlers.onCompactMenuKeyDown).toHaveBeenNthCalledWith(2, event, 1);
  });
});
