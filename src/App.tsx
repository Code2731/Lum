import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
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
import {
  Zap, Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2,
  Package, Database, Plus, X, Columns2, Rows2, SlidersHorizontal, ArrowUpCircle, GitCompareArrows, Palette,
  GitBranch, Container, Layers, Lock, MessageSquare, BookOpen, Bell,
} from "lucide-react";
import SshConnectModal from "./components/SshConnectModal";
import AgentPanel from "./components/AgentPanel";
import AIChatPanel from "./components/AIChatPanel";
import { useAgentLoop } from "./hooks/useAgentLoop";
import { useAIChat } from "./hooks/useAIChat";
import { useEnvAutoDetector } from "./hooks/useEnvAutoDetector";
import EnvSuggestionToast from "./components/EnvSuggestionToast";
import { useScriptLibrary } from "./hooks/useScriptLibrary";
import ScriptLibraryPanel from "./components/ScriptLibraryPanel";
import { useNotificationCenter } from "./hooks/useNotificationCenter";
import NotificationCenter from "./components/NotificationCenter";
import type { SshProfile } from "./hooks/useTabManager";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import TerminalPane from "./components/TerminalPane";
import ModelManager from "./components/ModelManager";
import HealingPanel from "./components/HealingPanel";
import RagPanel from "./components/RagPanel";
import CommandBlockBar from "./components/CommandBlockBar";
import HistorySearch from "./components/HistorySearch";
import CommitPanel from "./components/CommitPanel";
import XllmPanel from "./components/XllmPanel";
import OnboardingWizard from "./components/OnboardingWizard";
import DiffReviewPanel from "./components/DiffReviewPanel";
import ThemePanel from "./components/ThemePanel";
import QuickActionsBar from "./components/QuickActionsBar";
import WorkspacePanel from "./components/WorkspacePanel";
import CommandPalette from "./components/CommandPalette";
import TabContextMenu from "./components/TabContextMenu";
import ResizeHandles from "./components/ResizeHandles";
import WindowControls from "./components/WindowControls";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TAB_COLORS } from "./hooks/useTabManager";

type ViewMode = "terminal" | "canvas" | "list";

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, analyzeError, streamAICommand } = useAIProcessing();
  const { specs, loading: specsLoading } = useHardwareSpecs();
  const { blocks: cmdBlocks, feedRaw } = useCommandBlocks();
  useCommandNotifier(cmdBlocks);

  const selectedModel = specs?.recommended_model ?? "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

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
    closeOverlays,
  } = usePanelVisibility();

  const { appearance, saveAppearance, xtermTheme } = useTerminalTheme();
  const { actions: quickActions, addAction, updateAction, deleteAction, moveAction } = useQuickActions();
  const { workspaces, loading: wsLoading, loadWorkspaces, saveWorkspace, deleteWorkspace } = useWorkspace();

  const { updateInfo, installing, progress, installError, installUpdate, dismissUpdate } = useUpdateCheck();

  // 에이전트 루프 (>> 프리픽스 태스크)
  const agentLoop = useAgentLoop(selectedModel);

  // 환경 파일 자동 감지
  const envDetector = useEnvAutoDetector(activePaneIdRef, ptyWriteRefs);

  // 스크립트 라이브러리
  const scriptLib = useScriptLibrary(activePaneIdRef, ptyWriteRefs);
  const [showScriptPanel, setShowScriptPanel] = useState(false);

  // 알림 센터
  const notifCenter = useNotificationCenter();
  const [showNotifCenter, setShowNotifCenter] = useState(false);

  // AI 채팅 사이드패널
  const [showChatPanel, setShowChatPanel] = useState(false);
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
  const [showPalette, setShowPalette] = useState(false);
  const [showSshModal, setShowSshModal] = useState(false);
  const [tabCtxMenu, setTabCtxMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("terminal");
  const [xllmOnline, setXllmOnline] = useState(false);
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

  useEffect(() => {
    invoke<boolean>("check_xllm_status")
      .then(setXllmOnline)
      .catch(() => setXllmOnline(false));
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

  // 에이전트 태스크 완료 알림
  const agentStatusRef = useRef(agentLoop.state.status);
  useEffect(() => {
    const prev = agentStatusRef.current;
    const cur = agentLoop.state.status;
    agentStatusRef.current = cur;
    if (prev === cur) return;
    if (cur === "done") {
      notifCenter.addNotification({
        type: "agent",
        title: "에이전트 태스크 완료",
        body: agentLoop.state.task || "태스크가 완료되었습니다.",
      });
    } else if (cur === "failed") {
      notifCenter.addNotification({
        type: "agent",
        title: "에이전트 태스크 실패",
        body: agentLoop.state.message || agentLoop.state.task || "태스크 실행 중 오류가 발생했습니다.",
      });
    }
  }, [agentLoop.state.status]);

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

  // 환경 파일 감지 알림
  useEffect(() => {
    if (envDetector.visible && envDetector.suggestions.length > 0) {
      const names = envDetector.suggestions.map(s => s.file).join(", ");
      notifCenter.addNotification({
        type: "env",
        title: "환경 파일 감지",
        body: `${names} — 설치 명령어를 확인하세요.`,
      });
    }
  }, [envDetector.visible]);

  const handleTerminalOutput = useCallback(
    (paneId: string) => (data: string) => {
      if (paneId !== activePaneIdRef.current) return;
      feedRaw(data);
      detectError(data);
      agentLoop.feedOutput(data);
    },
    [activePaneIdRef, feedRaw, detectError, agentLoop.feedOutput],
  );

  // 에이전트 태스크 시작 핸들러 (activeTabIdRef 통해 선언 순서 문제 회피)
  const handleAgentTrigger = useCallback(
    async (task: string) => {
      const currentTab = tabs.find((t) => t.id === activeTabIdRef.current);
      const context = await invoke<string>("get_project_context", {
        path: currentTab?.cwd ?? "",
      }).catch(() => "");
      agentLoop.startTask(task, context);
    },
    [agentLoop.startTask, tabs, activeTabIdRef],
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
      if (mod && e.shiftKey && e.key === "a") { e.preventDefault(); setShowChatPanel(v => !v); }
      if (mod && e.shiftKey && e.key === "l") { e.preventDefault(); setShowScriptPanel(v => { if (!v) scriptLib.loadScripts(); return !v; }); }
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
        setShowPalette(false);
        setTabCtxMenu(null);
        closeOverlays();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", captureHandler, { capture: true });
      window.removeEventListener("keydown", handler);
    };
  }, [addTabWithReset, closeTabWithReset, toggleSplit, closeOverlays, activeTabIdRef, setShowCommitPanel, setShowHistorySearch, setShowDiffReview, setShowThemePanel, quickActions, ptyWriteRefs, activePaneIdRef, setShowWorkspace, loadWorkspaces, setShowPalette, setShowChatPanel]);

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
    <div className="app-root bg-terminal-dark text-white min-h-screen flex flex-col">
      <ResizeHandles />
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <header
        data-tauri-drag-region
        className="h-10 border-b border-white/5 flex items-center justify-between px-4 shrink-0 select-none"
      >
        <div className="flex items-center gap-4">
          <WindowControls />
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-accent" />
            <span className="text-xs font-bold tracking-widest uppercase">LUM</span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-white/40">
            <Cpu size={10} />
            {specsLoading ? (
              <Loader2 size={10} className="animate-spin" />
            ) : specs ? (
              <span title={specs.recommendation_reason}>
                {specs.total_memory_gb}GB ·{" "}
                {specs.gpu_type === "discrete" ? "dGPU" : specs.gpu_type === "integrated" ? "iGPU" : "CPU"}
                {" · "}
                <span className={xllmOnline ? "text-green-400" : "text-red-400"}>
                  {xllmOnline ? "xLLM ●" : "xLLM ○"}
                </span>
              </span>
            ) : null}
          </div>

          <div className="flex bg-white/5 p-0.5 rounded-md">
            {VIEW_BUTTONS.map(({ mode, icon, label }) => (
              <button
                key={mode}
                aria-label={label}
                onClick={() => setViewMode(mode)}
                className={`p-1 rounded transition-colors ${
                  viewMode === mode ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {specs && (
            <div
              className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/40 truncate max-w-[200px]"
              title={specs.recommendation_reason}
            >
              {specs.recommended_model}
            </div>
          )}
          <button
            aria-label="RAG 코드 검색"
            onClick={() => setShowRagPanel((v) => !v)}
            className={`p-1.5 rounded transition-colors ${showRagPanel ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <Database size={13} />
          </button>
          <button
            aria-label="xLLM 최적화 설정"
            onClick={() => setShowXllmPanel(true)}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <SlidersHorizontal size={13} />
          </button>
          <button
            aria-label="워크스페이스 (Cmd+Shift+S)"
            onClick={() => { setShowWorkspace(true); loadWorkspaces(); }}
            className={`p-1.5 rounded transition-colors ${showWorkspace ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <Layers size={13} />
          </button>
          <button
            aria-label="AI Diff Reviewer (Cmd+Shift+R)"
            onClick={() => setShowDiffReview(true)}
            className={`p-1.5 rounded transition-colors ${showDiffReview ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <GitCompareArrows size={13} />
          </button>
          <button
            aria-label="터미널 테마 설정 (Cmd+,)"
            onClick={() => setShowThemePanel(true)}
            className={`p-1.5 rounded transition-colors ${showThemePanel ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <Palette size={13} />
          </button>
          <button
            aria-label="AI Chat (Cmd+Shift+A)"
            onClick={() => setShowChatPanel(v => !v)}
            className={`p-1.5 rounded transition-colors ${showChatPanel ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <MessageSquare size={13} />
          </button>
          <button
            aria-label="스크립트 라이브러리 (Cmd+Shift+L)"
            onClick={() => { setShowScriptPanel(v => { if (!v) scriptLib.loadScripts(); return !v; }); }}
            className={`p-1.5 rounded transition-colors ${showScriptPanel ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <BookOpen size={13} />
          </button>
          {/* 알림 센터 */}
          <div className="relative">
            <button
              aria-label="알림 센터"
              onClick={() => { setShowNotifCenter(v => !v); if (!showNotifCenter) notifCenter.markAllRead(); }}
              className={`p-1.5 rounded transition-colors ${showNotifCenter ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
            >
              <Bell size={13} />
              {notifCenter.unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 text-[8px] flex items-center justify-center pointer-events-none" />
              )}
            </button>
            {showNotifCenter && (
              <NotificationCenter
                notifications={notifCenter.notifications}
                unreadCount={notifCenter.unreadCount}
                onMarkAllRead={notifCenter.markAllRead}
                onDismiss={notifCenter.dismiss}
                onClear={notifCenter.clear}
                onClose={() => setShowNotifCenter(false)}
              />
            )}
          </div>
          <button
            aria-label="모델 관리"
            onClick={() => setShowModelManager(true)}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Package size={13} />
          </button>
        </div>
      </header>

      {/* ── 업데이트 배너 ───────────────────────────────────────── */}
      {updateInfo && (
        <div className="flex flex-col gap-1 px-4 py-1.5 bg-accent/10 border-b border-accent/20 shrink-0">
          <div className="flex items-center gap-2 text-[11px]">
            <ArrowUpCircle size={12} className="text-accent shrink-0" />
            <span className="text-white/70">
              새 버전 <span className="text-accent font-semibold">v{updateInfo.latest}</span> 출시 — {updateInfo.releaseName}
            </span>
            {!installing && (
              <button
                onClick={installUpdate}
                className="ml-1 text-accent hover:text-accent/80 font-medium underline underline-offset-2 transition-colors"
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
              className="ml-auto text-white/30 hover:text-white/60 disabled:opacity-30 transition-colors"
              aria-label="알림 닫기"
            >
              <X size={11} />
            </button>
          </div>
          {installing && progress && progress.total > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-white/40 pb-0.5">
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
        </div>
      )}

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
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-white/5 whitespace-nowrap transition-colors group cursor-pointer ${
                tab.id === activeTabId
                  ? "bg-[#161b22] text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/3"
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
                <span className="text-[9px] text-white/25 font-medium">[{tab.group}]</span>
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
                  className="w-20 bg-transparent border-b border-accent/60 outline-none text-white text-[11px]"
                />
              ) : (
                <>
                  {tab.sshProfile && <Lock size={9} className="text-cyan-400 shrink-0" />}
                  {tab.title}
                </>
              )}
              {tabs.length > 1 && renamingTabId !== tab.id && (
                <span
                  role="button"
                  onClick={(e) => closeTabWithReset(tab.id, e)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity rounded p-0.5 hover:bg-white/10"
                  aria-label={`${tab.title} 닫기`}
                >
                  <X size={9} />
                </span>
              )}
            </div>
          ))}
          <button
            onClick={addTabWithReset}
            aria-label="새 탭 (Cmd+T)"
            title="새 탭 (Cmd+T)"
            className="px-2 py-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors shrink-0"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => setShowSshModal(true)}
            aria-label="SSH 연결 (Cmd+Shift+H)"
            title="SSH 연결 (Cmd+Shift+H)"
            className="px-2 py-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors shrink-0"
          >
            <Lock size={12} />
          </button>

          <div className="ml-auto flex items-center gap-0.5 px-2 shrink-0">
            <button
              onClick={() => toggleSplit("h")}
              aria-label="수평 분할 (Cmd+Shift+D)"
              title="수평 분할 (Cmd+Shift+D)"
              className={`p-1.5 rounded transition-colors ${
                activeTab?.splitDir === "h"
                  ? "text-accent bg-accent/10"
                  : "text-white/30 hover:text-white/70 hover:bg-white/5"
              }`}
            >
              <Columns2 size={12} />
            </button>
            <button
              onClick={() => toggleSplit("v")}
              aria-label="수직 분할 (Cmd+Shift+E)"
              title="수직 분할 (Cmd+Shift+E)"
              className={`p-1.5 rounded transition-colors ${
                activeTab?.splitDir === "v"
                  ? "text-accent bg-accent/10"
                  : "text-white/30 hover:text-white/70 hover:bg-white/5"
              }`}
            >
              <Rows2 size={12} />
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
                          />
                        </ErrorBoundary>
                      </PaneWrapper>
                    </Panel>
                  </PanelGroup>
                ) : (
                  <div className="flex-1">
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
            {/* ── 에이전트 패널 (>> 태스크) ─────────────── */}
            {agentLoop.state.status !== "idle" && (
              <div className="absolute bottom-16 right-4 z-30">
                <AgentPanel
                  state={agentLoop.state}
                  onApprove={() => {
                    const write = ptyWriteRefs.current.get(activePaneIdRef.current);
                    if (write) {
                      agentLoop.approve(
                        agentLoop.state.plan,
                        agentLoop.state.task,
                        (cmd) => write(cmd),
                      );
                    }
                  }}
                  onCancel={agentLoop.cancel}
                  onClose={agentLoop.reset}
                  onSaveScript={(cmds) => {
                    scriptLib.saveScript(agentLoop.state.task || "에이전트 태스크", "", cmds);
                    setShowScriptPanel(true);
                    scriptLib.loadScripts();
                  }}
                />
              </div>
            )}
          </div>

          {viewMode === "canvas" && (
            <InfiniteCanvas blocks={blocks} onNodeMove={moveBlock} />
          )}

          {viewMode === "list" && (
            <div className="p-4 space-y-2 overflow-y-auto h-full">
              {cmdBlocks.length === 0 ? (
                <p className="text-white/20 text-xs text-center pt-12">
                  터미널에서 명령어를 실행하면 여기에 히스토리가 쌓입니다.
                </p>
              ) : (
                [...cmdBlocks].reverse().map((b) => {
                  const success = b.exitCode === 0 || b.exitCode === null;
                  return (
                    <div
                      key={b.id}
                      className={`rounded-lg border overflow-hidden ${success ? "border-white/5" : "border-red-500/20"}`}
                    >
                      <div className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono ${success ? "bg-white/3" : "bg-red-500/5"}`}>
                        <span className={`shrink-0 tabular-nums ${success ? "text-green-400" : "text-red-400"}`}>
                          {success ? "✓" : `✗ ${b.exitCode}`}
                        </span>
                        <span className="text-white/50 truncate">
                          <span className="text-white/25">$ </span>
                          {b.command || "…"}
                        </span>
                        {b.endedAt && (
                          <span className="ml-auto text-white/20 shrink-0 text-[9px]">
                            {new Date(b.endedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      {b.output.trim() && (
                        <pre className="px-3 py-2 text-[10px] font-mono text-white/40 whitespace-pre-wrap line-clamp-6 bg-[#0d1117]">
                          {b.output.trim()}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {showRagPanel && (
          <div className="w-80 border-l border-white/5 shrink-0 overflow-hidden">
            <ErrorBoundary label="RAG">
              <RagPanel model={selectedModel} onClose={() => setShowRagPanel(false)} />
            </ErrorBoundary>
          </div>
        )}

        {showChatPanel && (
          <div className="w-80 border-l border-white/5 shrink-0 overflow-hidden">
            <AIChatPanel
              messages={aiChat.messages}
              streaming={aiChat.streaming}
              onSend={aiChat.sendMessage}
              onClear={aiChat.clear}
              onClose={() => setShowChatPanel(false)}
            />
          </div>
        )}

        {showScriptPanel && (
          <div className="w-72 border-l border-white/5 shrink-0 overflow-hidden">
            <ErrorBoundary label="스크립트 라이브러리">
              <ScriptLibraryPanel
                scripts={scriptLib.scripts}
                loading={scriptLib.loading}
                onLoad={scriptLib.loadScripts}
                onRun={scriptLib.runScript}
                onDelete={scriptLib.deleteScript}
                onSave={async (name, desc, cmds) => { await scriptLib.saveScript(name, desc, cmds); }}
                onClose={() => setShowScriptPanel(false)}
              />
            </ErrorBoundary>
          </div>
        )}

        {showAiBar && (
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-terminal-dark/95 to-transparent pointer-events-none">
            <div className="pointer-events-auto">
              <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
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
              <p className="text-[9px] text-white/20 text-center mt-1">Cmd+K 로 닫기</p>
            </div>
          </div>
        )}
      </main>

      {showModelManager && (
        <ModelManager
          onClose={() => setShowModelManager(false)}
          recommendedModel={specs?.recommended_model}
        />
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
        <ErrorBoundary label="xLLM">
          <XllmPanel onClose={() => setShowXllmPanel(false)} />
        </ErrorBoundary>
      )}

      {showDiffReview && (
        <ErrorBoundary label="Diff 리뷰">
          <DiffReviewPanel
            model={selectedModel}
            onClose={() => setShowDiffReview(false)}
          />
        </ErrorBoundary>
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
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
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
    </div>
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
    case "git":     return <GitBranch size={10} className={cls} />;
    case "node":    return <Package size={10} className={cls} />;
    case "rust":    return <Zap size={10} className={cls} />;
    case "python":  return <Cpu size={10} className={cls} />;
    case "docker":  return <Container size={10} className={cls} />;
    default:        return <TerminalSquare size={10} className={cls} />;
  }
};

export default App;
