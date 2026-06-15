import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type KeyboardEvent, type SetStateAction, useState } from "react";
import type { ChatMessage } from "./useAIChat";
import type { InspectorAnalyzeCache } from "../components/InspectorPanel/types";
import { useInspectorPanelCommands } from "./useInspectorPanelCommands";

interface Notif {
  type: "command";
  title: string;
  body: string;
}

function buildBlock(id: string, command: string, output: string, exitCode: number | null) {
  return {
    id,
    command,
    output,
    exitCode,
    startedAt: 1_000,
    endedAt: 1_001,
  };
}

function createClipboardMock() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const originalClipboard = globalThis.navigator?.clipboard;
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return {
    writeText,
    restore: () => {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    },
  };
}

function setupInspectorCommands(overrides: {
  cmdBlocks?: ReturnType<typeof buildBlock>[];
  selectedBlockId?: string | null;
  inspectorAnalyzeCache?: InspectorAnalyzeCache | null;
  isInspectorCompact?: boolean;
  inspectorCommandMenuIndex?: number | null;
  verifyLevel?: "Safe" | "Warning" | "Dangerous" | "Blocked";
  verifyReason?: string;
} = {}) {
  const cmdBlocks = overrides.cmdBlocks ?? [];
  const selectedBlockId = overrides.selectedBlockId ?? null;
  const inspectCache = overrides.inspectorAnalyzeCache;
  const isInspectorCompact = overrides.isInspectorCompact ?? true;
  const inspectorCommandMenuIndex = overrides.inspectorCommandMenuIndex ?? null;
  const verifyLevel = overrides.verifyLevel ?? "Safe";
  const verifyReason = overrides.verifyReason ?? "ok";

  const setSelectedBlockId = vi.fn();
  const setDismissedBlockId = vi.fn();
  const setViewMode = vi.fn();
  const setAiInput = vi.fn();
  const setShowAiBar = vi.fn();
  const notifications: Notif[] = [];
  const aiInput = document.createElement("input");
  const aiInputRef = { current: aiInput };
  const closeInspector = vi.fn();
  const closeInspectorCommandMenu = vi.fn();
  const handleAskAI = vi.fn();
  const activeTabIdRef = { current: "tab-1" };
  const tabs = [{ id: "tab-1", cwd: "/tmp/project" }];
  const ptyWrite = vi.fn();
  const ptyWriteRefs = { current: new Map([["pane-1", ptyWrite]]) };
  const activePaneIdRef = { current: "pane-1" };
  const verifyCommandSafety = vi.fn().mockResolvedValue({
    level: verifyLevel,
    reason: verifyReason,
  });
  const notifCenter = { addNotification: vi.fn((n: Notif) => notifications.push(n)) };
  const setInspectorAnalyzeCacheSpy = vi.fn();

  const result = renderHook(() => {
    const [inspectorAnalyzeCache, setInspectorAnalyzeCacheState] = useState<InspectorAnalyzeCache | null>(
      inspectCache ?? null,
    );
    const [aiChat, setAiChat] = useState<{ messages: ChatMessage[]; streaming: boolean }>({
      messages: [],
      streaming: false,
    });

    const setInspectorAnalyzeCache = (
      value: SetStateAction<InspectorAnalyzeCache | null>,
    ) => {
      setInspectorAnalyzeCacheSpy(value);
      setInspectorAnalyzeCacheState(value);
    };

    const commands = useInspectorPanelCommands({
      cmdBlocks,
      selectedBlockId,
      setSelectedBlockId,
      setDismissedBlockId,
      setViewMode,
      setAiInput,
      setShowAiBar,
      aiInputRef,
      tabs,
      activeTabIdRef,
      handleAskAI,
      aiChat,
      inspectorAnalyzeCache,
      setInspectorAnalyzeCache,
      closeInspector,
      closeInspectorCommandMenu,
      isInspectorCompact,
      inspectorCommandMenuIndex,
      ptyWriteRefs,
      activePaneIdRef,
      verifyCommandSafety,
      notifCenter,
    });

    return {
      ...commands,
      inspectorAnalyzeCache,
      setAiChat,
    };
  });

  return {
    result,
    spies: {
      setSelectedBlockId,
      setDismissedBlockId,
      setViewMode,
      setAiInput,
      setShowAiBar,
      setInspectorAnalyzeCache: setInspectorAnalyzeCacheSpy,
      closeInspector,
      closeInspectorCommandMenu,
      handleAskAI,
      verifyCommandSafety,
      notifCenter,
      notifications,
      ptyWrite,
      setAiChat: result.current.setAiChat,
    },
  };
}

describe("useInspectorPanelCommands", () => {
  let restoreClipboard: () => void;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = createClipboardMock();
    writeText = mock.writeText;
    restoreClipboard = mock.restore;
  });

  afterEach(() => {
    restoreClipboard();
    vi.clearAllMocks();
  });

  it("실패한 블록이 있으면 가장 최근 실패 블록으로 분석 프롬프트를 생성한다", () => {
    const { result, spies } = setupInspectorCommands({
      cmdBlocks: [
        buildBlock("b1", "pwd", "ok", 0),
        buildBlock("b2", "cat file", "err", 1),
        buildBlock("b3", "npm test", "fail", 2),
      ],
      selectedBlockId: "b2",
    });

    act(() => {
      result.current.analyzeInspectorFailedBlock();
    });

    expect(spies.closeInspectorCommandMenu).toHaveBeenCalledTimes(1);
    expect(spies.setInspectorAnalyzeCache).toHaveBeenCalledTimes(1);
    const arg = spies.setInspectorAnalyzeCache.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      blockId: "b2",
      command: "cat file",
      status: "streaming",
      suggestedCommands: [],
    });
    expect(spies.handleAskAI).toHaveBeenCalledTimes(1);
    expect(spies.handleAskAI).toHaveBeenCalledWith(expect.stringContaining("Command: cat file"));
    expect(spies.handleAskAI).toHaveBeenCalledWith(expect.stringContaining("CWD: /tmp/project"));
    expect(spies.setViewMode).toHaveBeenCalledWith("terminal");
  });

  it("실패한 블록이 없으면 분석/복사 동작을 수행하지 않는다", () => {
    const { result, spies } = setupInspectorCommands({
      cmdBlocks: [
        buildBlock("ok", "pwd", "ok", 0),
      ],
      selectedBlockId: null,
      inspectorAnalyzeCache: null,
    });

    act(() => {
      result.current.analyzeInspectorFailedBlock();
      result.current.copyInspectorFailedOutput();
      result.current.copyInspectorAnalyzePrompt();
    });

    expect(spies.closeInspectorCommandMenu).not.toHaveBeenCalled();
    expect(spies.setInspectorAnalyzeCache).not.toHaveBeenCalled();
    expect(spies.handleAskAI).not.toHaveBeenCalled();
  });

  it("AI 분석 프롬프트 복사 실패 시 실패 알림을 표시한다", async () => {
    const { result, spies } = setupInspectorCommands({
      cmdBlocks: [
        buildBlock("b", "cat missing", "err", 1),
      ],
      selectedBlockId: "b",
    });

    writeText.mockRejectedValueOnce(new Error("clipboard denied"));

    await act(async () => {
      await result.current.copyInspectorAnalyzePrompt("b");
    });

    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "AI 분석 프롬프트 복사 실패",
      body: "클립보드 접근 권한을 확인해 주세요.",
    }));
  });

  it("실패 로그 복사 실패 시 실패 알림을 표시한다", async () => {
    const { result, spies } = setupInspectorCommands({
      cmdBlocks: [
        buildBlock("b", "npm test", "err", 1),
      ],
      selectedBlockId: "b",
    });

    writeText.mockRejectedValueOnce(new Error("clipboard denied"));

    await act(async () => {
      await result.current.copyInspectorFailedOutput("b");
    });

    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "실패 로그 복사 실패",
      body: "클립보드 접근 권한을 확인해 주세요.",
    }));
  });

  it("선택 블록이 없거나 실패 블록이 아니면 최근 실패 블록으로 분석 프롬프트를 생성한다", () => {
    const { result, spies } = setupInspectorCommands({
      cmdBlocks: [
        buildBlock("ok-1", "pwd", "ok", 0),
        buildBlock("fail-1", "cat missing", "err", 1),
        buildBlock("ok-2", "echo hi", "ok", 0),
      ],
      selectedBlockId: "ok-2",
    });

    act(() => {
      result.current.analyzeInspectorFailedBlock("nonexistent");
    });

    const arg = spies.setInspectorAnalyzeCache.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      blockId: "fail-1",
      command: "cat missing",
      status: "streaming",
    });
    expect(spies.handleAskAI).toHaveBeenCalledWith(expect.stringContaining("Command: cat missing"));
  });

  it("추천 커맨드 복사는 클립보드에 반영되고 메뉴를 닫는다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok", "rm -rf /tmp"],
      },
    });

    await act(async () => {
      await result.current.copyInspectorSuggestedCommand(0);
    });

    expect(writeText).toHaveBeenCalledWith("echo ok");
    expect(spies.closeInspectorCommandMenu).toHaveBeenCalledWith(true);
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "추천 커맨드 복사 완료",
    }));
  });

  it("추천 커맨드가 없으면 복사 실패 알림만 발생한다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok"],
      },
    });

    await act(async () => {
      await result.current.copyInspectorSuggestedCommand(4);
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(spies.closeInspectorCommandMenu).not.toHaveBeenCalled();
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "복사할 커맨드 없음",
    }));
  });

  it("applyInspectorAnalyzeCommand는 안전도 Blocked일 때 PTY 실행하지 않는다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["dangerous --force"],
      },
      verifyLevel: "Blocked",
      verifyReason: "policy deny",
    });

    await act(async () => {
      await result.current.applyInspectorAnalyzeCommand(0);
    });

    expect(spies.verifyCommandSafety).toHaveBeenCalledWith("dangerous --force");
    expect(spies.ptyWrite).not.toHaveBeenCalled();
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "차단된 커맨드",
    }));
  });

  it("applyInspectorAnalyzeCommand는 안전도 Dangerous일 때 실행하지 않고 AI 입력바로 전환한다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["rm -rf /tmp"],
      },
      verifyLevel: "Dangerous",
      verifyReason: "need review",
    });

    await act(async () => {
      await result.current.applyInspectorAnalyzeCommand(0);
    });

    expect(spies.verifyCommandSafety).toHaveBeenCalledWith("rm -rf /tmp");
    expect(spies.ptyWrite).not.toHaveBeenCalled();
    expect(spies.setAiInput).toHaveBeenCalledWith("rm -rf /tmp");
    expect(spies.setShowAiBar).toHaveBeenCalledWith(true);
    expect(spies.setViewMode).toHaveBeenCalledWith("terminal");
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "위험 커맨드 감지",
    }));
  });

  it("handleInspectorSuggestedCommandRowKeyDown는 compact 모드가 아니면 무시한다", () => {
    const { result } = setupInspectorCommands({
      isInspectorCompact: false,
    });

    const e = {
      key: "r",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.handleInspectorSuggestedCommandRowKeyDown(e, 0);
    });

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("handleInspectorSuggestedCommandRowKeyDown에서 rowIndex가 범위를 벗어난 run은 적용할 커맨드 없음으로 처리한다", () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok"],
      },
      inspectorCommandMenuIndex: 0,
      isInspectorCompact: true,
    });

    const e = {
      key: "r",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.handleInspectorSuggestedCommandRowKeyDown(e, 9);
    });

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "적용할 커맨드 없음",
      body: "10번 추천 커맨드를 찾지 못했습니다.",
    }));
  });

  it("handleInspectorSuggestedCommandRowKeyDown는 run 키면 제안 커맨드를 실행한다", () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok"],
      },
      inspectorCommandMenuIndex: 0,
      isInspectorCompact: true,
      verifyLevel: "Warning",
    });

    const e = {
      key: "r",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.handleInspectorSuggestedCommandRowKeyDown(e, 0);
    });

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(spies.setAiInput).not.toHaveBeenCalled();
    expect(spies.ptyWrite).toHaveBeenCalledWith("echo ok\r");
  });

  it("handleInspectorSuggestedCommandRowKeyDown는 copy 키면 추천 커맨드를 클립보드에 복사한다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok"],
      },
      inspectorCommandMenuIndex: 0,
      isInspectorCompact: true,
    });

    const e = {
      key: "c",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>;

    await act(async () => {
      result.current.handleInspectorSuggestedCommandRowKeyDown(e, 0);
      await Promise.resolve();
    });

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(spies.closeInspectorCommandMenu).toHaveBeenCalledWith(true);
    expect(writeText).toHaveBeenCalledWith("echo ok");
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "추천 커맨드 복사 완료",
    }));
  });

  it("handleInspectorSuggestedCommandRowKeyDown는 load 키면 추천 커맨드를 AI 입력바로 로드한다", () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok"],
      },
      inspectorCommandMenuIndex: 0,
      isInspectorCompact: true,
    });

    const e = {
      key: "l",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.handleInspectorSuggestedCommandRowKeyDown(e, 0);
    });

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(spies.setAiInput).toHaveBeenCalledWith("echo ok");
    expect(spies.setShowAiBar).toHaveBeenCalledWith(true);
    expect(spies.setViewMode).toHaveBeenCalledWith("terminal");
  });

  it("스트리밍 분석 캐시가 완료 응답을 받으면 done 상태와 추천 커맨드가 갱신된다", async () => {
    const { result } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 10,
        status: "streaming",
        result: "",
        rawResult: "",
        suggestedCommands: [],
      },
    });

    const assistantMessage: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      timestamp: 12,
      content: [
        "```bash",
        "echo one",
        "rm -rf /tmp",
        "```",
      ].join("\n"),
    };

    await act(async () => {
      result.current.setAiChat({
        messages: [assistantMessage],
        streaming: false,
      });
      await Promise.resolve();
    });

    expect(result.current.inspectorAnalyzeCache).toMatchObject({
      status: "done",
      suggestedCommands: ["echo one", "rm -rf /tmp"],
    });
  });

  it("스트리밍 분석 결과가 에러 응답이면 status가 error로 바뀐다", async () => {
    const { result } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 10,
        status: "streaming",
        result: "",
        rawResult: "",
        suggestedCommands: [],
      },
    });

    const assistantMessage: ChatMessage = {
      id: "assistant-2",
      role: "assistant",
      timestamp: 12,
      content: "❌ 분석할 수 없습니다",
    };

    await act(async () => {
      result.current.setAiChat({
        messages: [assistantMessage],
        streaming: false,
      });
      await Promise.resolve();
    });

    expect(result.current.inspectorAnalyzeCache).toMatchObject({
      status: "error",
      result: "❌ 분석할 수 없습니다",
      rawResult: "❌ 분석할 수 없습니다",
    });
  });

  it("추천 커맨드 로드가 AI 입력바로 반영된다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok"],
      },
    });

    act(() => {
      result.current.loadInspectorSuggestedCommandToAiBar(0);
    });

    expect(spies.setAiInput).toHaveBeenCalledWith("echo ok");
    expect(spies.setShowAiBar).toHaveBeenCalledWith(true);
    expect(spies.setViewMode).toHaveBeenCalledWith("terminal");
    expect(spies.closeInspectorCommandMenu).toHaveBeenCalledTimes(1);
    expect(spies.closeInspector).toHaveBeenCalledTimes(1);
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "추천 커맨드 로드됨",
    }));
  });

  it("copyInspectorAnalyzeResult는 분석 캐시가 있을 때 텍스트를 클립보드에 복사한다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "요약 결과",
        rawResult: "원문결과",
        suggestedCommands: ["echo ok"],
      },
    });

    await act(async () => {
      await result.current.copyInspectorAnalyzeResult();
    });

    expect(writeText).toHaveBeenCalledWith([
      "Command: bad",
      "Status: DONE",
      "",
      "원문결과",
    ].join("\n"));
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "AI 분석 결과 복사 완료",
    }));
  });

  it("copyInspectorAnalyzeResult 복사 실패 시 실패 알림을 표시한다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "요약 결과",
        rawResult: "원문결과",
        suggestedCommands: ["echo ok"],
      },
    });

    writeText.mockRejectedValueOnce(new Error("clipboard denied"));

    await act(async () => {
      await result.current.copyInspectorAnalyzeResult();
    });

    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "AI 분석 결과 복사 실패",
      body: "클립보드 접근 권한을 확인해 주세요.",
    }));
  });

  it("copyInspectorAnalyzeResult는 캐시가 없으면 동작하지 않는다", async () => {
    const { result, spies } = setupInspectorCommands({ inspectorAnalyzeCache: null });

    await act(async () => {
      await result.current.copyInspectorAnalyzeResult();
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(spies.notifCenter.addNotification).not.toHaveBeenCalled();
  });

  it("추천 커맨드 적용 후 안전도가 Safe면 PTY로 실행된다", async () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: ["echo ok"],
      },
      verifyLevel: "Safe",
    });

    await act(async () => {
      await result.current.applyInspectorAnalyzeCommand(0);
    });

    expect(spies.verifyCommandSafety).toHaveBeenCalledWith("echo ok");
    expect(spies.ptyWrite).toHaveBeenCalledWith("echo ok\r");
    expect(spies.setAiInput).not.toHaveBeenCalled();
    expect(spies.notifCenter.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "추천 커맨드 실행됨",
    }));
  });

  it("clearInspectorAnalyzeCache는 캐시를 초기화하고 커맨드 메뉴를 닫는다", () => {
    const { result, spies } = setupInspectorCommands({
      inspectorAnalyzeCache: {
        blockId: "b",
        command: "bad",
        requestedAt: 1,
        status: "done",
        result: "",
        rawResult: "",
        suggestedCommands: [],
      },
    });

    act(() => {
      result.current.clearInspectorAnalyzeCache();
    });

    expect(spies.setInspectorAnalyzeCache).toHaveBeenCalledWith(null);
    expect(spies.closeInspectorCommandMenu).toHaveBeenCalledWith(undefined);
  });
});
