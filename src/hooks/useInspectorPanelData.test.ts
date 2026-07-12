import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { InspectorAnalyzeCache } from "../components/InspectorPanel/types";
import {
  getInspectorPanelDataMeta,
  getInspectorPanelFlowSummary,
  useInspectorPanelData,
} from "./useInspectorPanelData";
import type { CommandBlock } from "./useCommandBlocks";

const INSPECTOR_TABS = [
  { id: "summary", label: "개요", shortcut: "1" },
  { id: "rag", label: "RAG", shortcut: "2" },
  { id: "scripts", label: "Scripts", shortcut: "3" },
  { id: "sysmon", label: "System", shortcut: "4" },
] as const;

const DEFAULT_SCRIPT_LIBRARY = {
  scripts: [],
  loading: false,
  onLoad: async () => {},
  onRun: () => {},
  onDelete: async () => {},
  onSave: async () => ({
    id: "tmp",
    name: "",
    commands: [],
    description: "",
    created_at: Date.now(),
  }),
};

function makeRef<T>(value: T): { current: T } {
  return { current: value };
}

function buildBlock(overrides: Partial<CommandBlock> & { id: string; command: string; output: string; }): CommandBlock {
  return {
    ...overrides,
    id: overrides.id,
    command: overrides.command,
    output: overrides.output,
    exitCode: overrides.exitCode ?? null,
    startedAt: overrides.startedAt ?? 1_000,
    endedAt: overrides.endedAt ?? 1_002,
  };
}

describe("useInspectorPanelData", () => {
  it("인스펙터 상태 요약은 noActivity/실패/정상 흐름을 반환한다", () => {
    expect(
      getInspectorPanelFlowSummary({
        activeTabTitle: "main",
        noActivity: true,
        failedBlockCount: 0,
        recentBlockCount: 0,
      }),
    ).toEqual({
      badges: ["main", "실행 대기", "첫 기록 수집 전"],
      helper: "아직 실행 기록이 없어 첫 명령을 실행하면 실패 분석과 최근 기록 흐름이 여기서부터 시작됩니다.",
    });

    expect(
      getInspectorPanelFlowSummary({
        activeTabTitle: "main",
        noActivity: false,
        failedBlockCount: 2,
        recentBlockCount: 5,
      }),
    ).toEqual({
      badges: ["main", "실패 2개", "최근 5개"],
      helper: "실패 블록이 있어 복구나 재실행을 먼저 보고, 이후 최근 기록 흐름으로 이어가는 상태입니다.",
    });

    expect(
      getInspectorPanelFlowSummary({
        activeTabTitle: "main",
        noActivity: false,
        failedBlockCount: 0,
        recentBlockCount: 4,
      }),
    ).toEqual({
      badges: ["main", "실패 없음", "최근 4개"],
      helper: "현재는 치명적인 실패 없이 최근 실행 기록을 중심으로 흐름을 확인할 수 있는 상태입니다.",
    });

    expect(
      getInspectorPanelDataMeta({
        activeTabTitle: "main",
        failedBlockCount: 2,
        recentBlockCount: 5,
        inspectorAnalyzeStatus: "streaming",
        quickActionsExpanded: true,
      }),
    ).toEqual({
      title: "main 인스펙터 상태",
      badges: ["실패 2개", "최근 5개", "빠른 액션 펼침 · 분석 streaming"],
      helper: "실패 블록, 최근 실행 기록, 분석 캐시를 함께 보며 복구나 재실행 흐름을 이어갈 수 있습니다.",
    });

    expect(
      getInspectorPanelDataMeta({
        activeTabTitle: "main",
        failedBlockCount: 0,
        recentBlockCount: 4,
        inspectorAnalyzeStatus: null,
        quickActionsExpanded: false,
      }),
    ).toEqual({
      title: "main 실행 요약",
      badges: ["실패 0개", "최근 4개", "빠른 액션 접힘 · 분석 idle"],
      helper: "최근 실행 기록과 빠른 액션을 중심으로 현재 탭의 작업 흐름을 점검할 수 있습니다.",
    });
  });

  it("실패 블록만 역순으로 정렬되고 선택 블록이 있으면 우선 반환한다", () => {
    const cmdBlocks = [
      buildBlock({ id: "a", command: "echo ok", output: "출력 1", exitCode: 0 }),
      buildBlock({ id: "b", command: "bad cmd", output: "오류 tail", exitCode: 1 }),
      buildBlock({ id: "c", command: "  fail\\nagain  ", output: "  마지막줄  ", exitCode: 2 }),
      buildBlock({ id: "d", command: "   ", output: "ignore", exitCode: 1 }),
    ];

    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks,
      selectedBlockId: "c",
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.failedBlocks).toEqual([
      { id: "c", command: "fail\\nagain", exitCode: 2, outputTail: "마지막줄" },
      { id: "b", command: "bad cmd", exitCode: 1, outputTail: "오류 tail" },
    ]);
    expect(result.current.focusedFailedBlock).toEqual({
      id: "c",
      command: "fail\\nagain",
      exitCode: 2,
      outputTail: "마지막줄",
    });
  });

  it("최근 블록은 최근 6개만 역순으로 슬라이스하고 duration을 계산한다", () => {
    const cmdBlocks = Array.from({ length: 8 }).map((_, idx) =>
      buildBlock({
        id: `b${idx + 1}`,
        command: `cmd-${idx + 1}`,
        output: `out-${idx + 1}`,
        exitCode: idx % 2,
        startedAt: 1_000 + idx * 10,
        endedAt: 1_000 + idx * 10 + (idx + 1),
      }),
    );

    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks,
      selectedBlockId: null,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: 0,
      quickActionsExpanded: true,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.recentBlocks).toHaveLength(6);
    expect(result.current.recentBlocks[0]).toMatchObject({
      id: "b8",
      command: "cmd-8",
      durationMs: 8,
      outputTail: "out-8",
    });
    expect(result.current.recentBlocks[5]).toMatchObject({
      id: "b3",
      command: "cmd-3",
      durationMs: 3,
      outputTail: "out-3",
    });
  });

  it("출력은 줄바꿈을 기준으로 마지막 유효 줄을 추출하고 길이 초과 시 잘라낸다", () => {
    const longTail = "x".repeat(220);
    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks: [
        buildBlock({
          id: "long",
          command: "  echo line1\nline2  \n  \n tail line  \n",
          output: `a\n\n${longTail}`,
          exitCode: 1,
        }),
      ],
      selectedBlockId: "long",
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.failedBlocks).toHaveLength(1);
    expect(result.current.failedBlocks[0]).toMatchObject({
      id: "long",
      command: "echo line1\nline2",
    });
    expect(result.current.failedBlocks[0].outputTail).toHaveLength(163);
    expect(result.current.failedBlocks[0].outputTail.startsWith("x".repeat(2))).toBe(true);
    expect(result.current.failedBlocks[0].outputTail.endsWith("...")).toBe(true);
  });

  it("선택한 블록이 실패 블록이 아니면 최근 실패 블록을 fallback으로 사용한다", () => {
    const cmdBlocks = [
      buildBlock({ id: "ok", command: "echo ok", output: "ok", exitCode: 0 }),
      buildBlock({ id: "fail-1", command: "bad1", output: "fail tail", exitCode: 1 }),
      buildBlock({ id: "fail-2", command: "bad2", output: "fail2", exitCode: 2 }),
    ];

    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks,
      selectedBlockId: "ok",
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.focusedFailedBlock).toEqual({
      id: "fail-2",
      command: "bad2",
      exitCode: 2,
      outputTail: "fail2",
    });
  });

  it.each([
    { label: "앞뒤 공백", selectedBlockId: " fail-2 " },
    { label: "개행", selectedBlockId: "fail-2\n" },
    { label: "탭", selectedBlockId: "fail-2\t" },
    { label: "BOM 문자", selectedBlockId: "\uFEFFfail-2" },
  ])("$label이 포함된 선택 ID는 정규화 후 해당 실패 블록을 정확히 선택한다", ({ selectedBlockId }) => {
    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks: [
        buildBlock({ id: "fail-1", command: "bad1", output: "fail tail", exitCode: 1 }),
        buildBlock({ id: "fail-2", command: "bad2", output: "fail2", exitCode: 2 }),
      ],
      selectedBlockId,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.focusedFailedBlock).toEqual({
      id: "fail-2",
      command: "bad2",
      exitCode: 2,
      outputTail: "fail2",
    });
  });

  it.each([
    { label: "빈 문자열", selectedBlockId: "" },
    { label: "공백 문자열", selectedBlockId: "   " },
    { label: "개행만", selectedBlockId: "\n" },
    { label: "탭만", selectedBlockId: "\t" },
    { label: "BOM만", selectedBlockId: "\uFEFF" },
  ])("$label 선택 ID는 정규화 후 fallback으로 최신 실패 블록을 사용한다", ({ selectedBlockId }) => {
    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks: [
        buildBlock({ id: "fail-1", command: "bad1", output: "fail tail", exitCode: 1 }),
        buildBlock({ id: "fail-2", command: "bad2", output: "fail2", exitCode: 2 }),
      ],
      selectedBlockId,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.focusedFailedBlock).toEqual({
      id: "fail-2",
      command: "bad2",
      exitCode: 2,
      outputTail: "fail2",
    });
  });

  it.each([
    { label: "미존재 일반 값", selectedBlockId: "bad-3" },
    { label: "미존재 앞뒤 공백", selectedBlockId: " bad-3 " },
    { label: "미존재 탭 혼입", selectedBlockId: "\tbad-3\t" },
    { label: "미존재 개행 혼입", selectedBlockId: "bad-3\n" },
    { label: "미존재 BOM 혼입", selectedBlockId: "\uFEFFbad-3" },
  ])("$label 선택 ID는 정규화 후 최신 실패 블록으로 fallback한다", ({ selectedBlockId }) => {
    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks: [
        buildBlock({ id: "fail-1", command: "bad1", output: "fail tail", exitCode: 1 }),
        buildBlock({ id: "fail-2", command: "bad2", output: "fail2", exitCode: 2 }),
      ],
      selectedBlockId,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.focusedFailedBlock).toEqual({
      id: "fail-2",
      command: "bad2",
      exitCode: 2,
      outputTail: "fail2",
    });
  });

  it("최근 블록 duration은 endedAt이 없거나 음수면 0으로 안정적으로 처리한다", () => {
    const { result } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks: [
        buildBlock({
          id: "zero",
          command: "sleep 0",
          output: "ok",
          exitCode: 0,
          startedAt: 100,
          endedAt: null,
        }),
        buildBlock({
          id: "negative",
          command: "bad-order",
          output: "ok",
          exitCode: 1,
          startedAt: 300,
          endedAt: 100,
        }),
      ],
      selectedBlockId: null,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(result.current.recentBlocks).toHaveLength(2);
    expect(result.current.recentBlocks[0]).toMatchObject({
      id: "negative",
      durationMs: 0,
    });
    expect(result.current.recentBlocks[1]).toMatchObject({
      id: "zero",
      durationMs: 902,
    });
  });

  it("활동 없음은 cmdBlocks가 없고 분석 캐시도 없을 때만 true", () => {
    const inspectCache: InspectorAnalyzeCache = {
      blockId: "x",
      command: "echo",
      requestedAt: 1,
      status: "done",
      result: "ok",
      rawResult: "ok",
      suggestedCommands: [],
    };

    const { result: emptyResult } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks: [],
      selectedBlockId: null,
      inspectorAnalyzeCache: null,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    const { result: cachedResult } = renderHook(() => useInspectorPanelData({
      showInspector: true,
      selectedModel: "test-model",
      inspectorTab: "summary",
      inspectorDensity: "cozy",
      inspectorTabs: INSPECTOR_TABS,
      inspectorTabRefs: makeRef({ summary: null, rag: null, scripts: null, sysmon: null }),
      activeTab: { title: "Shell 1", cwd: "/repo" },
      activeTabGitInfo: { branch: "feat/x", changed: 2 },
      cmdBlocks: [],
      selectedBlockId: null,
      inspectorAnalyzeCache: inspectCache,
      inspectorCommandMenuIndex: null,
      quickActionsExpanded: false,
      inspectorMoreButtonRefs: makeRef({}),
      inspectorMenuFirstActionRefs: makeRef({}),
      inspectorQuickActionsToggleRef: makeRef(null),
      inspectorQuickActionsAdvancedRef: makeRef(null),
      scriptLibrary: DEFAULT_SCRIPT_LIBRARY,
    }));

    expect(emptyResult.current.noActivity).toBe(true);
    expect(cachedResult.current.noActivity).toBe(false);
  });
});
