import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getInspectorPanelPropsBundleMeta,
  useInspectorPanelPropsBundle,
} from "./useInspectorPanelPropsBundle";
import type {
  InspectorPanelActionHandlerProps,
  UseInspectorPanelPropsBundleOptions,
} from "./useInspectorPanelPropsBundle";
import type { CommandBlock } from "./useCommandBlocks";
import type { InspectorAnalyzeCache, InspectorTabItem, ScriptLibraryLike } from "../components/InspectorPanel/types";

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
    ...overrides,
    id: overrides.id,
    command: overrides.command,
    output: overrides.output,
    exitCode: overrides.exitCode ?? 1,
    startedAt: overrides.startedAt ?? 1_000,
    endedAt: overrides.endedAt ?? 1_050,
  };
}

function createScriptLibrary(): ScriptLibraryLike {
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
  it("번들 입력 기준으로 인스펙터 조합 상태 메타를 계산한다", () => {
    const meta = getInspectorPanelPropsBundleMeta({
      activeTab: { title: "Shell 1", cwd: "/repo" },
      cmdBlocks: [
        makeCommandBlock({ id: "ok", command: "echo hi", output: "ok", exitCode: 0 }),
        makeCommandBlock({ id: "bad", command: "bad cmd", output: "ERR", exitCode: 2 }),
      ],
      selectedBlockId: "\uFEFF bad \n",
      inspectorAnalyzeCache: {
        blockId: "stream",
        command: "stream cmd",
        requestedAt: 10,
        status: "done",
        result: "ok",
        rawResult: "ok",
        suggestedCommands: ["echo done"],
      },
    });

    expect(meta).toEqual({
      hasActiveTab: true,
      hasFailedBlocks: true,
      hasRecentBlocks: true,
      hasAnalyzeResult: true,
      normalizedSelectedBlockId: "bad",
    });
  });

  it("selectedBlockId의 공백/BOM 정규화가 번들 수준에서도 실패 블록 선택으로 이어진다", () => {
    const handlers = createHandlers();

    const { result } = renderHook(() =>
      useInspectorPanelPropsBundle({
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
          makeCommandBlock({ id: "fail-1", command: "bad1", output: "err1", exitCode: 1 }),
          makeCommandBlock({ id: "fail-2", command: "bad2", output: "err2", exitCode: 2 }),
        ],
        selectedBlockId: "\uFEFF fail-2 \n",
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
    );

    expect(result.current.focusedFailedBlock).toEqual({
      id: "fail-2",
      command: "bad2",
      exitCode: 2,
      outputTail: "err2",
    });
  });

  it("활동 내역이 없고 analyze cache도 없으면 noActivity가 유지된다", () => {
    const handlers = createHandlers();

    const { result } = renderHook(() =>
      useInspectorPanelPropsBundle({
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
    );

    expect(result.current.noActivity).toBe(true);
    expect(result.current.failedBlocks).toEqual([]);
    expect(result.current.recentBlocks).toEqual([]);
  });

  it("useInspectorPanelData와 handlers를 정확히 결합해 InspectorPanelProps를 반환한다", () => {
    const handlers = createHandlers();
    const resultData: UseInspectorPanelPropsBundleOptions = {
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
    const commonProps: UseInspectorPanelPropsBundleOptions = {
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
      (props: UseInspectorPanelPropsBundleOptions) => useInspectorPanelPropsBundle(props),
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
        initialProps: { title: "   ", cwd: "   " } as { title: string; cwd: string } | null,
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
        initialProps: { branch: "   ", changed: 3 } as { branch?: string; changed?: number } | null,
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
        initialProps: { branch: "main", changed: -1 } as { branch?: string; changed?: number } | null,
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
      durationMs: 0,
      exitCode: 0,
      command: "fourth",
      outputTail: "done",
    });
  });

  it("recentBlocks의 outputTail은 120자 제한을 넘으면 끝이 생략된다", () => {
    const handlers = createHandlers();
    const longOutput = `line1\n${"x".repeat(130)}\n`;

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
        makeCommandBlock({ id: "a", command: "cmd", output: longOutput, exitCode: 0 }),
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

    expect(result.current.recentBlocks).toHaveLength(1);
    expect(result.current.recentBlocks[0].outputTail).toBe(`${"x".repeat(120)}...`);
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

  it.each([
    { selectedBlockId: "", label: "빈 문자열" },
    { selectedBlockId: "   ", label: "공백 문자열" },
    { selectedBlockId: "\n", label: "개행 문자열" },
    { selectedBlockId: "\t", label: "탭 문자열" },
    { selectedBlockId: "\uFEFF", label: "BOM 문자열" },
  ])("선택한 블록 ID가 $label일 때 실패 블록은 최신 항목으로 폴백한다", ({ selectedBlockId }) => {
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
        makeCommandBlock({ id: "failed-latest", command: "latest fail", output: "f2", exitCode: 1 }),
      ],
      selectedBlockId,
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

  it.each([
    { kind: "inspectorFailedBlocks", output: "  first line\n  second line  \n  ", expected: "second line" },
    { kind: "recentBlocks", output: "  first line\n  second line  \n  ", expected: "second line" },
  ])("$kind는 공백 라인을 제거하고 마지막 라인을 trim한다", ({ kind, output, expected }) => {
    const handlers = createHandlers();
    const command = "cmd";

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
        makeCommandBlock({ id: "failed", command, output, exitCode: kind === "inspectorFailedBlocks" ? 1 : 0 }),
      ],
      selectedBlockId: "failed",
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

    const expectedTail = expected;
    if (kind === "inspectorFailedBlocks") {
      expect(result.current.failedBlocks).toHaveLength(1);
      expect(result.current.failedBlocks[0].outputTail).toBe(expectedTail);
      return;
    }

    expect(result.current.recentBlocks).toHaveLength(1);
    expect(result.current.recentBlocks[0].outputTail).toBe(expectedTail);
  });

  it.each([
    { kind: "inspectorFailedBlocks", output: "   \n\t\n   ", exitCode: 1 },
    { kind: "recentBlocks", output: "   \n\t\n   ", exitCode: 0 },
  ])("$kind은 모든 라인이 공백일 때 outputTail이 빈 문자열이다", ({ kind, output, exitCode }) => {
    const handlers = createHandlers();
    const command = "cmd";

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
        makeCommandBlock({ id: "empty", command, output, exitCode }),
      ],
      selectedBlockId: "empty",
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

    const expectedTail = "";
    if (kind === "inspectorFailedBlocks") {
      expect(result.current.failedBlocks).toHaveLength(1);
      expect(result.current.failedBlocks[0].outputTail).toBe(expectedTail);
      return;
    }

    expect(result.current.recentBlocks).toHaveLength(1);
    expect(result.current.recentBlocks[0].outputTail).toBe(expectedTail);
  });

  it.each([
    { selectedBlockId: "bad-1", label: "미존재 일반 값" },
    { selectedBlockId: " bad-1", label: "선행 공백과 미존재 값" },
    { selectedBlockId: "\tbad-1\t", label: "탭이 붙은 미존재 값" },
    { selectedBlockId: "bad-1\n", label: "개행이 붙은 미존재 값" },
    { selectedBlockId: "\uFEFFbad-1", label: "BOM 접두 미존재 값" },
  ])("선택한 블록 ID가 $label이면 최근 실패 블록으로 폴백한다", ({ selectedBlockId }) => {
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
      selectedBlockId,
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

  it.each([
    { selectedBlockId: null, label: "null" },
    { selectedBlockId: "", label: "빈 문자열" },
    { selectedBlockId: "  ", label: "공백 문자열" },
    { selectedBlockId: "\n", label: "개행 문자열" },
    { selectedBlockId: "\t", label: "탭 문자열" },
    { selectedBlockId: "\uFEFF", label: "BOM 문자열" },
    { selectedBlockId: "non-exist", label: "미존재 ID" },
  ])("선택한 블록 ID가 $label이면 최근 실패 블록으로 폴백한다", ({ selectedBlockId }) => {
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
      selectedBlockId,
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

  it("선택 블록 ID에 공백이 섞이면 정확히 일치하지 않아 최신 실패 블록으로 폴백한다", () => {
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
        makeCommandBlock({ id: "failed-latest", command: "latest fail", output: "f2", exitCode: 1 }),
      ],
      selectedBlockId: " failed-latest ",
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

  it("선택 블록 ID의 대소문자가 다르면 정확히 일치하지 않아 최신 실패 블록으로 폴백한다", () => {
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
        makeCommandBlock({ id: "failed-latest", command: "latest fail", output: "f2", exitCode: 1 }),
      ],
      selectedBlockId: "FAILED-LATEST",
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

  it("outputTail은 CRLF 라인 종료에서도 마지막 비어있지 않은 라인을 trim해 반영한다", () => {
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
        makeCommandBlock({ id: "failed", command: "cmd", output: " first\r\n  second  \r\n  \r\n", exitCode: 1 }),
      ],
      selectedBlockId: "failed",
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
      outputTail: "second",
    });
  });

  it("선택 블록 ID에 개행이 섞이면 정확히 일치하지 않아 최신 실패 블록으로 폴백한다", () => {
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
        makeCommandBlock({ id: "failed-latest", command: "latest fail", output: "f2", exitCode: 1 }),
      ],
      selectedBlockId: "failed-latest\n",
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

  it("선택한 실패 블록이 제거되면 최신 실패 블록으로 안전하게 폴백한다", () => {
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
      selectedBlockId: "failed-latest",
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
      (cmdBlocks: CommandBlock[]) => useInspectorPanelPropsBundle({
        ...base,
        cmdBlocks,
      }),
      {
        initialProps: [
          makeCommandBlock({ id: "failed-first", command: "first fail", output: "f1", exitCode: 1 }),
          makeCommandBlock({ id: "failed-latest", command: "second fail", output: "f2", exitCode: 1 }),
        ] as const as CommandBlock[],
      },
    );

    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "failed-latest",
      exitCode: 1,
      outputTail: "f2",
    });

    rerender([
      makeCommandBlock({ id: "failed-first", command: "first fail", output: "f1", exitCode: 1 }),
      makeCommandBlock({ id: "success", command: "ok", output: "ok", exitCode: 0 }),
    ] as const as CommandBlock[]);

    expect(result.current.focusedFailedBlock).toMatchObject({
      id: "failed-first",
      exitCode: 1,
      outputTail: "f1",
    });

    rerender([] as const as CommandBlock[]);

    expect(result.current.focusedFailedBlock).toBeNull();
  });

  it("성공 블록 ID를 선택하고 실패 블록이 없으면 focusedFailedBlock이 null이다", () => {
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
        makeCommandBlock({ id: "success", command: "ok", output: "result", exitCode: 0 }),
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

    expect(result.current.focusedFailedBlock).toBeNull();
  });

  it.each([
    { kind: "inspectorFailedBlocks", tailChars: "x".repeat(160), outputTail: "x".repeat(160), lineCap: 160 },
    { kind: "recentBlocks", tailChars: "x".repeat(120), outputTail: "x".repeat(120), lineCap: 120 },
  ])("$kind는 outputTail 길이가 cap일 때 ellipsis를 붙이지 않는다", ({ kind, outputTail, lineCap, tailChars }) => {
    const handlers = createHandlers();
    const output = `line1\n${tailChars}\n`;

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
        makeCommandBlock({
          id: "tail",
          command: "cmd",
          output,
          exitCode: kind === "inspectorFailedBlocks" ? 1 : 0,
        }),
      ],
      selectedBlockId: "tail",
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

    if (kind === "inspectorFailedBlocks") {
      expect(result.current.failedBlocks).toHaveLength(1);
      expect(result.current.failedBlocks[0].outputTail).toBe(outputTail);
      expect(result.current.failedBlocks[0].outputTail.length).toBe(lineCap);
      return;
    }

    expect(result.current.recentBlocks).toHaveLength(1);
    expect(result.current.recentBlocks[0].outputTail).toBe(outputTail);
    expect(result.current.recentBlocks[0].outputTail.length).toBe(lineCap);
  });

  it.each([
    { kind: "inspectorFailedBlocks", cap: 160, lengths: [0, 1, 159, 160, 161, 200] },
    { kind: "recentBlocks", cap: 120, lengths: [0, 1, 119, 120, 121, 200] },
  ])("$kind는 outputTail 경계치에서 길이 규칙이 일관된다", ({ kind, cap, lengths }) => {
    const handlers = createHandlers();

    lengths.forEach((length) => {
      const output = `head\n${"x".repeat(length)}\n`;
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
          makeCommandBlock({
            id: `tail-${length}`,
            command: "cmd",
            output,
            exitCode: kind === "inspectorFailedBlocks" ? 1 : 0,
          }),
        ],
        selectedBlockId: `tail-${length}`,
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

      const expected = length <= cap
        ? "x".repeat(length)
        : `${"x".repeat(cap)}...`;
      const expectedLength = length <= cap ? length : cap + 3;

      if (kind === "inspectorFailedBlocks") {
        expect(result.current.failedBlocks).toHaveLength(1);
        expect(result.current.failedBlocks[0].outputTail).toBe(expected);
        expect(result.current.failedBlocks[0].outputTail.length).toBe(expectedLength);
        return;
      }

      expect(result.current.recentBlocks).toHaveLength(1);
      expect(result.current.recentBlocks[0].outputTail).toBe(expected);
      expect(result.current.recentBlocks[0].outputTail.length).toBe(expectedLength);
    });
  });

  it("이모지 포함 출력도 outputTail 제한 길이 규칙을 유지한다", () => {
    const handlers = createHandlers();
    const output = `first\n${"😀".repeat(90)}\n`;

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
        makeCommandBlock({ id: "emoji", command: "cmd", output, exitCode: 1 }),
      ],
      selectedBlockId: "emoji",
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
    expect(result.current.failedBlocks[0].outputTail).toContain("...");
    expect(result.current.failedBlocks[0].outputTail.endsWith("...")).toBe(true);
    expect(result.current.failedBlocks[0].outputTail.length).toBe(163);
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
      ([showInspector, showInspectorQuickActionsExpanded, commandMenuIndex, noActivity]: [boolean, boolean, number | null, boolean]) => useInspectorPanelPropsBundle({
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
        initialProps: [true, false, 4, true] as [boolean, boolean, number | null, boolean],
      },
    );

    expect(result.current.noActivity).toBe(true);
    expect(result.current.quickActionsExpanded).toBe(false);
    expect(result.current.commandMenuIndex).toBe(4);
    expect(result.current.onQuickActionsToggle).toBe(handlers.onQuickActionsToggle);
    expect(result.current.onCompactMenuKeyDown).toBe(handlers.onCompactMenuKeyDown);

    rerender([false, true, 5, false] as [boolean, boolean, number | null, boolean]);

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
    const baseProps: UseInspectorPanelPropsBundleOptions = {
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
      (props: UseInspectorPanelPropsBundleOptions) => useInspectorPanelPropsBundle(props),
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
      inspectorTab: "rag",
    });

    expect(result.current.selectedModel).toBe("model-b");
    expect(result.current.inspectorDensity).toBe("compact");
    expect(result.current.inspectorTab).toBe("rag");
  });

  it("showInspector / quickActionsExpanded / commandMenuIndex / analyzeCache 변경이 번들에 반영된다", () => {
    const handlers = createHandlers();
    const base: UseInspectorPanelPropsBundleOptions = {
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
      (props: UseInspectorPanelPropsBundleOptions) => useInspectorPanelPropsBundle(props),
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
    expect(result.current.noActivity).toBe(false);
  });

  it("commandMenuIndex가 null일 때도 noActivity 계산은 캐시 기준으로 일관된다", () => {
    const handlers = createHandlers();
    const { result, rerender } = renderHook(
      ([showInspectorQuickActionsExpanded, commandMenuIndex, hasAnalyzeCache]: [boolean, number | null, boolean]) => useInspectorPanelPropsBundle({
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
        initialProps: [false, null, true] as [boolean, number | null, boolean],
      },
    );

    expect(result.current.noActivity).toBe(false);

    rerender([false, null, false] as [boolean, number | null, boolean]);
    expect(result.current.noActivity).toBe(true);
    expect(result.current.commandMenuIndex).toBeNull();

    rerender([false, 2, false] as [boolean, number | null, boolean]);
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
      ([inspectorAnalyzeCache, selectedBlockId]: [InspectorAnalyzeCache | null, string | null]) => useInspectorPanelPropsBundle({
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
          },
          "some-block",
        ] as [InspectorAnalyzeCache | null, string | null],
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
