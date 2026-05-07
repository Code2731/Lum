import React, { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { shortPath } from "./utils";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import { useHardwareSpecs } from "./hooks/useHardwareSpecs";
import { useCommandBlocks, type CommandBlock } from "./hooks/useCommandBlocks";
import { useTabManager, splitId } from "./hooks/useTabManager";
import { useAutoHealing } from "./hooks/useAutoHealing";
import { usePanelVisibility } from "./hooks/usePanelVisibility";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { useTerminalTheme } from "./hooks/useTerminalTheme";
import { useQuickActions } from "./hooks/useQuickActions";
import { useCommandNotifier } from "./hooks/useCommandNotifier";
import { useWorkspace } from "./hooks/useWorkspace";
import { inferTabIcon } from "./utils/tabIcon";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import {
  Zap, Cpu, Loader2, TerminalSquare,
  Package, Plus, X, Columns2, Rows2, ArrowUpCircle,
  GitBranch, Container, Lock,
} from "lucide-react";
import { useReactAgent } from "./hooks/useReactAgent";
import { useAIChat } from "./hooks/useAIChat";
import { useEnvAutoDetector } from "./hooks/useEnvAutoDetector";
import EnvSuggestionToast from "./components/EnvSuggestionToast";
import { useScriptLibrary } from "./hooks/useScriptLibrary";
import ScriptLibraryPanel from "./components/ScriptLibraryPanel";
import SystemMonitorPanel from "./components/SystemMonitorPanel";
import { useNotificationCenter } from "./hooks/useNotificationCenter";
import { usePrivacyLedger } from "./hooks/usePrivacyLedger";
import { useSquads } from "./hooks/useSquads";
import type { SshProfile } from "./hooks/useTabManager";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import TerminalPane from "./components/TerminalPane";
import HealingPanel from "./components/HealingPanel";
import RagPanel from "./components/RagPanel";
import CommandBlockBar from "./components/CommandBlockBar";
import QuickActionsBar from "./components/QuickActionsBar";
import ResizeHandles from "./components/ResizeHandles";
import WarpListView from "./components/WarpListView";
import FileExplorerPanel from "./components/FileExplorerPanel";
import AppHeader from "./components/AppHeader";
import AppOverlays from "./components/AppOverlays";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TAB_COLORS } from "./hooks/useTabManager";

const ReactAgentPanel = lazy(() => import("./components/ReactAgentPanel"));

type ViewMode = "terminal" | "canvas" | "list";

interface GitTabInfo {
  branch: string;
  changed: number;
}

interface RetryComparePending {
  command: string;
  baselineOutput: string;
  queuedAt: number;
}
interface RetryCompareTask {
  id: string;
  command: string;
  baselineOutput: string;
}

interface RetryCompareResult {
  added: number;
  removed: number;
  preview: string;
  addedLines: string[];
  removedLines: string[];
  comparedAt: number;
}
const RETRY_COMPARE_STORAGE_KEY = "lum.retryCompareByBlock.v1";
const RETRY_COMPARE_RUNTIME_STORAGE_KEY = "lum.retryCompareRuntime.v1";
interface RetryCompareRuntimeCache {
  queue: RetryCompareTask[];
  paused: boolean;
  completedCount: number;
}
function loadRetryCompareCache(): Record<string, RetryCompareResult> {
  try {
    const raw = localStorage.getItem(RETRY_COMPARE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const byBlock = (parsed as { byBlock?: unknown }).byBlock;
    if (!byBlock || typeof byBlock !== "object") return {};
    return byBlock as Record<string, RetryCompareResult>;
  } catch {
    return {};
  }
}
function saveRetryCompareCache(byBlock: Record<string, RetryCompareResult>): void {
  try {
    localStorage.setItem(RETRY_COMPARE_STORAGE_KEY, JSON.stringify({ byBlock }));
  } catch {
    // noop
  }
}
function loadRetryCompareRuntimeCache(): RetryCompareRuntimeCache {
  try {
    const raw = localStorage.getItem(RETRY_COMPARE_RUNTIME_STORAGE_KEY);
    if (!raw) return { queue: [], paused: false, completedCount: 0 };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { queue: [], paused: false, completedCount: 0 };
    const obj = parsed as { queue?: unknown; paused?: unknown; completedCount?: unknown };
    const queue = Array.isArray(obj.queue)
      ? obj.queue.filter((x): x is RetryCompareTask => {
        if (!x || typeof x !== "object") return false;
        const v = x as Partial<RetryCompareTask>;
        return typeof v.id === "string" && typeof v.command === "string" && typeof v.baselineOutput === "string";
      })
      : [];
    const paused = typeof obj.paused === "boolean" ? obj.paused : false;
    const completedCount = typeof obj.completedCount === "number" && Number.isFinite(obj.completedCount)
      ? Math.max(0, Math.floor(obj.completedCount))
      : 0;
    return { queue, paused, completedCount };
  } catch {
    return { queue: [], paused: false, completedCount: 0 };
  }
}
function saveRetryCompareRuntimeCache(cache: RetryCompareRuntimeCache): void {
  try {
    localStorage.setItem(RETRY_COMPARE_RUNTIME_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // noop
  }
}

function parseGitTabInfo(ctx: string): GitTabInfo | null {
  if (!ctx) return null;
  const statusHeader = "$ git status";
  const idx = ctx.indexOf(statusHeader);
  if (idx < 0) return null;

  const lines = ctx
    .slice(idx + statusHeader.length)
    .trimStart()
    .split(/\r?\n/);
  if (lines.length === 0) return null;

  const head = lines[0]?.trim() ?? "";
  if (!head.startsWith("## ")) return null;

  const branch = head
    .slice(3)
    .split("...")[0]
    .replace(/\s+\[.*\]$/, "")
    .trim();
  if (!branch) return null;

  let changed = 0;
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("$ ")) break;
    changed += 1;
  }

  return { branch, changed };
}

function summarizeOutputDiff(before: string, after: string): {
  added: number;
  removed: number;
  preview: string;
  addedLines: string[];
  removedLines: string[];
} {
  const beforeLines = before.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== "");
  const afterLines = after.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== "");
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const addedLines = afterLines.filter((l) => !beforeSet.has(l));
  const removedLines = beforeLines.filter((l) => !afterSet.has(l));

  const preview = [
    ...addedLines.slice(0, 2).map((l) => `+ ${l}`),
    ...removedLines.slice(0, 2).map((l) => `- ${l}`),
  ].join(" | ");

  return {
    added: addedLines.length,
    removed: removedLines.length,
    preview,
    addedLines: addedLines.slice(0, 20),
    removedLines: removedLines.slice(0, 20),
  };
}

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, analyzeError, streamAICommand } = useAIProcessing();
  const { specs, loading: specsLoading } = useHardwareSpecs();
  const { blocks: cmdBlocks, feedRaw } = useCommandBlocks();
  useCommandNotifier(cmdBlocks);

  // 임베디드 mistralrs 모델 (Phase 85b/88/92 통합) — 헤더/툴바 표시용
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [heavyModelId, setHeavyModelId] = useState<string | null>(null);
  const [heavyEnabled, setHeavyEnabled] = useState(false);

  // 임베디드 모델 우선 — embed_loaded_info는 "{dir}/{file}" 반환, 파일명만 추출.
  // 미로드 시 외부 OpenAI 호환 서버(Gemini/원격 mistralrs) model id 폴백.
  const refreshLoadedModel = useCallback(async () => {
    try {
      const key = await invoke<string | null>("embed_loaded_info");
      if (key) { setLoadedModelId(shortPath(key)); return; }
    } catch {}
    try {
      const info = await invoke<{ id: string }>("get_xllm_model_info");
      setLoadedModelId(info?.id && info.id !== "unknown" ? info.id : null);
    } catch {
      setLoadedModelId(null);
    }
  }, []);

  const refreshHeavyConfig = useCallback(() => {
    invoke<{ mistral_rs_enabled?: boolean; mistral_rs_model?: string }>("load_app_config")
      .then((c) => {
        setHeavyEnabled(c.mistral_rs_enabled ?? false);
        setHeavyModelId(c.mistral_rs_model ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshLoadedModel();
    refreshHeavyConfig();
    // 폴링은 30초마다 안전망용으로만 (이벤트가 주된 갱신)
    const t = setInterval(refreshLoadedModel, 30000);
    return () => clearInterval(t);
  }, [refreshLoadedModel, refreshHeavyConfig]);

  // 임베디드 모델 로드/언로드 이벤트(Phase 89) + 설정 저장 시 즉시 갱신.
  useEffect(() => {
    const a = listen<unknown>("embed_load_progress", () => refreshLoadedModel());
    const b = listen<unknown>("xllm_settings_saved", () => { refreshLoadedModel(); refreshHeavyConfig(); });
    return () => {
      a.then((f: () => void) => f());
      b.then((f: () => void) => f());
    };
  }, [refreshLoadedModel, refreshHeavyConfig]);

  // Phase 72 — 추론 토큰 표시 전역 토글 (툴바 + XllmPanel 공통 상태)
  const [showReasoning, setShowReasoning] = useState(true);
  const [visionEnabled, setVisionEnabled] = useState(false);
  // Phase 121: 툴바 고급 기능 표시 모드 (기본 false — "더보기" 팝오버에 숨김).
  const [toolbarShowAdvanced, setToolbarShowAdvanced] = useState(false);
  const [showAdvancedOverflow, setShowAdvancedOverflow] = useState(false);
  // Phase 126: 사용자가 클릭한 "신규" 기능 ID 누적. 미클릭 항목엔 NEW 라벨.
  const [seenAdvancedFeatures, setSeenAdvancedFeatures] = useState<string[]>([]);
  useEffect(() => {
    invoke<{
      show_reasoning?: boolean;
      vision_enabled?: boolean;
      toolbar_show_advanced?: boolean;
      ui_show_file_explorer?: boolean;
      ui_hints_shown?: boolean;
      ui_seen_advanced_features?: string[];
    }>("load_app_config")
      .then(async (c) => {
        setShowReasoning(c.show_reasoning ?? true);
        setVisionEnabled(c.vision_enabled ?? false);
        setToolbarShowAdvanced(c.toolbar_show_advanced ?? false);
        setSeenAdvancedFeatures(c.ui_seen_advanced_features ?? []);

        // Phase 126 — UI 환경설정 통합. config가 있으면 그 값, 없으면 localStorage에서 1회 마이그레이션.
        const migrate: { showFileExplorer?: boolean; hintsShown?: boolean } = {};
        if (c.ui_show_file_explorer != null) {
          setShowFileExplorer(c.ui_show_file_explorer);
        } else {
          try {
            const raw = localStorage.getItem("lum.fileExplorer");
            if (raw != null) migrate.showFileExplorer = raw !== "0";
          } catch { /* noop */ }
        }
        if (c.ui_hints_shown != null) {
          setShowWelcome(!c.ui_hints_shown);
        } else {
          try {
            const raw = localStorage.getItem("lum.hintsShown");
            if (raw != null) migrate.hintsShown = raw === "1";
          } catch { /* noop */ }
        }
        if (Object.keys(migrate).length > 0) {
          try {
            await invoke("save_ui_preferences", migrate);
            try { localStorage.removeItem("lum.fileExplorer"); } catch { /* noop */ }
            try { localStorage.removeItem("lum.hintsShown"); } catch { /* noop */ }
          } catch { /* noop */ }
        }
      })
      .catch(() => {});
  }, []);
  const toggleToolbarAdvanced = useCallback(async () => {
    const next = !toolbarShowAdvanced;
    setToolbarShowAdvanced(next);
    if (next) setShowAdvancedOverflow(false);
    try {
      await invoke("save_toolbar_show_advanced", { show: next });
    } catch { /* noop */ }
  }, [toolbarShowAdvanced]);
  const handleMarkAdvancedSeen = useCallback((id: string) => {
    setSeenAdvancedFeatures((prev) => (prev.includes(id) ? prev : [...prev, id]));
    invoke("mark_advanced_feature_seen", { featureId: id }).catch(() => {});
  }, []);
  const toggleReasoning = useCallback(async () => {
    const next = !showReasoning;
    setShowReasoning(next);
    try {
      const cfg = await invoke<{ vision_enabled?: boolean }>("load_app_config");
      await invoke("save_capability_toggles", {
        visionEnabled: cfg.vision_enabled ?? false,
        showReasoning: next,
      });
    } catch {}
  }, [showReasoning]);

  const selectedModel = loadedModelId ?? specs?.recommended_model ?? "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

  const {
    tabs, activeTabId, activePaneId, setActivePaneId,
    activeTabIdRef, activePaneIdRef, ptyWriteRefs,
    addTab, createSshTab, closeTab, switchTab, toggleSplit, renameTab, updateTabCwd,
    updateTabColor, updateTabGroup, restoreTabs,
  } = useTabManager(undefined);

  const {
    healingError, healingResult, isHealingAnalyzing,
    resetHealing, detectError, handleAnalyze, handleExecute, clearHealing,
  } = useAutoHealing(selectedModel, activePaneIdRef, ptyWriteRefs, analyzeError);

  const panels = usePanelVisibility();
  // panels 번들의 일부만 App.tsx 내부에서 직접 참조 — 나머지는 AppHeader/AppOverlays가 panels.<name> 으로 사용.
  const {
    showRagPanel, setShowRagPanel,
    setShowHistorySearch,
    setShowCommitPanel,
    setShowDiffReview,
    setShowThemePanel,
    setShowWorkspace,
    showScriptPanel, setShowScriptPanel,
    showSysmon, setShowSysmon,
    setShowPalette,
    setShowSshModal,
    closeOverlays,
  } = panels;

  const { appearance, saveAppearance, xtermTheme } = useTerminalTheme();
  const { actions: quickActions, addAction, updateAction, deleteAction, moveAction } = useQuickActions();
  const { workspaces, loading: wsLoading, loadWorkspaces, saveWorkspace, deleteWorkspace } = useWorkspace();

  const { updateInfo, installing, progress, installError, installUpdate, dismissUpdate } = useUpdateCheck();

  // ReAct 에이전트 (>> 프리픽스 태스크)
  const reactAgent = useReactAgent();

  // 환경 파일 자동 감지
  const envDetector = useEnvAutoDetector(activePaneIdRef, ptyWriteRefs);

  // 스크립트 라이브러리
  const scriptLib = useScriptLibrary(activePaneIdRef, ptyWriteRefs);

  // 알림 센터
  const notifCenter = useNotificationCenter();

  // Phase 115 — Privacy Ledger (세션 단위 AI 라우팅 가시화)
  const privacyLedger = usePrivacyLedger();

  // Phase 116 — Worktree Squad
  const squadStore = useSquads();

  // 파일 탐색기 사이드바 (기본 열림)
  const [showFileExplorer, setShowFileExplorer] = useState(() => {
    try { return localStorage.getItem("lum.fileExplorer") !== "0"; } catch { return true; }
  });
  // Welcome 힌트 — 최초 실행 시 1회만
  const [showWelcome, setShowWelcome] = useState(() => {
    try { return localStorage.getItem("lum.hintsShown") !== "1"; } catch { return false; }
  });
  const getTerminalContext = useCallback(() => {
    const activeTab = tabs.find((t) => t.id === activeTabIdRef.current);
    const cwd = activeTab?.cwd ?? "";
    const recentCmds = cmdBlocks
      .slice(-5)
      .map((b) => `$ ${b.command} (exit: ${b.exitCode ?? 0})`)
      .join("\n");
    return [cwd ? `CWD: ${cwd}` : "", recentCmds ? `Recent commands:\n${recentCmds}` : ""]
      .filter(Boolean)
      .join("\n");
  }, [tabs, activeTabIdRef, cmdBlocks]);
  const aiChat = useAIChat(selectedModel, getTerminalContext);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showQuickBar, setShowQuickBar] = useState(true);
  // 탭 더블클릭 rename 상태
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tabCtxMenu, setTabCtxMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [tabGitInfo, setTabGitInfo] = useState<Record<string, GitTabInfo | null>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("terminal");
  const [aiInput, setAiInput] = useState("");
  const [showAiBar, setShowAiBar] = useState(false);
  const [dismissedBlockId, setDismissedBlockId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [retryComparePending, setRetryComparePending] = useState<RetryComparePending | null>(null);
  const [retryCompareQueue, setRetryCompareQueue] = useState<RetryCompareTask[]>(() => loadRetryCompareRuntimeCache().queue);
  const [retryCompareQueueUndo, setRetryCompareQueueUndo] = useState<RetryCompareTask[] | null>(null);
  const [retryCompareQueueRedo, setRetryCompareQueueRedo] = useState<RetryCompareTask[] | null>(null);
  const [retryCompareQueuePaused, setRetryCompareQueuePaused] = useState(() => loadRetryCompareRuntimeCache().paused);
  const [retryCompareCompletedCount, setRetryCompareCompletedCount] = useState(() => loadRetryCompareRuntimeCache().completedCount);
  const [retryCompareByBlock, setRetryCompareByBlock] = useState<Record<string, RetryCompareResult>>(() => loadRetryCompareCache());
  const aiInputRef = useRef<HTMLInputElement>(null);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  useEffect(() => {
    invoke<boolean>("check_onboarding_complete")
      .then((done) => { if (!done) setShowOnboarding(true); })
      .catch(() => {});
  }, []);

  // Phase 115 — Quake Mode: 글로벌 단축키로 깨어났을 때 AI 바를 즉시 열고 포커스.
  // 백엔드(lib.rs setup)가 윈도우 show + focus 처리, 프론트는 입력 UX 담당.
  useEffect(() => {
    const unlisten = listen<unknown>("quake_invoked", () => {
      setShowAiBar(true);
      // 윈도우 포커스 직후 input ref가 mount될 시간 필요
      setTimeout(() => aiInputRef.current?.focus(), 80);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);


  const recentCmds = useMemo(
    () => cmdBlocks.filter(b => b.command.trim()).map(b => b.command).slice(-20).reverse(),
    [cmdBlocks],
  );

  const cmdBlocksLenRef = useRef(0);
  useEffect(() => {
    if (cmdBlocks.length <= cmdBlocksLenRef.current) return;
    const newBlocks = cmdBlocks.slice(cmdBlocksLenRef.current);
    cmdBlocksLenRef.current = cmdBlocks.length;
    for (const b of newBlocks) {
      if (b.command.trim()) {
        invoke("add_history_entry", {
          command: b.command,
          exitCode: b.exitCode ?? 0,
          cwd: "",
          model: selectedModel,
        }).catch(() => {});
      }
      // 10초 이상 걸린 명령어 → 알림 센터 기록
      if (b.command.trim() && b.endedAt !== null && b.endedAt - b.startedAt >= 10_000) {
        const ok = b.exitCode === 0 || b.exitCode === null;
        notifCenter.addNotification({
          type: "command",
          title: ok ? "명령어 완료" : "명령어 실패",
          body: `${b.command.slice(0, 60)}${b.command.length > 60 ? "…" : ""} · ${Math.round((b.endedAt - b.startedAt) / 1000)}초 소요`,
        });
      }
    }
  }, [cmdBlocks, selectedModel]); // notifCenter.addNotification은 안정된 useCallback이므로 deps 불필요

  useEffect(() => {
    if (!retryComparePending) return;
    const candidate = cmdBlocks.find(
      (b) =>
        b.startedAt >= retryComparePending.queuedAt &&
        b.command.trim() === retryComparePending.command.trim() &&
        b.endedAt !== null,
    );
    if (!candidate) return;

    const diff = summarizeOutputDiff(retryComparePending.baselineOutput, candidate.output);
    setRetryCompareByBlock((prev) => ({
      ...prev,
      [candidate.id]: { ...diff, comparedAt: Date.now() },
    }));
    notifCenter.addNotification({
      type: "command",
      title: `재시도 비교 · ${candidate.exitCode === 0 ? "성공" : "실패"}`,
      body: `+${diff.added} / -${diff.removed}${diff.preview ? ` · ${diff.preview.slice(0, 140)}` : ""}`,
    });
    setRetryCompareCompletedCount((prev) => prev + 1);
    setRetryComparePending(null);
  }, [cmdBlocks, retryComparePending, notifCenter]);
  useEffect(() => {
    if (retryComparePending) return;
    if (retryCompareQueuePaused) return;
    if (retryCompareQueue.length === 0) return;
    const write = ptyWriteRefs.current.get(activePaneIdRef.current);
    if (!write) return;
    const [next, ...rest] = retryCompareQueue;
    setRetryCompareQueueUndo(null);
    setRetryCompareQueueRedo(null);
    setRetryCompareQueue(rest);
    setRetryComparePending({
      command: next.command,
      baselineOutput: next.baselineOutput,
      queuedAt: Date.now(),
    });
    write(next.command + "\r");
  }, [retryComparePending, retryCompareQueuePaused, retryCompareQueue, ptyWriteRefs, activePaneIdRef]);
  const enqueueRetryCompare = useCallback((blocks: CommandBlock[]) => {
    const tasks = blocks
      .filter((b) => b.command.trim() !== "")
      .map((b, idx) => ({
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        command: b.command,
        baselineOutput: b.output,
      }));
    if (tasks.length === 0) return;
    setRetryCompareQueueRedo(null);
    setRetryCompareQueue((prev) => [...prev, ...tasks]);
  }, []);
  const mutateRetryCompareQueue = useCallback((updater: (prev: RetryCompareTask[]) => RetryCompareTask[]) => {
    setRetryCompareQueue((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      setRetryCompareQueueUndo(prev);
      setRetryCompareQueueRedo(null);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selectedBlockId) return;
    if (!cmdBlocks.some((b) => b.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [cmdBlocks, selectedBlockId]);
  useEffect(() => {
    saveRetryCompareCache(retryCompareByBlock);
  }, [retryCompareByBlock]);
  useEffect(() => {
    saveRetryCompareRuntimeCache({
      queue: retryCompareQueue,
      paused: retryCompareQueuePaused,
      completedCount: retryCompareCompletedCount,
    });
  }, [retryCompareQueue, retryCompareQueuePaused, retryCompareCompletedCount]);

  // Warp prompt 느낌의 탭 Git 칩: 브랜치 + 변경 파일 수.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all(
        tabs.map(async (tab) => {
          if (!tab.cwd) return [tab.id, null] as const;
          try {
            const gitCtx = await invoke<string>("get_git_context", { cwd: tab.cwd });
            return [tab.id, parseGitTabInfo(gitCtx)] as const;
          } catch {
            return [tab.id, null] as const;
          }
        }),
      ).then((pairs) => {
        if (cancelled) return;
        const next: Record<string, GitTabInfo | null> = {};
        for (const [id, info] of pairs) next[id] = info;
        setTabGitInfo(next);
      }).catch(() => {});
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tabs, cmdBlocks.length]);

  // ReAct 에이전트 태스크 완료 알림 — status 전환 시점에 goal 최신값 사용
  const agentStatusRef = useRef(reactAgent.state.status);
  useEffect(() => {
    const prev = agentStatusRef.current;
    const { status, goal } = reactAgent.state;
    agentStatusRef.current = status;
    if (prev === status) return;
    if (status === "done") {
      notifCenter.addNotification({
        type: "agent",
        title: "에이전트 태스크 완료",
        body: goal || "태스크가 완료되었습니다.",
      });
    } else if (status === "error") {
      notifCenter.addNotification({
        type: "agent",
        title: "에이전트 태스크 실패",
        body: goal || "태스크 실행 중 오류가 발생했습니다.",
      });
    }
  }, [reactAgent.state]);

  // AI 자가 치유 감지 알림
  const healingNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (healingError && healingError !== healingNotifiedRef.current) {
      healingNotifiedRef.current = healingError;
      notifCenter.addNotification({
        type: "healing",
        title: "AI 자가 치유 감지",
        body: healingError.slice(0, 80),
      });
    }
  }, [healingError]);

  // 환경 파일 감지 알림 — 동일 파일 목록 중복 방지
  const lastEnvKeyRef = useRef("");
  useEffect(() => {
    if (!envDetector.visible || envDetector.suggestions.length === 0) return;
    const key = envDetector.suggestions.map(s => s.file).join(",");
    if (key === lastEnvKeyRef.current) return;
    lastEnvKeyRef.current = key;
    notifCenter.addNotification({
      type: "env",
      title: "환경 파일 감지",
      body: `${key.replace(/,/g, ", ")} — 설치 명령어를 확인하세요.`,
    });
  }, [envDetector.visible, envDetector.suggestions]);

  const handleTerminalOutput = useCallback(
    (paneId: string) => (data: string) => {
      if (paneId !== activePaneIdRef.current) return;
      feedRaw(data);
      detectError(data);
    },
    [activePaneIdRef, feedRaw, detectError],
  );

  // ReAct 에이전트 태스크 시작 핸들러
  const handleAgentTrigger = useCallback(
    (task: string) => {
      const currentTab = tabs.find((t) => t.id === activeTabIdRef.current);
      const cwd = currentTab?.cwd ?? "";
      reactAgent.start(task, cwd);
    },
    [reactAgent.start, tabs, activeTabIdRef],
  );

  const handleAgentRunAct = useCallback(
    (toolWhitelist: string[] | null) => {
      const { goal, cwd, planId } = reactAgent.state;
      if (!goal) return;
      reactAgent
        .runAct(goal, cwd, planId, toolWhitelist, Boolean(toolWhitelist))
        .catch(() => {});
    },
    [reactAgent],
  );

  // 자연어 입력 → AI 스트림에 전송 (AIBlockStream이 자동 표시됨)
  // images: MCP 툴 결과의 base64 data URI 배열 (비전 모드 활성 시 전달)
  const handleAskAI = useCallback(
    (question: string, images?: string[], engine?: "heavy" | "fast") => {
      aiChat.sendMessage(question, images, engine);
    },
    [aiChat.sendMessage],
  );

  const handleHistorySelect = useCallback((command: string) => {
    ptyWriteRefs.current.get(activePaneIdRef.current)?.(command);
  }, [activePaneIdRef, ptyWriteRefs]);

  const handleCommitExecute = useCallback((cmd: string) => {
    ptyWriteRefs.current.get(activePaneIdRef.current)?.(cmd + "\n");
  }, [activePaneIdRef, ptyWriteRefs]);

  // 최근 커맨드 블록 네비게이션 (Warp 블록 점프 감각)
  const navigateCommandBlock = useCallback((delta: -1 | 1) => {
    if (cmdBlocks.length === 0) return;
    const currentId = selectedBlockId ?? cmdBlocks[cmdBlocks.length - 1]?.id ?? null;
    if (!currentId) return;
    const idx = cmdBlocks.findIndex((b) => b.id === currentId);
    if (idx < 0) {
      setSelectedBlockId(cmdBlocks[cmdBlocks.length - 1]?.id ?? null);
      return;
    }
    const nextIdx = Math.max(0, Math.min(cmdBlocks.length - 1, idx + delta));
    setSelectedBlockId(cmdBlocks[nextIdx]?.id ?? null);
    setDismissedBlockId(null);
  }, [cmdBlocks, selectedBlockId]);

  const focusFailedBlock = useCallback(() => {
    const failed = cmdBlocks
      .map((b, idx) => ({ b, idx }))
      .filter(({ b }) => b.exitCode !== null && b.exitCode !== 0);
    if (failed.length === 0) return;

    if (!selectedBlockId) {
      setSelectedBlockId(failed[failed.length - 1].b.id);
      setDismissedBlockId(null);
      return;
    }

    const currentPos = failed.findIndex(({ b }) => b.id === selectedBlockId);
    if (currentPos < 0) {
      setSelectedBlockId(failed[failed.length - 1].b.id);
      setDismissedBlockId(null);
      return;
    }

    const nextPos = (currentPos - 1 + failed.length) % failed.length;
    setSelectedBlockId(failed[nextPos].b.id);
    setDismissedBlockId(null);
  }, [cmdBlocks, selectedBlockId]);

  const handleAiSubmit = useCallback(async () => {
    const cmd = aiInput.trim();
    if (!cmd) return;
    setAiInput("");
    setShowAiBar(false);
    const blockId = addBlock({ command: cmd, type: "ai" });
    try {
      await streamAICommand(cmd, selectedModel, "", (accumulated) => {
        updateBlock(blockId, { output: accumulated, status: "executing" });
      });
      updateBlock(blockId, { status: "completed" });
    } catch (err) {
      updateBlock(blockId, { output: `Error: ${err}`, status: "error" });
    }
  }, [aiInput, selectedModel, addBlock, updateBlock, streamAICommand]);

  // 탭 전환 시 healing 초기화
  const addTabWithReset = useCallback(() => { resetHealing(); addTab(); }, [resetHealing, addTab]);
  const closeTabWithReset = useCallback(
    (id: string, e: React.MouseEvent) => { resetHealing(); closeTab(id, e); },
    [resetHealing, closeTab],
  );
  const switchTabWithReset = useCallback(
    (id: string) => { resetHealing(); switchTab(id); },
    [resetHealing, switchTab],
  );

  useEffect(() => {
    const captureHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "r" && viewModeRef.current === "terminal") {
        e.preventDefault();
        e.stopPropagation();
        setShowHistorySearch(true);
      }
    };
    window.addEventListener("keydown", captureHandler, { capture: true });

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key === "k") {
        e.preventDefault();
        setShowPalette(v => !v);
      }
      if (mod && !e.shiftKey && e.key === "b") {
        e.preventDefault();
        setShowFileExplorer(v => {
          const next = !v;
          invoke("save_ui_preferences", { showFileExplorer: next }).catch(() => {});
          return next;
        });
      }
      if (mod && e.shiftKey && e.key === "k") {
        e.preventDefault();
        setShowAiBar((v) => {
          if (!v) setTimeout(() => aiInputRef.current?.focus(), 50);
          return !v;
        });
      }
      if (mod && e.key === "t") { e.preventDefault(); addTabWithReset(); }
      if (mod && e.key === "w") {
        e.preventDefault();
        closeTabWithReset(activeTabIdRef.current, { stopPropagation: () => {} } as React.MouseEvent);
      }
      if (mod && e.shiftKey && e.key === "d") { e.preventDefault(); toggleSplit("h"); }
      if (mod && e.shiftKey && e.key === "e") { e.preventDefault(); toggleSplit("v"); }
      if (mod && e.shiftKey && e.key === "g") { e.preventDefault(); setShowCommitPanel(true); }
      if (mod && e.shiftKey && e.key === "h") { e.preventDefault(); setShowSshModal(true); }
      if (mod && e.shiftKey && e.key === "r") { e.preventDefault(); setShowDiffReview(true); }
      if (mod && e.shiftKey && e.key === "l") { e.preventDefault(); setShowScriptPanel(v => { if (!v) scriptLib.loadScripts(); return !v; }); }
      if (mod && e.shiftKey && e.key === "m") { e.preventDefault(); setShowSysmon(v => !v); }
      if (mod && e.key === ",") { e.preventDefault(); setShowThemePanel(true); }
      if (mod && e.shiftKey && e.key === "q") { e.preventDefault(); setShowQuickBar(v => !v); }
      if (mod && e.shiftKey && e.key === "ArrowUp") { e.preventDefault(); navigateCommandBlock(-1); }
      if (mod && e.shiftKey && e.key === "ArrowDown") { e.preventDefault(); navigateCommandBlock(1); }
      if (mod && e.shiftKey && (e.key === "f" || e.key === "F")) { e.preventDefault(); focusFailedBlock(); }
      if (mod && e.shiftKey && (e.key === "s" || e.key === "o")) { e.preventDefault(); setShowWorkspace(true); loadWorkspaces(); }
      // Cmd+1~9 — Quick Actions 단축키
      if (mod && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key);
        const action = quickActions.find(a => a.shortcut === n);
        if (action) {
          e.preventDefault();
          const write = ptyWriteRefs.current.get(activePaneIdRef.current);
          write?.(action.command + "\r");
        }
      }
      if (e.key === "Escape") {
        setShowAiBar(false);
        setTabCtxMenu(null);
        closeOverlays();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", captureHandler, { capture: true });
      window.removeEventListener("keydown", handler);
    };
  }, [addTabWithReset, closeTabWithReset, toggleSplit, closeOverlays, activeTabIdRef, setShowCommitPanel, setShowHistorySearch, setShowDiffReview, setShowThemePanel, quickActions, ptyWriteRefs, activePaneIdRef, setShowWorkspace, loadWorkspaces, setShowPalette, navigateCommandBlock, focusFailedBlock]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const lastCmdBlock = cmdBlocks[cmdBlocks.length - 1] ?? null;
  const focusedCmdBlock = selectedBlockId
    ? (cmdBlocks.find((b) => b.id === selectedBlockId) ?? null)
    : lastCmdBlock;
  const focusedCmdIndex = focusedCmdBlock ? cmdBlocks.findIndex((b) => b.id === focusedCmdBlock.id) : -1;
  const showBlockBar = focusedCmdBlock !== null && focusedCmdBlock.id !== dismissedBlockId && !healingError;
  const wsTabs = tabs.map(t => ({ id: t.id, title: t.title, cwd: t.cwd ?? "", split_dir: t.splitDir }));
  const contextTab = tabCtxMenu ? tabs.find(t => t.id === tabCtxMenu.tabId) : undefined;

  const handleSshConnect = useCallback((profile: SshProfile) => {
    createSshTab(profile);
    setShowSshModal(false);
  }, [createSshTab]);

  const handleRestoreWorkspace = useCallback((ws: import("./hooks/useWorkspace").Workspace) => {
    restoreTabs(
      ws.tabs.map(t => ({ id: t.id, title: t.title, cwd: t.cwd, splitDir: t.split_dir as "h" | "v" | undefined })),
      ws.active_tab_id,
    );
  }, [restoreTabs]);

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
    <div className="app-root lum-app-shell text-white h-screen overflow-hidden flex flex-col">
      <ResizeHandles />
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <AppHeader
        specs={specs}
        specsLoading={specsLoading}
        viewMode={viewMode}
        setViewMode={setViewMode}
        loadedModelId={loadedModelId}
        heavyModelId={heavyModelId}
        heavyEnabled={heavyEnabled}
        privacyLedger={privacyLedger}
        squadStore={squadStore}
        notifCenter={notifCenter}
        scriptLib={scriptLib}
        panels={panels}
        showFileExplorer={showFileExplorer}
        setShowFileExplorer={setShowFileExplorer}
        showReasoning={showReasoning}
        toggleReasoning={toggleReasoning}
        toolbarShowAdvanced={toolbarShowAdvanced}
        toggleToolbarAdvanced={toggleToolbarAdvanced}
        showAdvancedOverflow={showAdvancedOverflow}
        setShowAdvancedOverflow={setShowAdvancedOverflow}
        loadWorkspaces={loadWorkspaces}
        seenAdvancedFeatures={seenAdvancedFeatures}
        onMarkAdvancedSeen={handleMarkAdvancedSeen}
      />

      {/* ── 업데이트 배너 ───────────────────────────────────────── */}
      <AnimatePresence>
      {updateInfo && (
        <motion.div
          key="update-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex flex-col gap-1 px-4 py-1.5 bg-accent/10 border-b border-accent/20 shrink-0 overflow-hidden">
          <div className="flex items-center gap-2 text-xs">
            <ArrowUpCircle size={13} className="text-accent shrink-0" />
            <span className="text-white/75">
              새 버전 <span className="text-accent font-semibold">v{updateInfo.latest}</span> 출시 — {updateInfo.releaseName}
            </span>
            {!installing && (
              <button
                onClick={installUpdate}
                className="ml-1 text-accent hover:text-accent/80 font-medium underline underline-offset-2 transition-colors rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:px-1"
              >
                지금 설치
              </button>
            )}
            {installing && !progress && (
              <span className="ml-1 text-white/40">준비 중…</span>
            )}
            {installError && (
              <span className="ml-1 text-red-400 truncate max-w-xs">{installError}</span>
            )}
            <button
              onClick={dismissUpdate}
              disabled={installing}
              className="ml-auto p-1 rounded text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="알림 닫기"
            >
              <X size={12} />
            </button>
          </div>
          {installing && progress && progress.total > 0 && (
            <div className="flex items-center gap-2 text-xs text-white/50 pb-0.5">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-150"
                  style={{ width: `${Math.min(100, (progress.downloaded / progress.total) * 100).toFixed(1)}%` }}
                />
              </div>
              <span className="tabular-nums shrink-0">
                {(progress.downloaded / 1024 / 1024).toFixed(1)} / {(progress.total / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── 탭 바 ─────────────────────────────────────────────── */}
      {viewMode === "terminal" && (
        <div className="lum-tabbar flex items-center border-b border-white/10 shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => switchTabWithReset(tab.id)}
              onDoubleClick={() => {
                setRenamingTabId(tab.id);
                setRenameValue(tab.title);
              }}
              onContextMenu={e => {
                e.preventDefault();
                setTabCtxMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-white/8 whitespace-nowrap transition-colors group cursor-pointer ${
                tab.id === activeTabId
                  ? "bg-[#182739] text-white shadow-[inset_0_-2px_0_rgba(88,166,255,0.8)]"
                  : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
              }`}
              style={tab.color ? { borderBottom: `2px solid ${TAB_COLORS[tab.color]}` } : undefined}
            >
              {tab.color && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: TAB_COLORS[tab.color] }}
                />
              )}
              <TabIconComponent icon={tab.icon} />
              {tab.group && (
                <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">{tab.group}</span>
              )}
              {renamingTabId === tab.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => { renameTab(tab.id, renameValue); setRenamingTabId(null); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") { renameTab(tab.id, renameValue); setRenamingTabId(null); }
                    if (e.key === "Escape") setRenamingTabId(null);
                    e.stopPropagation();
                  }}
                  onClick={e => e.stopPropagation()}
                  className="w-24 bg-transparent border-b border-accent/60 outline-none text-white text-xs"
                />
              ) : (
                <>
                  {tab.sshProfile && <Lock size={11} className="text-cyan-400 shrink-0" />}
                  {tab.title}
                  {tabGitInfo[tab.id]?.branch && (
                    <span
                      className={`ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] ${
                        tab.id === activeTabId
                          ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-200"
                          : "border-white/15 bg-white/[0.04] text-white/60"
                      }`}
                      title={
                        tabGitInfo[tab.id]!.changed > 0
                          ? `브랜치 ${tabGitInfo[tab.id]!.branch} · 변경 ${tabGitInfo[tab.id]!.changed}개`
                          : `브랜치 ${tabGitInfo[tab.id]!.branch}`
                      }
                    >
                      <GitBranch size={10} />
                      <span>{tabGitInfo[tab.id]!.branch}</span>
                      {tabGitInfo[tab.id]!.changed > 0 && (
                        <span className="text-[9px] px-1 rounded bg-amber-400/22 text-amber-200">
                          {tabGitInfo[tab.id]!.changed}
                        </span>
                      )}
                    </span>
                  )}
                </>
              )}
              {tabs.length > 1 && renamingTabId !== tab.id && (
                <button
                  type="button"
                  onClick={(e) => closeTabWithReset(tab.id, e)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-white transition-opacity rounded p-0.5 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`${tab.title} 닫기`}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTabWithReset}
            aria-label="새 탭 (Cmd+T)"
            title="새 탭 (Cmd+T)"
            className="px-2 py-1.5 text-white/35 hover:text-white/75 hover:bg-white/5 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-white/5"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={() => setShowSshModal(true)}
            aria-label="SSH 연결 (Cmd+Shift+H)"
            title="SSH 연결 (Cmd+Shift+H)"
            className="px-2 py-1.5 text-white/35 hover:text-white/75 hover:bg-white/5 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-white/5"
          >
            <Lock size={13} />
          </button>

          <div className="ml-auto flex items-center gap-0.5 px-2 shrink-0">
            <button
              onClick={() => toggleSplit("h")}
              aria-label="수평 분할 (Cmd+Shift+D)"
              aria-pressed={activeTab?.splitDir === "h"}
              title="수평 분할 (Cmd+Shift+D)"
              className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                activeTab?.splitDir === "h"
                  ? "text-accent bg-accent/10"
                  : "text-white/35 hover:text-white/75 hover:bg-white/5"
              }`}
            >
              <Columns2 size={13} />
            </button>
            <button
              onClick={() => toggleSplit("v")}
              aria-label="수직 분할 (Cmd+Shift+E)"
              aria-pressed={activeTab?.splitDir === "v"}
              title="수직 분할 (Cmd+Shift+E)"
              className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                activeTab?.splitDir === "v"
                  ? "text-accent bg-accent/10"
                  : "text-white/35 hover:text-white/75 hover:bg-white/5"
              }`}
            >
              <Rows2 size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Quick Actions 바 ─────────────────────────────────── */}
      {viewMode === "terminal" && showQuickBar && (
        <QuickActionsBar
          actions={quickActions}
          onExecute={cmd => {
            const write = ptyWriteRefs.current.get(activePaneIdRef.current);
            write?.(cmd + "\r");
          }}
          onAdd={addAction}
          onUpdate={updateAction}
          onDelete={deleteAction}
          onMove={moveAction}
        />
      )}

      {/* ── 메인 콘텐츠 ──────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex relative border-t border-white/[0.03]">
        {showFileExplorer && (
          <div style={{ width: 260 }} className="shrink-0">
            <FileExplorerPanel
              cwd={tabs.find((t) => t.id === activeTabId)?.cwd || ""}
              onClose={() => {
                setShowFileExplorer(false);
                invoke("save_ui_preferences", { showFileExplorer: false }).catch(() => {});
              }}
              onCdTo={(p) => {
                const write = ptyWriteRefs.current.get(activePaneIdRef.current);
                const quoted = p.includes(" ") ? `"${p}"` : p;
                write?.(`cd ${quoted}\r`);
              }}
              onOpenFile={(p) => {
                const write = ptyWriteRefs.current.get(activePaneIdRef.current);
                const quoted = p.includes(" ") ? `"${p}"` : p;
                // Windows: start, Mac: open, Linux: xdg-open
                const cmd = navigator.userAgent.includes("Windows")
                  ? `start ${quoted}`
                  : navigator.userAgent.includes("Mac")
                    ? `open ${quoted}`
                    : `xdg-open ${quoted}`;
                write?.(`${cmd}\r`);
              }}
            />
          </div>
        )}
        <div className="flex-1 overflow-hidden relative bg-[#0a0f16]/65">
          <div className={`absolute inset-0 ${viewMode === "terminal" ? "block" : "hidden"}`}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`absolute inset-0 ${tab.id === activeTabId ? "flex" : "hidden"} flex-col`}
              >
                {tab.splitDir ? (
                  <PanelGroup
                    orientation={tab.splitDir === "h" ? "horizontal" : "vertical"}
                    className="flex-1"
                  >
                    <Panel minSize={20}>
                      <PaneWrapper paneId={tab.id} activePaneId={activePaneId} onFocus={setActivePaneId}>
                        <ErrorBoundary label="터미널">
                          <TerminalPane
                            id={tab.id}
                            cwd={tab.cwd}
                            sshProfile={tab.sshProfile}
                            model={selectedModel}
                            xtermTheme={xtermTheme}
                            fontSize={appearance.fontSize}
                            fontFamily={appearance.fontFamily}
                            onOutput={handleTerminalOutput(tab.id)}
                            onCwdChange={cwd => { updateTabCwd(tab.id, cwd, inferTabIcon(cwd)); if (tab.id === activePaneIdRef.current) envDetector.detectEnv(cwd); }}
                            onReady={(write) => { ptyWriteRefs.current.set(tab.id, write); }}
                            onAgentTrigger={handleAgentTrigger}
                            onAskAI={handleAskAI}
                            aiMessages={aiChat.messages}
                            aiStreaming={aiChat.streaming}
                            aiError={aiChat.error}
                            onClearAI={aiChat.clear}
                            visionEnabled={visionEnabled}
                            showReasoning={showReasoning}
                            onToggleReasoning={toggleReasoning}
                          />
                        </ErrorBoundary>
                      </PaneWrapper>
                    </Panel>
                    <PanelResizeHandle
                      className={
                        tab.splitDir === "h"
                          ? "w-1 bg-white/5 hover:bg-accent/30 transition-colors cursor-col-resize"
                          : "h-1 bg-white/5 hover:bg-accent/30 transition-colors cursor-row-resize"
                      }
                    />
                    <Panel minSize={20}>
                      <PaneWrapper paneId={splitId(tab.id)} activePaneId={activePaneId} onFocus={setActivePaneId}>
                        <ErrorBoundary label="터미널">
                          <TerminalPane
                            id={splitId(tab.id)}
                            cwd={tab.cwd}
                            sshProfile={tab.sshProfile}
                            model={selectedModel}
                            xtermTheme={xtermTheme}
                            fontSize={appearance.fontSize}
                            fontFamily={appearance.fontFamily}
                            onOutput={handleTerminalOutput(splitId(tab.id))}
                            onCwdChange={cwd => { updateTabCwd(splitId(tab.id), cwd, inferTabIcon(cwd)); if (splitId(tab.id) === activePaneIdRef.current) envDetector.detectEnv(cwd); }}
                            onReady={(write) => { ptyWriteRefs.current.set(splitId(tab.id), write); }}
                            onAgentTrigger={handleAgentTrigger}
                            onAskAI={handleAskAI}
                            aiMessages={aiChat.messages}
                            aiStreaming={aiChat.streaming}
                            aiError={aiChat.error}
                            onClearAI={aiChat.clear}
                            visionEnabled={visionEnabled}
                            showReasoning={showReasoning}
                            onToggleReasoning={toggleReasoning}
                          />
                        </ErrorBoundary>
                      </PaneWrapper>
                    </Panel>
                  </PanelGroup>
                ) : (
                  <div className="flex-1 min-h-0">
                    <ErrorBoundary label="터미널">
                      <TerminalPane
                        id={tab.id}
                        cwd={tab.cwd}
                        sshProfile={tab.sshProfile}
                        model={selectedModel}
                        xtermTheme={xtermTheme}
                        fontSize={appearance.fontSize}
                        fontFamily={appearance.fontFamily}
                        onOutput={handleTerminalOutput(tab.id)}
                        onCwdChange={cwd => { updateTabCwd(tab.id, cwd, inferTabIcon(cwd)); if (tab.id === activePaneIdRef.current) envDetector.detectEnv(cwd); }}
                        onReady={(write) => { ptyWriteRefs.current.set(tab.id, write); }}
                        onAgentTrigger={handleAgentTrigger}
                        onAskAI={handleAskAI}
                        aiMessages={aiChat.messages}
                        aiStreaming={aiChat.streaming}
                        aiError={aiChat.error}
                        onClearAI={aiChat.clear}
                        visionEnabled={visionEnabled}
                        showReasoning={showReasoning}
                        onToggleReasoning={toggleReasoning}
                      />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            ))}
            {showBlockBar && focusedCmdBlock && focusedCmdIndex >= 0 && (
              <CommandBlockBar
                block={focusedCmdBlock}
                blockIndex={focusedCmdIndex}
                blockTotal={cmdBlocks.length}
                canPrev={focusedCmdIndex > 0}
                canNext={focusedCmdIndex < cmdBlocks.length - 1}
                onPrev={() => navigateCommandBlock(-1)}
                onNext={() => navigateCommandBlock(1)}
                onRerun={(command) => {
                  if (!command) return;
                  const write = ptyWriteRefs.current.get(activePaneIdRef.current);
                  write?.(command + "\r");
                }}
                onDismiss={() => setDismissedBlockId(focusedCmdBlock.id)}
              />
            )}
            {healingError && (
              <HealingPanel
                errorSnippet={healingError}
                result={healingResult}
                isAnalyzing={isHealingAnalyzing}
                onAnalyze={() => handleAnalyze(healingError)}
                onExecute={handleExecute}
                onDismiss={clearHealing}
              />
            )}
            {/* ── 환경 파일 제안 토스트 ────────────────── */}
            {envDetector.visible && (
              <EnvSuggestionToast
                suggestions={envDetector.suggestions}
                onExecute={envDetector.executeCmd}
                onDismiss={envDetector.dismiss}
              />
            )}
            {/* ── ReAct 에이전트 패널 (>> 태스크) ─────────── */}
            {reactAgent.state.status !== "idle" && (
              <div className="absolute bottom-16 right-4 z-30">
                <Suspense fallback={null}>
                  <ReactAgentPanel
                    state={reactAgent.state}
                    onCancel={reactAgent.cancel}
                    onClose={reactAgent.reset}
                    onRunAct={handleAgentRunAct}
                    onUndo={() => {
                      reactAgent.undo().catch(() => {});
                    }}
                  />
                </Suspense>
              </div>
            )}
          </div>

          {viewMode === "canvas" && (
            <InfiniteCanvas blocks={blocks} onNodeMove={moveBlock} />
          )}

          {viewMode === "list" && (
            <WarpListView
              blocks={cmdBlocks}
              onExecute={(cmd) => {
                const write = ptyWriteRefs.current.get(activePaneIdRef.current);
                write?.(cmd);
              }}
              onAskAIForFix={(text) => {
                handleAskAI(`이 실패 로그를 분석하고 해결 커맨드를 제안해줘.\n\n${text}`);
              }}
              compareResultByBlock={retryCompareByBlock}
              onRetryWithDiff={(block: CommandBlock) => {
                enqueueRetryCompare([block]);
              }}
              onRetrySelectedWithDiff={(blocks) => {
                enqueueRetryCompare(blocks);
              }}
              retryCompareQueueDepth={retryCompareQueue.length + (retryComparePending ? 1 : 0)}
              retryCompareQueueWaiting={retryCompareQueue.length}
              retryCompareInFlight={retryComparePending !== null}
              retryCompareCurrentCommand={retryComparePending?.command ?? null}
              retryCompareCompletedCount={retryCompareCompletedCount}
              onResetRetryCompareCompletedCount={() => {
                setRetryCompareCompletedCount(0);
              }}
              retryCompareQueuePaused={retryCompareQueuePaused}
              onToggleRetryCompareQueuePaused={() => {
                setRetryCompareQueuePaused((prev) => !prev);
              }}
              canUndoRetryCompareQueueChange={retryCompareQueueUndo !== null}
              onUndoRetryCompareQueueChange={() => {
                if (!retryCompareQueueUndo) return;
                setRetryCompareQueueRedo(retryCompareQueue);
                setRetryCompareQueue(retryCompareQueueUndo);
                setRetryCompareQueueUndo(null);
              }}
              canRedoRetryCompareQueueChange={retryCompareQueueRedo !== null}
              onRedoRetryCompareQueueChange={() => {
                if (!retryCompareQueueRedo) return;
                setRetryCompareQueueUndo(retryCompareQueue);
                setRetryCompareQueue(retryCompareQueueRedo);
                setRetryCompareQueueRedo(null);
              }}
              retryCompareQueueItems={retryCompareQueue.map((t) => ({ id: t.id, command: t.command }))}
              onPrioritizeRetryCompareQueueItem={(id) => {
                setRetryCompareQueuePaused(false);
                mutateRetryCompareQueue((prev) => {
                  const idx = prev.findIndex((t) => t.id === id);
                  if (idx <= 0) return prev;
                  const picked = prev[idx];
                  return [picked, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
                });
              }}
              onPromoteRetryCompareQueueItem={(id) => {
                mutateRetryCompareQueue((prev) => {
                  const idx = prev.findIndex((t) => t.id === id);
                  if (idx <= 0) return prev;
                  const picked = prev[idx];
                  return [picked, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
                });
              }}
              onMoveUpRetryCompareQueueItem={(id) => {
                mutateRetryCompareQueue((prev) => {
                  const idx = prev.findIndex((t) => t.id === id);
                  if (idx <= 0) return prev;
                  const next = [...prev];
                  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                  return next;
                });
              }}
              onMoveDownRetryCompareQueueItem={(id) => {
                mutateRetryCompareQueue((prev) => {
                  const idx = prev.findIndex((t) => t.id === id);
                  if (idx < 0 || idx >= prev.length - 1) return prev;
                  const next = [...prev];
                  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                  return next;
                });
              }}
              onDemoteRetryCompareQueueItem={(id) => {
                mutateRetryCompareQueue((prev) => {
                  const idx = prev.findIndex((t) => t.id === id);
                  if (idx < 0 || idx >= prev.length - 1) return prev;
                  const picked = prev[idx];
                  return [...prev.slice(0, idx), ...prev.slice(idx + 1), picked];
                });
              }}
              onRemoveRetryCompareQueueItem={(id) => {
                mutateRetryCompareQueue((prev) => prev.filter((t) => t.id !== id));
              }}
              onPrioritizeFilteredRetryCompareQueueItems={(ids) => {
                const target = new Set(ids);
                setRetryCompareQueuePaused(false);
                mutateRetryCompareQueue((prev) => {
                  const picked = prev.filter((t) => target.has(t.id));
                  if (picked.length === 0) return prev;
                  const rest = prev.filter((t) => !target.has(t.id));
                  return [...picked, ...rest];
                });
              }}
              onPromoteFilteredRetryCompareQueueItems={(ids) => {
                const target = new Set(ids);
                mutateRetryCompareQueue((prev) => {
                  const picked = prev.filter((t) => target.has(t.id));
                  if (picked.length === 0) return prev;
                  const rest = prev.filter((t) => !target.has(t.id));
                  return [...picked, ...rest];
                });
              }}
              onDemoteFilteredRetryCompareQueueItems={(ids) => {
                const target = new Set(ids);
                mutateRetryCompareQueue((prev) => {
                  const picked = prev.filter((t) => target.has(t.id));
                  if (picked.length === 0) return prev;
                  const rest = prev.filter((t) => !target.has(t.id));
                  return [...rest, ...picked];
                });
              }}
              onRemoveFilteredRetryCompareQueueItems={(ids) => {
                const remove = new Set(ids);
                mutateRetryCompareQueue((prev) => prev.filter((t) => !remove.has(t.id)));
              }}
              onClearRetryCompareQueue={() => {
                mutateRetryCompareQueue(() => []);
              }}
              onExplainDiff={(text) => {
                handleAskAI([
                  "아래 retry compare diff를 분석해줘.",
                  "1) 왜 이런 변화가 생겼는지",
                  "2) 리스크가 있는지",
                  "3) 다음에 실행할 검증 커맨드 3개",
                  "",
                  text,
                ].join("\n"));
              }}
              onExplainAllDiffs={(text) => {
                handleAskAI([
                  "아래는 retry compare 히스토리 전체다.",
                  "1) 변화 패턴 요약",
                  "2) 반복 실패/불안정 신호",
                  "3) 바로 실행할 검증 커맨드 5개",
                  "",
                  text,
                ].join("\n"));
              }}
              onClearCompareResults={() => {
                setRetryCompareByBlock({});
                setRetryComparePending(null);
                setRetryCompareQueue([]);
                setRetryCompareQueueUndo(null);
                setRetryCompareQueueRedo(null);
              }}
            />
          )}
        </div>

        <AnimatePresence initial={false}>
        {showRagPanel && (
          <motion.div
            key="rag-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-l border-white/8 shrink-0 overflow-hidden bg-[#0e141d]/84"
          >
            <ErrorBoundary label="RAG">
              <RagPanel model={selectedModel} onClose={() => setShowRagPanel(false)} />
            </ErrorBoundary>
          </motion.div>
        )}

        {showScriptPanel && (
          <motion.div
            key="script-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-l border-white/8 shrink-0 overflow-hidden bg-[#0e141d]/84"
          >
            <ErrorBoundary label="스크립트 라이브러리">
              <ScriptLibraryPanel
                scripts={scriptLib.scripts}
                loading={scriptLib.loading}
                onLoad={scriptLib.loadScripts}
                onRun={scriptLib.runScript}
                onDelete={scriptLib.deleteScript}
                onSave={scriptLib.saveScript}
                onClose={() => setShowScriptPanel(false)}
              />
            </ErrorBoundary>
          </motion.div>
        )}

        {showSysmon && (
          <motion.div
            key="sysmon-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-l border-white/8 shrink-0 overflow-hidden bg-[#0e141d]/84"
          >
            <ErrorBoundary label="시스템 모니터">
              <SystemMonitorPanel onClose={() => setShowSysmon(false)} />
            </ErrorBoundary>
          </motion.div>
        )}
        </AnimatePresence>

        <AnimatePresence>
        {showAiBar && (
          <motion.div
            key="ai-bar"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#0b1017]/96 via-[#0b1017]/72 to-transparent pointer-events-none"
          >
            <div className="pointer-events-auto">
              <div className="flex items-center gap-2 bg-white/[0.07] border border-white/[0.16] rounded-xl px-3 py-2 backdrop-blur-md shadow-2xl">
                <Zap size={13} className="text-accent shrink-0" />
                <input
                  ref={aiInputRef}
                  className="bg-transparent border-none outline-none text-xs flex-1 placeholder:text-white/35"
                  placeholder="AI에게 질문하세요… (Enter 전송 · Esc 닫기)"
                  value={aiInput}
                  disabled={isProcessing}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAiSubmit();
                    if (e.key === "Escape") setShowAiBar(false);
                  }}
                />
                {isProcessing && <Loader2 size={12} className="animate-spin text-white/40 shrink-0" />}
              </div>
              <p className="text-[10px] text-white/30 text-center mt-1.5 tracking-wide">⌘K 로 닫기</p>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      <AppOverlays
        panels={panels}
        selectedModel={selectedModel}
        aiChat={aiChat}
        squadStore={squadStore}
        resetHealing={resetHealing}
        addTab={addTab}
        tabs={tabs}
        activeTabId={activeTabId}
        activeTabIdRef={activeTabIdRef}
        appearance={appearance}
        saveAppearance={saveAppearance}
        workspaces={workspaces}
        wsTabs={wsTabs}
        wsLoading={wsLoading}
        saveWorkspace={saveWorkspace}
        deleteWorkspace={deleteWorkspace}
        handleRestoreWorkspace={handleRestoreWorkspace}
        quickActions={quickActions}
        recentCmds={recentCmds}
        switchTabWithReset={switchTabWithReset}
        ptyWriteRefs={ptyWriteRefs}
        activePaneIdRef={activePaneIdRef}
        handleHistorySelect={handleHistorySelect}
        handleCommitExecute={handleCommitExecute}
        tabCtxMenu={tabCtxMenu}
        setTabCtxMenu={setTabCtxMenu}
        contextTab={contextTab}
        updateTabColor={updateTabColor}
        updateTabGroup={updateTabGroup}
        handleSshConnect={handleSshConnect}
        showWelcome={showWelcome}
        setShowWelcome={setShowWelcome}
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
      />
    </div>
    </TooltipProvider>
  );
};

interface PaneWrapperProps {
  paneId: string;
  activePaneId: string;
  onFocus: (id: string) => void;
  children: React.ReactNode;
}

const PaneWrapper: React.FC<PaneWrapperProps> = ({ paneId, activePaneId, onFocus, children }) => (
  <div
    className={`h-full relative ${
      paneId === activePaneId ? "ring-1 ring-inset ring-accent/25" : "ring-1 ring-inset ring-white/5"
    }`}
    onMouseDown={() => onFocus(paneId)}
  >
    {children}
  </div>
);

// 탭 아이콘 헬퍼
const TabIconComponent: React.FC<{ icon?: string }> = ({ icon }) => {
  const cls = "shrink-0";
  switch (icon) {
    case "git":     return <GitBranch size={12} className={cls} />;
    case "node":    return <Package size={12} className={cls} />;
    case "rust":    return <Zap size={12} className={cls} />;
    case "python":  return <Cpu size={12} className={cls} />;
    case "docker":  return <Container size={12} className={cls} />;
    default:        return <TerminalSquare size={12} className={cls} />;
  }
};

export default App;
