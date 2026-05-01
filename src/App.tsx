import React, { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToolbarIconButton, ToolbarSeparator } from "@/components/ui/toolbar-icon-button";
import { shortPath } from "./utils";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import { useHardwareSpecs } from "./hooks/useHardwareSpecs";
import { useCommandBlocks } from "./hooks/useCommandBlocks";
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
  Zap, Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2,
  Package, Database, Plus, X, Columns2, Rows2, SlidersHorizontal, ArrowUpCircle, GitCompareArrows, Palette,
  GitBranch, Container, Layers, Lock, BookOpen, Bell, Activity, FolderTree, Brain, PlugZap, Users, Sparkles, Library, Hammer,
} from "lucide-react";
import SshConnectModal from "./components/SshConnectModal";
import { useReactAgent } from "./hooks/useReactAgent";
import { useAIChat } from "./hooks/useAIChat";
import { useEnvAutoDetector } from "./hooks/useEnvAutoDetector";
import EnvSuggestionToast from "./components/EnvSuggestionToast";
import { useScriptLibrary } from "./hooks/useScriptLibrary";
import ScriptLibraryPanel from "./components/ScriptLibraryPanel";
import SystemMonitorPanel from "./components/SystemMonitorPanel";
import { useNotificationCenter } from "./hooks/useNotificationCenter";
import NotificationCenter from "./components/NotificationCenter";
import { usePrivacyLedger } from "./hooks/usePrivacyLedger";
import PrivacyLedgerBadge from "./components/PrivacyLedgerBadge";
import { useSquads } from "./hooks/useSquads";
import type { SshProfile } from "./hooks/useTabManager";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import TerminalPane from "./components/TerminalPane";
import HealingPanel from "./components/HealingPanel";
import RagPanel from "./components/RagPanel";
import CommandBlockBar from "./components/CommandBlockBar";
import HistorySearch from "./components/HistorySearch";
import CommitPanel from "./components/CommitPanel";
import ThemePanel from "./components/ThemePanel";
import QuickActionsBar from "./components/QuickActionsBar";
import WorkspacePanel from "./components/WorkspacePanel";
import CommandPalette from "./components/CommandPalette";
import TabContextMenu from "./components/TabContextMenu";
import ResizeHandles from "./components/ResizeHandles";
import WindowControls from "./components/WindowControls";
import WarpListView from "./components/WarpListView";
import FileExplorerPanel from "./components/FileExplorerPanel";
import WelcomeHints from "./components/WelcomeHints";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TAB_COLORS } from "./hooks/useTabManager";

const ReactAgentPanel = lazy(() => import("./components/ReactAgentPanel"));
const ModelManager = lazy(() => import("./components/ModelManager"));
const XllmPanel = lazy(() => import("./components/XllmPanel"));
const OnboardingWizard = lazy(() => import("./components/OnboardingWizard"));
const DiffReviewPanel = lazy(() => import("./components/DiffReviewPanel"));
const McpPanel = lazy(() => import("./components/McpPanel"));
const SquadPanel = lazy(() => import("./components/SquadPanel"));
const HealingDatasetPanel = lazy(() => import("./components/HealingDatasetPanel"));
const RecallPanel = lazy(() => import("./components/RecallPanel"));
const LoraForgePanel = lazy(() => import("./components/LoraForgePanel"));

type ViewMode = "terminal" | "canvas" | "list";

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
  useEffect(() => {
    invoke<{
      show_reasoning?: boolean;
      vision_enabled?: boolean;
      toolbar_show_advanced?: boolean;
    }>("load_app_config")
      .then((c) => {
        setShowReasoning(c.show_reasoning ?? true);
        setVisionEnabled(c.vision_enabled ?? false);
        setToolbarShowAdvanced(c.toolbar_show_advanced ?? false);
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

  const {
    showModelManager, setShowModelManager,
    showRagPanel, setShowRagPanel,
    showHistorySearch, setShowHistorySearch,
    showCommitPanel, setShowCommitPanel,
    showXllmPanel, setShowXllmPanel,
    showDiffReview, setShowDiffReview,
    showThemePanel, setShowThemePanel,
    showWorkspace, setShowWorkspace,
    showScriptPanel, setShowScriptPanel,
    showSysmon, setShowSysmon,
    showNotifCenter, setShowNotifCenter,
    showMcpPanel, setShowMcpPanel,
    showPalette, setShowPalette,
    showSshModal, setShowSshModal,
    showSquadPanel, setShowSquadPanel,
    showHealingDataset, setShowHealingDataset,
    showRecall, setShowRecall,
    showLoraForge, setShowLoraForge,
    closeOverlays,
  } = usePanelVisibility();

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
  const [viewMode, setViewMode] = useState<ViewMode>("terminal");
  const [aiInput, setAiInput] = useState("");
  const [showAiBar, setShowAiBar] = useState(false);
  const [dismissedBlockId, setDismissedBlockId] = useState<string | null>(null);
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
          try { localStorage.setItem("lum.fileExplorer", next ? "1" : "0"); } catch {}
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
  }, [addTabWithReset, closeTabWithReset, toggleSplit, closeOverlays, activeTabIdRef, setShowCommitPanel, setShowHistorySearch, setShowDiffReview, setShowThemePanel, quickActions, ptyWriteRefs, activePaneIdRef, setShowWorkspace, loadWorkspaces, setShowPalette]);

  const VIEW_BUTTONS: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "terminal", icon: <TerminalSquare size={14} />, label: "터미널" },
    { mode: "list", icon: <LayoutList size={14} />, label: "리스트" },
    { mode: "canvas", icon: <MousePointer2 size={14} />, label: "캔버스" },
  ];

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const lastCmdBlock = cmdBlocks[cmdBlocks.length - 1] ?? null;
  const showBlockBar = lastCmdBlock !== null && lastCmdBlock.id !== dismissedBlockId && !healingError;
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
    <div className="app-root bg-terminal-dark text-white h-screen overflow-hidden flex flex-col">
      <ResizeHandles />
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <header
        data-tauri-drag-region
        className="h-10 border-b border-white/5 flex items-center justify-between px-4 shrink-0 select-none gap-2 min-w-0"
      >
        <div data-tauri-drag-region className="flex items-center gap-4 shrink-0">
          <WindowControls />
          <div data-tauri-drag-region className="flex items-center gap-1.5 text-xs text-white/45 font-medium shrink-0 whitespace-nowrap">
            <Cpu size={12} />
            {specsLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : specs ? (
              <span title={specs.recommendation_reason}>
                {(() => {
                  // gpu_vram_gb는 NVML 감지가 성공하면 set됨 (local-ai 피처 무관)
                  if (specs.gpu_vram_gb && specs.gpu_vram_gb > 0) {
                    return `${specs.gpu_vram_gb}GB VRAM`;
                  }
                  // gpu_type === "integrated" → Apple Silicon 통합 메모리
                  // wgpu(local-ai 피처) 없으면 "none" 반환되므로 navigator로 보강
                  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
                  if (specs.gpu_type === "integrated" || isMac) {
                    return `${specs.total_memory_gb}GB 통합메모리`;
                  }
                  return `${specs.total_memory_gb}GB RAM`;
                })()}
              </span>
            ) : null}
          </div>

          <div className="flex bg-white/5 p-0.5 rounded-md">
            {VIEW_BUTTONS.map(({ mode, icon, label }) => (
              <button
                key={mode}
                aria-label={label}
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={`p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  viewMode === mode ? "bg-white/15 text-white" : "text-white/45 hover:text-white/75"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* 드래그 가능한 spacer — 좌·우 사이의 빈 공간으로 창 이동 */}
        <div data-tauri-drag-region className="flex-1 h-full" />

        <div data-tauri-drag-region className="flex items-center gap-1 min-w-0">
          {(() => {
            // 모델명을 더 짧게 — 마지막 segment에서 흔한 suffix 제거
            const shortName = (n?: string | null) => {
              if (!n) return "";
              const last = n.match(/[^/\\]+$/)?.[0] ?? n;
              return last
                .replace(/-Instruct$/i, "")
                .replace(/-exl2$/i, "")
                .replace(/-MLX-?\d*bit$/i, "")
                .replace(/-\d+bit$/i, "")
                .replace(/-\d+\.\d+bpw$/i, "")
                .replace(/-\d+_\d+$/i, "");
            };
            // 모델 미로드 = loadedModelId가 null/unknown — 'Empty Model' 표시
            const fastEmpty = !loadedModelId;
            const fast = fastEmpty ? "Empty Model" : shortName(loadedModelId);
            const heavy = shortName(heavyModelId);
            return (
              <div data-tauri-drag-region className="flex items-center gap-1 min-w-0 overflow-hidden mr-1">
                <div
                  data-tauri-drag-region
                  className={`text-xs px-2 py-1 rounded-md truncate max-w-[140px] ${
                    fastEmpty
                      ? "bg-white/5 text-white/30 italic"
                      : "bg-blue-400/10 text-blue-300"
                  }`}
                  title={
                    fastEmpty
                      ? "TabbyAPI에 로드된 모델이 없습니다 — XllmPanel에서 모델을 [사용]하세요"
                      : `Fast (TabbyAPI): ${loadedModelId}`
                  }
                >
                  {fastEmpty ? "○" : "⚡"} {fast}
                </div>
                {heavyEnabled && heavy && (
                  <div
                    data-tauri-drag-region
                    className="text-xs px-2 py-1 rounded-md bg-purple-400/10 text-purple-300 truncate max-w-[140px]"
                    title={`Heavy Track (mistral.rs): ${heavyModelId}`}
                  >
                    🚀 {heavy}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Phase 115 — Privacy Ledger 배지 */}
          <PrivacyLedgerBadge
            state={privacyLedger.state}
            isAllOnDevice={privacyLedger.isAllOnDevice}
            onReset={privacyLedger.reset}
          />
          <ToolbarSeparator />

          {/* 그룹 1 — 워크스페이스 / 탐색 */}
          <ToolbarIconButton
            label="파일 탐색기"
            shortcut="⌘B"
            active={showFileExplorer}
            onClick={() => setShowFileExplorer(v => {
              const next = !v;
              try { localStorage.setItem("lum.fileExplorer", next ? "1" : "0"); } catch {}
              return next;
            })}
          >
            <FolderTree size={14} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="워크스페이스"
            shortcut="⌘⇧S"
            active={showWorkspace}
            onClick={() => { setShowWorkspace(true); loadWorkspaces(); }}
          >
            <Layers size={14} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="스크립트 라이브러리"
            shortcut="⌘⇧L"
            active={showScriptPanel}
            onClick={() => { setShowScriptPanel(v => { if (!v) scriptLib.loadScripts(); return !v; }); }}
          >
            <BookOpen size={14} />
          </ToolbarIconButton>

          <ToolbarSeparator />

          {/* 그룹 2 기본 — 매일 쓰는 AI/모델 액션 */}
          <ToolbarIconButton
            label={`추론 토큰 ${showReasoning ? "표시 중" : "숨김"}`}
            tone="cyan"
            active={showReasoning}
            onClick={toggleReasoning}
          >
            <Brain size={14} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="모델 관리"
            onClick={() => setShowModelManager(true)}
          >
            <Package size={14} />
          </ToolbarIconButton>

          <ToolbarSeparator />

          {/* 그룹 2 고급 — toolbar_show_advanced=true면 인라인, 아니면 "더보기" 팝오버 */}
          {toolbarShowAdvanced && (
            <>
              <ToolbarIconButton
                label="MCP 서버"
                active={showMcpPanel}
                onClick={() => setShowMcpPanel(v => !v)}
              >
                <PlugZap size={14} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Worktree Squad"
                active={showSquadPanel}
                badge={squadStore.squads.length > 0}
                onClick={() => { setShowSquadPanel(v => !v); if (!showSquadPanel) squadStore.load(); }}
              >
                <Users size={14} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Auto-Heal 학습 데이터셋"
                tone="cyan"
                active={showHealingDataset}
                onClick={() => setShowHealingDataset(v => !v)}
              >
                <Sparkles size={14} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="메모리 검색 (history/healing/memory)"
                tone="cyan"
                active={showRecall}
                onClick={() => setShowRecall(v => !v)}
              >
                <Library size={14} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="LoRA Forge — 내 데이터로 모델 학습"
                tone="cyan"
                active={showLoraForge}
                onClick={() => setShowLoraForge(v => !v)}
              >
                <Hammer size={14} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="RAG 코드 검색"
                active={showRagPanel}
                onClick={() => setShowRagPanel(v => !v)}
              >
                <Database size={14} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="xLLM 최적화 설정"
                onClick={() => setShowXllmPanel(true)}
              >
                <SlidersHorizontal size={14} />
              </ToolbarIconButton>
              <ToolbarSeparator />
            </>
          )}

          {!toolbarShowAdvanced && (
            <div className="relative">
              <ToolbarIconButton
                label="고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)"
                active={showAdvancedOverflow}
                badge={squadStore.squads.length > 0}
                onClick={() => setShowAdvancedOverflow(v => !v)}
              >
                <SlidersHorizontal size={14} />
              </ToolbarIconButton>
              <AnimatePresence>
                {showAdvancedOverflow && (
                  <motion.div
                    key="advanced-overflow"
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ transformOrigin: "top right" }}
                    className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-white/10 bg-[#0d1117]/95 backdrop-blur-md shadow-xl p-2 space-y-0.5"
                  >
                    <AdvancedRow
                      icon={<PlugZap size={13} />}
                      label="MCP 서버"
                      onClick={() => { setShowAdvancedOverflow(false); setShowMcpPanel(true); }}
                    />
                    <AdvancedRow
                      icon={<Users size={13} />}
                      label="Worktree Squad"
                      badge={squadStore.squads.length > 0}
                      onClick={() => { setShowAdvancedOverflow(false); setShowSquadPanel(true); squadStore.load(); }}
                    />
                    <AdvancedRow
                      icon={<Sparkles size={13} className="text-cyan-300" />}
                      label="Auto-Heal 학습 데이터셋"
                      onClick={() => { setShowAdvancedOverflow(false); setShowHealingDataset(true); }}
                    />
                    <AdvancedRow
                      icon={<Library size={13} className="text-cyan-300" />}
                      label="메모리 검색"
                      onClick={() => { setShowAdvancedOverflow(false); setShowRecall(true); }}
                    />
                    <AdvancedRow
                      icon={<Hammer size={13} className="text-cyan-300" />}
                      label="LoRA Forge"
                      onClick={() => { setShowAdvancedOverflow(false); setShowLoraForge(true); }}
                    />
                    <AdvancedRow
                      icon={<Database size={13} />}
                      label="RAG 코드 검색"
                      onClick={() => { setShowAdvancedOverflow(false); setShowRagPanel(true); }}
                    />
                    <AdvancedRow
                      icon={<SlidersHorizontal size={13} />}
                      label="xLLM 설정"
                      onClick={() => { setShowAdvancedOverflow(false); setShowXllmPanel(true); }}
                    />
                    <div className="h-px bg-white/8 my-1" />
                    <button
                      type="button"
                      onClick={() => { toggleToolbarAdvanced(); setShowAdvancedOverflow(false); }}
                      className="w-full text-left px-2 py-1.5 rounded text-[10.5px] text-white/55 hover:text-white/85 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      툴바에 항상 표시 (고급 기능 펼치기)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {toolbarShowAdvanced && (
            <ToolbarIconButton
              label="고급 기능 접기"
              onClick={toggleToolbarAdvanced}
            >
              <X size={14} />
            </ToolbarIconButton>
          )}

          {/* 그룹 3 — 도구 / 알림 */}
          <ToolbarIconButton
            label="AI Diff 리뷰"
            shortcut="⌘⇧R"
            active={showDiffReview}
            onClick={() => setShowDiffReview(true)}
          >
            <GitCompareArrows size={14} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="시스템 모니터"
            shortcut="⌘⇧M"
            active={showSysmon}
            onClick={() => setShowSysmon(v => !v)}
          >
            <Activity size={14} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="터미널 테마"
            shortcut="⌘,"
            active={showThemePanel}
            onClick={() => setShowThemePanel(true)}
          >
            <Palette size={14} />
          </ToolbarIconButton>
          <div className="relative">
            <ToolbarIconButton
              label="알림 센터"
              active={showNotifCenter}
              badge={notifCenter.unreadCount > 0}
              onClick={() => { setShowNotifCenter(v => !v); if (!showNotifCenter) notifCenter.markAllRead(); }}
            >
              <Bell size={14} />
            </ToolbarIconButton>
            <AnimatePresence>
            {showNotifCenter && (
              <motion.div
                key="notif-center"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ transformOrigin: "top right" }}
              >
                <NotificationCenter
                  notifications={notifCenter.notifications}
                  unreadCount={notifCenter.unreadCount}
                  onMarkAllRead={notifCenter.markAllRead}
                  onDismiss={notifCenter.dismiss}
                  onClear={notifCenter.clear}
                  onClose={() => setShowNotifCenter(false)}
                />
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </header>

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
        <div className="flex items-center border-b border-white/5 bg-[#0d1117] shrink-0 overflow-x-auto">
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
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-white/5 whitespace-nowrap transition-colors group cursor-pointer ${
                tab.id === activeTabId
                  ? "bg-[#161b22] text-white"
                  : "text-white/45 hover:text-white/75 hover:bg-white/3"
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
      <main className="flex-1 overflow-hidden flex relative">
        {showFileExplorer && (
          <div style={{ width: 260 }} className="shrink-0">
            <FileExplorerPanel
              cwd={tabs.find((t) => t.id === activeTabId)?.cwd || ""}
              onClose={() => {
                setShowFileExplorer(false);
                try { localStorage.setItem("lum.fileExplorer", "0"); } catch {}
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
        <div className="flex-1 overflow-hidden relative">
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
            {showBlockBar && lastCmdBlock && (
              <CommandBlockBar
                block={lastCmdBlock}
                onDismiss={() => setDismissedBlockId(lastCmdBlock.id)}
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
            className="border-l border-white/5 shrink-0 overflow-hidden"
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
            className="border-l border-white/5 shrink-0 overflow-hidden"
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
            className="border-l border-white/5 shrink-0 overflow-hidden"
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
            className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-terminal-dark/95 to-transparent pointer-events-none"
          >
            <div className="pointer-events-auto">
              <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm shadow-lg">
                <Zap size={13} className="text-accent shrink-0" />
                <input
                  ref={aiInputRef}
                  className="bg-transparent border-none outline-none text-xs flex-1"
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

      {showModelManager && (
        <Suspense fallback={null}>
          <ModelManager onClose={() => setShowModelManager(false)} />
        </Suspense>
      )}

      {showHistorySearch && (
        <HistorySearch
          model={selectedModel}
          onSelect={handleHistorySelect}
          onClose={() => setShowHistorySearch(false)}
        />
      )}

      {showCommitPanel && (
        <ErrorBoundary label="커밋">
          <CommitPanel
            model={selectedModel}
            onExecute={handleCommitExecute}
            onClose={() => setShowCommitPanel(false)}
          />
        </ErrorBoundary>
      )}

      {showXllmPanel && (
        <Suspense fallback={null}>
          <ErrorBoundary label="xLLM">
            <XllmPanel onClose={() => setShowXllmPanel(false)} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showMcpPanel && (
        <Suspense fallback={null}>
          <ErrorBoundary label="MCP">
            <McpPanel onClose={() => setShowMcpPanel(false)} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showHealingDataset && (
        <Suspense fallback={null}>
          <ErrorBoundary label="Auto-Heal 데이터셋">
            <HealingDatasetPanel onClose={() => setShowHealingDataset(false)} />
          </ErrorBoundary>
        </Suspense>
      )}

      {showRecall && (
        <Suspense fallback={null}>
          <ErrorBoundary label="메모리 검색">
            <RecallPanel
              model={selectedModel}
              onInjectToChat={(text) => { aiChat.sendMessage(`다음 과거 컨텍스트를 참고해서 답해줘:\n\n${text}`); setShowRecall(false); }}
              onClose={() => setShowRecall(false)}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showLoraForge && (
        <Suspense fallback={null}>
          <ErrorBoundary label="LoRA Forge">
            <LoraForgePanel
              onLoadAdapter={(run) => {
                aiChat.sendMessage(
                  `이 LoRA 어댑터를 추론 모델에 적용해줘. 출력 디렉터리: ${run.output_dir}`,
                );
                setShowLoraForge(false);
              }}
              onRevealPath={async (path) => {
                try {
                  const { openPath } = await import("@tauri-apps/plugin-opener");
                  await openPath(path);
                } catch {
                  /* noop */
                }
              }}
              onClose={() => setShowLoraForge(false)}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showSquadPanel && (
        <Suspense fallback={null}>
          <ErrorBoundary label="Squad">
            <SquadPanel
              squads={squadStore.squads}
              loading={squadStore.loading}
              error={squadStore.error}
              currentCwd={tabs.find((t) => t.id === activeTabId)?.cwd ?? ""}
              onCreate={async (task, baseBranch) => {
                const cwd = tabs.find((t) => t.id === activeTabIdRef.current)?.cwd ?? "";
                return squadStore.create(task, cwd, baseBranch);
              }}
              onRemove={squadStore.remove}
              onOpenInTab={(squad) => {
                resetHealing();
                addTab({ cwd: squad.worktree_path, title: `🛡 ${squad.task.slice(0, 18)}` });
                setShowSquadPanel(false);
              }}
              onClose={() => setShowSquadPanel(false)}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showDiffReview && (
        <Suspense fallback={null}>
          <ErrorBoundary label="Diff 리뷰">
            <DiffReviewPanel
              model={selectedModel}
              onClose={() => setShowDiffReview(false)}
            />
          </ErrorBoundary>
        </Suspense>
      )}

      {showThemePanel && (
        <ThemePanel
          appearance={appearance}
          onSave={saveAppearance}
          onClose={() => setShowThemePanel(false)}
        />
      )}

      {showWorkspace && (
        <WorkspacePanel
          currentTabs={wsTabs}
          activeTabId={activeTabId}
          workspaces={workspaces}
          loading={wsLoading}
          onSave={async name => { await saveWorkspace(name, wsTabs, activeTabId); }}
          onRestore={handleRestoreWorkspace}
          onDelete={deleteWorkspace}
          onClose={() => setShowWorkspace(false)}
        />
      )}

      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
        </Suspense>
      )}

      {showPalette && (
        <CommandPalette
          tabs={tabs}
          activeTabId={activeTabId}
          workspaces={workspaces}
          quickActions={quickActions}
          recentHistory={recentCmds}
          onSwitchTab={switchTabWithReset}
          onRestoreWorkspace={handleRestoreWorkspace}
          onRunAction={cmd => {
            ptyWriteRefs.current.get(activePaneIdRef.current)?.(cmd + "\r");
          }}
          onClose={() => setShowPalette(false)}
        />
      )}

      {tabCtxMenu && (
        <TabContextMenu
          tabId={tabCtxMenu.tabId}
          currentColor={contextTab?.color}
          currentGroup={contextTab?.group}
          x={tabCtxMenu.x}
          y={tabCtxMenu.y}
          onSetColor={updateTabColor}
          onSetGroup={updateTabGroup}
          onClose={() => setTabCtxMenu(null)}
        />
      )}

      {showSshModal && (
        <SshConnectModal
          onConnect={handleSshConnect}
          onClose={() => setShowSshModal(false)}
        />
      )}

      {showWelcome && (
        <WelcomeHints
          onClose={() => {
            setShowWelcome(false);
            try { localStorage.setItem("lum.hintsShown", "1"); } catch {}
          }}
        />
      )}
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

// Phase 121 — 툴바 "더보기" 팝오버용 단순 행. 주력 ToolbarIconButton과 분리해 popover 안 텍스트 형식 유지.
const AdvancedRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  badge?: boolean;
  onClick: () => void;
}> = ({ icon, label, badge, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-white/75 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  >
    <span className="shrink-0 text-white/50">{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {badge && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
  </button>
);

export default App;
