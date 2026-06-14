import { useCallback, useEffect, type Dispatch, type KeyboardEvent, type MutableRefObject, type SetStateAction } from "react";
import type { CommandBlock } from "./useCommandBlocks";
import type { ChatMessage } from "./useAIChat";
import { extractInspectorAnalyzeCommands } from "../utils/inspectorAnalyze";
import { resolveInspectorMenuHotkey } from "../utils/inspectorMenuHotkeys";
import type { InspectorAnalyzeCache } from "../components/InspectorPanel/types";

type SafetyLevel = "Safe" | "Warning" | "Dangerous" | "Blocked";
type ViewMode = "terminal" | "canvas" | "list";

type NotifCenter = {
  addNotification: (n: {
    type: "command";
    title: string;
    body: string;
  }) => void;
};

type TabMeta = {
  id: string;
  cwd?: string | null;
};

interface UseInspectorPanelCommandsOptions {
  cmdBlocks: readonly CommandBlock[];
  selectedBlockId: string | null;
  setSelectedBlockId: Dispatch<SetStateAction<string | null>>;
  setDismissedBlockId: Dispatch<SetStateAction<string | null>>;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setAiInput: Dispatch<SetStateAction<string>>;
  setShowAiBar: Dispatch<SetStateAction<boolean>>;
  aiInputRef: MutableRefObject<HTMLInputElement | null>;
  tabs: readonly TabMeta[];
  activeTabIdRef: MutableRefObject<string>;
  handleAskAI: (question: string) => void;
  aiChat: { messages: readonly ChatMessage[]; streaming: boolean };
  inspectorAnalyzeCache: InspectorAnalyzeCache | null;
  setInspectorAnalyzeCache: Dispatch<SetStateAction<InspectorAnalyzeCache | null>>;
  closeInspector: () => void;
  closeInspectorCommandMenu: (restoreFocus?: boolean) => void;
  isInspectorCompact: boolean;
  inspectorCommandMenuIndex: number | null;
  ptyWriteRefs: MutableRefObject<Map<string, (data: string) => void>>;
  activePaneIdRef: MutableRefObject<string>;
  verifyCommandSafety: (command: string) => Promise<{ level: SafetyLevel; reason: string }>;
  notifCenter: NotifCenter;
}

interface UseInspectorPanelCommandsResult {
  selectInspectorBlock: (blockId: string) => void;
  rerunInspectorBlock: (command: string) => void;
  analyzeInspectorFailedBlock: (blockId?: string) => void;
  copyInspectorFailedOutput: (blockId?: string) => Promise<void>;
  copyInspectorAnalyzePrompt: (blockId?: string) => Promise<void>;
  loadInspectorAnalyzePromptToAiBar: (blockId?: string) => void;
  copyInspectorAnalyzeResult: () => Promise<void>;
  copyInspectorSuggestedCommand: (commandIndex: number) => Promise<void>;
  handleInspectorSuggestedCommandRowKeyDown: (
    e: KeyboardEvent<HTMLDivElement>,
    rowIndex: number,
  ) => void;
  loadInspectorSuggestedCommandToAiBar: (commandIndex: number) => void;
  applyInspectorAnalyzeCommand: (commandIndex?: number) => Promise<void>;
  clearInspectorAnalyzeCache: () => void;
}

function summarizeAssistantResult(content: string, maxChars = 520): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

export function useInspectorPanelCommands({
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
}: UseInspectorPanelCommandsOptions): UseInspectorPanelCommandsResult {
  const resolveInspectorFailedBlock = useCallback((blockId?: string) => {
    const failed = cmdBlocks.filter(
      (b) => b.exitCode !== null && b.exitCode !== 0 && b.command.trim() !== "",
    );
    if (failed.length === 0) return null;
    const selected = blockId
      ? failed.find((b) => b.id === blockId)
      : (selectedBlockId ? failed.find((b) => b.id === selectedBlockId) : null);
    return selected ?? failed[failed.length - 1];
  }, [cmdBlocks, selectedBlockId]);

  const buildFailedAnalyzePrompt = useCallback((target: CommandBlock, cwd?: string) => {
    const outputSnippet = target.output.trim().slice(-3000);
    return [
      "아래 실패한 터미널 실행을 분석해줘.",
      "1) 실패 원인 요약",
      "2) 바로 실행할 수정 커맨드 3개",
      "3) 재발 방지 체크포인트",
      "",
      `Command: ${target.command}`,
      `Exit Code: ${target.exitCode}`,
      cwd ? `CWD: ${cwd}` : "",
      "",
      "Output:",
      outputSnippet || "(출력이 비어 있음)",
    ].filter(Boolean).join("\n");
  }, []);

  const analyzeInspectorFailedBlock = useCallback((blockId?: string) => {
    const target = resolveInspectorFailedBlock(blockId);
    if (!target) return;
    const currentTab = tabs.find((t) => t.id === activeTabIdRef.current);
    const prompt = buildFailedAnalyzePrompt(target, currentTab?.cwd ?? undefined);
    const requestedAt = Date.now();
    closeInspectorCommandMenu();
    setInspectorAnalyzeCache({
      blockId: target.id,
      command: target.command,
      requestedAt,
      status: "streaming",
      result: "",
      rawResult: "",
      suggestedCommands: [],
    });
    handleAskAI(prompt);
    setViewMode("terminal");
  }, [
    resolveInspectorFailedBlock,
    tabs,
    activeTabIdRef,
    buildFailedAnalyzePrompt,
    handleAskAI,
    setInspectorAnalyzeCache,
    closeInspectorCommandMenu,
    setViewMode,
  ]);

  const copyInspectorFailedOutput = useCallback(async (blockId?: string) => {
    const target = resolveInspectorFailedBlock(blockId);
    if (!target) return;
    const payload = [
      `Command: ${target.command}`,
      `Exit Code: ${target.exitCode}`,
      "",
      "Output:",
      target.output || "(출력이 비어 있음)",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      notifCenter.addNotification({
        type: "command",
        title: "실패 로그 복사 완료",
        body: `${target.command.slice(0, 56)}${target.command.length > 56 ? "…" : ""}`,
      });
    } catch {
      notifCenter.addNotification({
        type: "command",
        title: "실패 로그 복사 실패",
        body: "클립보드 접근 권한을 확인해 주세요.",
      });
    }
  }, [notifCenter, resolveInspectorFailedBlock]);

  const copyInspectorAnalyzePrompt = useCallback(async (blockId?: string) => {
    const target = resolveInspectorFailedBlock(blockId);
    if (!target) return;
    const currentTab = tabs.find((t) => t.id === activeTabIdRef.current);
    const prompt = buildFailedAnalyzePrompt(target, currentTab?.cwd ?? undefined);
    try {
      await navigator.clipboard.writeText(prompt);
      notifCenter.addNotification({
        type: "command",
        title: "AI 분석 프롬프트 복사 완료",
        body: `${target.command.slice(0, 56)}${target.command.length > 56 ? "…" : ""}`,
      });
    } catch {
      notifCenter.addNotification({
        type: "command",
        title: "AI 분석 프롬프트 복사 실패",
        body: "클립보드 접근 권한을 확인해 주세요.",
      });
    }
  }, [resolveInspectorFailedBlock, tabs, activeTabIdRef, buildFailedAnalyzePrompt, notifCenter]);

  useEffect(() => {
    if (!inspectorAnalyzeCache || inspectorAnalyzeCache.status !== "streaming") return;
    const latestAssistant = [...aiChat.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.timestamp >= inspectorAnalyzeCache.requestedAt && m.content.trim() !== "");
    if (!latestAssistant) return;

    const isDone = !aiChat.streaming;
    if (!isDone) return;

    const isError = latestAssistant.content.trim().startsWith("❌");
    const suggestedCommands = extractInspectorAnalyzeCommands(latestAssistant.content, 3);
    setInspectorAnalyzeCache((prev) => {
      if (!prev || prev.requestedAt !== inspectorAnalyzeCache.requestedAt) return prev;
      return {
        ...prev,
        status: isError ? "error" : "done",
        result: summarizeAssistantResult(latestAssistant.content),
        rawResult: latestAssistant.content.trim(),
        suggestedCommands,
      };
    });
  }, [aiChat.messages, aiChat.streaming, inspectorAnalyzeCache, setInspectorAnalyzeCache]);

  const loadInspectorAnalyzePromptToAiBar = useCallback((blockId?: string) => {
    const target = resolveInspectorFailedBlock(blockId);
    if (!target) return;
    const currentTab = tabs.find((t) => t.id === activeTabIdRef.current);
    const prompt = buildFailedAnalyzePrompt(target, currentTab?.cwd ?? undefined);
    setAiInput(prompt);
    setShowAiBar(true);
    setViewMode("terminal");
    closeInspector();
    setTimeout(() => aiInputRef.current?.focus(), 50);
    notifCenter.addNotification({
      type: "command",
      title: "AI 분석 프롬프트 로드됨",
      body: "AI 입력바에서 수정 후 Enter로 실행하세요.",
    });
  }, [
    closeInspector,
    resolveInspectorFailedBlock,
    tabs,
    activeTabIdRef,
    buildFailedAnalyzePrompt,
    setAiInput,
    setShowAiBar,
    setViewMode,
    aiInputRef,
    notifCenter,
  ]);

  const copyInspectorAnalyzeResult = useCallback(async () => {
    if (!inspectorAnalyzeCache) return;
    const payload = [
      `Command: ${inspectorAnalyzeCache.command}`,
      `Status: ${inspectorAnalyzeCache.status.toUpperCase()}`,
      "",
      inspectorAnalyzeCache.rawResult || inspectorAnalyzeCache.result || "(응답 없음)",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      notifCenter.addNotification({
        type: "command",
        title: "AI 분석 결과 복사 완료",
        body: `${inspectorAnalyzeCache.command.slice(0, 56)}${inspectorAnalyzeCache.command.length > 56 ? "…" : ""}`,
      });
    } catch {
      notifCenter.addNotification({
        type: "command",
        title: "AI 분석 결과 복사 실패",
        body: "클립보드 접근 권한을 확인해 주세요.",
      });
    }
  }, [inspectorAnalyzeCache, notifCenter]);

  const copyInspectorSuggestedCommand = useCallback(async (commandIndex: number) => {
    const cmd = inspectorAnalyzeCache?.suggestedCommands[commandIndex]?.trim() ?? "";
    if (!cmd) {
      notifCenter.addNotification({
        type: "command",
        title: "복사할 커맨드 없음",
        body: `${commandIndex + 1}번 추천 커맨드를 찾지 못했습니다.`,
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(cmd);
      closeInspectorCommandMenu(true);
      notifCenter.addNotification({
        type: "command",
        title: "추천 커맨드 복사 완료",
        body: `[${commandIndex + 1}] ${cmd}`,
      });
    } catch {
      notifCenter.addNotification({
        type: "command",
        title: "추천 커맨드 복사 실패",
        body: "클립보드 접근 권한을 확인해 주세요.",
      });
    }
  }, [closeInspectorCommandMenu, inspectorAnalyzeCache, notifCenter]);

  const loadInspectorSuggestedCommandToAiBar = useCallback((commandIndex: number) => {
    const cmd = inspectorAnalyzeCache?.suggestedCommands[commandIndex]?.trim() ?? "";
    if (!cmd) {
      notifCenter.addNotification({
        type: "command",
        title: "로드할 커맨드 없음",
        body: `${commandIndex + 1}번 추천 커맨드를 찾지 못했습니다.`,
      });
      return;
    }
    setAiInput(cmd);
    setShowAiBar(true);
    setViewMode("terminal");
    closeInspectorCommandMenu();
    closeInspector();
    setTimeout(() => aiInputRef.current?.focus(), 50);
    notifCenter.addNotification({
      type: "command",
      title: "추천 커맨드 로드됨",
      body: `[${commandIndex + 1}] AI 입력바에서 수정 후 실행하세요.`,
    });
  }, [
    closeInspector,
    inspectorAnalyzeCache,
    closeInspectorCommandMenu,
    setAiInput,
    setShowAiBar,
    setViewMode,
    aiInputRef,
    notifCenter,
  ]);

  const applyInspectorAnalyzeCommand = useCallback(async (commandIndex = 0) => {
    if (!inspectorAnalyzeCache || inspectorAnalyzeCache.status !== "done") return;
    const nextCommand = inspectorAnalyzeCache.suggestedCommands[commandIndex]?.trim() ?? "";
    if (!nextCommand) {
      notifCenter.addNotification({
        type: "command",
        title: "적용할 커맨드 없음",
        body: `${commandIndex + 1}번 추천 커맨드를 찾지 못했습니다.`,
      });
      return;
    }

    try {
      const report = await verifyCommandSafety(nextCommand);
      if (report.level === "Blocked") {
        notifCenter.addNotification({
          type: "command",
          title: "차단된 커맨드",
          body: report.reason,
        });
        return;
      }
      if (report.level === "Dangerous") {
        setAiInput(nextCommand);
        setShowAiBar(true);
        setViewMode("terminal");
        closeInspectorCommandMenu();
        closeInspector();
        setTimeout(() => aiInputRef.current?.focus(), 50);
        notifCenter.addNotification({
          type: "command",
          title: "위험 커맨드 감지",
          body: "자동 실행하지 않고 AI 입력바로만 로드했습니다.",
        });
        return;
      }
      ptyWriteRefs.current.get(activePaneIdRef.current)?.(`${nextCommand}\r`);
      setViewMode("terminal");
      closeInspectorCommandMenu();
      closeInspector();
      notifCenter.addNotification({
        type: "command",
        title: report.level === "Warning" ? "경고 커맨드 실행됨" : "추천 커맨드 실행됨",
        body: `[${commandIndex + 1}] ${nextCommand}`,
      });
    } catch {
      notifCenter.addNotification({
        type: "command",
        title: "커맨드 실행 실패",
        body: "안전도 검사 또는 PTY 전송 중 오류가 발생했습니다.",
      });
    }
  }, [
    activePaneIdRef,
    closeInspector,
    closeInspectorCommandMenu,
    inspectorAnalyzeCache,
    notifCenter,
    ptyWriteRefs,
    setAiInput,
    setShowAiBar,
    setViewMode,
    aiInputRef,
    verifyCommandSafety,
  ]);

  const handleInspectorSuggestedCommandRowKeyDown = useCallback((
    e: KeyboardEvent<HTMLDivElement>,
    rowIndex: number,
  ) => {
    if (!isInspectorCompact) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const action = resolveInspectorMenuHotkey(
      e.key,
      inspectorCommandMenuIndex === rowIndex,
    );
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action === "run") {
      applyInspectorAnalyzeCommand(rowIndex);
      return;
    }
    if (action === "copy") {
      copyInspectorSuggestedCommand(rowIndex);
      return;
    }
    loadInspectorSuggestedCommandToAiBar(rowIndex);
  }, [
    applyInspectorAnalyzeCommand,
    copyInspectorSuggestedCommand,
    isInspectorCompact,
    inspectorCommandMenuIndex,
    loadInspectorSuggestedCommandToAiBar,
  ]);

  const clearInspectorAnalyzeCache = useCallback(() => {
    setInspectorAnalyzeCache(null);
    closeInspectorCommandMenu();
  }, [setInspectorAnalyzeCache, closeInspectorCommandMenu]);

  const selectInspectorBlock = useCallback((blockId: string) => {
    setViewMode("terminal");
    setSelectedBlockId(blockId);
    setDismissedBlockId(null);
  }, [setSelectedBlockId, setDismissedBlockId, setViewMode]);

  const rerunInspectorBlock = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    ptyWriteRefs.current.get(activePaneIdRef.current)?.(`${trimmed}\r`);
  }, [activePaneIdRef, ptyWriteRefs]);

  return {
    selectInspectorBlock,
    rerunInspectorBlock,
    analyzeInspectorFailedBlock,
    copyInspectorFailedOutput,
    copyInspectorAnalyzePrompt,
    loadInspectorAnalyzePromptToAiBar,
    copyInspectorAnalyzeResult,
    copyInspectorSuggestedCommand,
    handleInspectorSuggestedCommandRowKeyDown,
    loadInspectorSuggestedCommandToAiBar,
    applyInspectorAnalyzeCommand,
    clearInspectorAnalyzeCache,
  };
}
