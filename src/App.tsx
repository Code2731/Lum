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
import { listen } from "@tauri-apps/api/event";
import {
  Zap, Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2,
  Package, Database, Plus, X, Columns2, Rows2, SlidersHorizontal, ArrowUpCircle, GitCompareArrows, Palette,
  GitBranch, Container, Layers, Lock, BookOpen, Bell, Activity, FolderTree, Brain, PlugZap,
} from "lucide-react";
import SshConnectModal from "./components/SshConnectModal";
import AgentPanel from "./components/AgentPanel";
import { useAgentLoop } from "./hooks/useAgentLoop";
import { useAIChat } from "./hooks/useAIChat";
import { useEnvAutoDetector } from "./hooks/useEnvAutoDetector";
import EnvSuggestionToast from "./components/EnvSuggestionToast";
import { useScriptLibrary } from "./hooks/useScriptLibrary";
import ScriptLibraryPanel from "./components/ScriptLibraryPanel";
import SystemMonitorPanel from "./components/SystemMonitorPanel";
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
import LocalAIPanel from "./components/LocalAIPanel";
import McpPanel from "./components/McpPanel";
import WarpListView from "./components/WarpListView";
import FileExplorerPanel from "./components/FileExplorerPanel";
import WelcomeHints from "./components/WelcomeHints";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TAB_COLORS } from "./hooks/useTabManager";

type ViewMode = "terminal" | "canvas" | "list";

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, analyzeError, streamAICommand } = useAIProcessing();
  const { specs, loading: specsLoading } = useHardwareSpecs();
  const { blocks: cmdBlocks, feedRaw } = useCommandBlocks();
  useCommandNotifier(cmdBlocks);

  // TabbyAPI 로드된 모델 ID + Heavy(mistral.rs) 모델 — 이벤트 기반 즉시 반영
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [heavyModelId, setHeavyModelId] = useState<string | null>(null);
  const [heavyEnabled, setHeavyEnabled] = useState(false);

  const refreshLoadedModel = useCallback(() => {
    invoke<{ id: string }>("get_xllm_model_info")
      .then((info) => setLoadedModelId(info?.id && info.id !== "unknown" ? info.id : null))
      .catch(() => setLoadedModelId(null));
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

  // TabbyAPI 자동 로드 / 설정 저장 / 모델 전환 이벤트 → 즉시 갱신
  useEffect(() => {
    const a = listen<{ stage: string }>("tabby_status", (e: { payload: { stage: string } }) => {
      if (e.payload.stage === "ready" || e.payload.stage === "error") refreshLoadedModel();
    });
    const b = listen<unknown>("xllm_load_progress", () => refreshLoadedModel());
    const c = listen<unknown>("xllm_settings_saved", () => { refreshLoadedModel(); refreshHeavyConfig(); });
    return () => {
      a.then((f: () => void) => f());
      b.then((f: () => void) => f());
      c.then((f: () => void) => f());
    };
  }, [refreshLoadedModel, refreshHeavyConfig]);

  // Phase 72 — 추론 토큰 표시 전역 토글 (툴바 + XllmPanel 공통 상태)
  const [showReasoning, setShowReasoning] = useState(true);
  const [visionEnabled, setVisionEnabled] = useState(false);
  useEffect(() => {
    invoke<{ show_reasoning?: boolean; vision_enabled?: boolean }>("load_app_config")
      .then((c) => {
        setShowReasoning(c.show_reasoning ?? true);
        setVisionEnabled(c.vision_enabled ?? false);
      })
      .catch(() => {});
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
  const [showSysmon, setShowSysmon] = useState(false);

  // 알림 센터
  const notifCenter = useNotificationCenter();
  const [showNotifCenter, setShowNotifCenter] = useState(false);

  // 로컬 AI 패널
  const [showLocalAI, setShowLocalAI] = useState(false);
  const [showMcpPanel, setShowMcpPanel] = useState(false);

  // AI 채팅 사이드패널
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
    const poll = () =>
      invoke<boolean>("check_xllm_status")
        .then(setXllmOnline)
        .catch(() => setXllmOnline(false));
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
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

  // 에이전트 태스크 완료 알림 — status 전환 시점에 task/message 최신값 사용
  const agentStatusRef = useRef(agentLoop.state.status);
  useEffect(() => {
    const prev = agentStatusRef.current;
    const { status, task, message } = agentLoop.state;
    agentStatusRef.current = status;
    if (prev === status) return;
    if (status === "done") {
      notifCenter.addNotification({
        type: "agent",
        title: "에이전트 태스크 완료",
        body: task || "태스크가 완료되었습니다.",
      });
    } else if (status === "failed") {
      notifCenter.addNotification({
        type: "agent",
        title: "에이전트 태스크 실패",
        body: message || task || "태스크 실행 중 오류가 발생했습니다.",
      });
    }
  }, [agentLoop.state]);

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
      agentLoop.feedOutput(data);
    },
    [activePaneIdRef, feedRaw, detectError, agentLoop.feedOutput],
  );

  // 에이전트 태스크 시작 핸들러 (activeTabIdRef 통해 선언 순서 문제 회피)
  const handleAgentTrigger = useCallback(
    async (task: string) => {
      const currentTab = tabs.find((t) => t.id === activeTabIdRef.current);
      const cwd = currentTab?.cwd ?? "";
      const [projectCtx, repoMap] = await Promise.all([
        invoke<string>("get_project_context", { cwd }).catch(() => ""),
        invoke<string>("get_repo_map", { cwd, tokenBudget: 2048 }).catch(() => ""),
      ]);
      const context = [projectCtx, repoMap ? `\n[Repo Map]\n${repoMap}` : ""]
        .filter(Boolean)
        .join("\n");
      agentLoop.startTask(task, context);
    },
    [agentLoop.startTask, tabs, activeTabIdRef],
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
      // 개발자 전용 — 로컬 AI(burn/wgpu) 실험 패널. 기본 빌드에선 커맨드 미등록 상태.
      if (mod && e.shiftKey && e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setShowLocalAI(v => !v);
      }
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
    <div className="app-root bg-terminal-dark text-white h-screen overflow-hidden flex flex-col">
      <ResizeHandles />
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <header
        data-tauri-drag-region
        className="h-10 border-b border-white/5 flex items-center justify-between px-4 shrink-0 select-none"
      >
        <div className="flex items-center gap-4">
          <WindowControls />
          <div className="flex items-center gap-1 text-[10px] text-white/40">
            <Cpu size={10} />
            {specsLoading ? (
              <Loader2 size={10} className="animate-spin" />
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
          {(() => {
            const shortName = (n?: string | null) => {
              if (!n) return "";
              const m = n.match(/[^/\\]+$/);
              return m ? m[0] : n;
            };
            const fast = shortName(loadedModelId ?? specs?.recommended_model);
            const heavy = shortName(heavyModelId);
            if (!fast && !heavy) return null;
            return (
              <div className="flex items-center gap-1">
                {fast && (
                  <div
                    className="text-[10px] px-2 py-1 rounded bg-blue-400/10 text-blue-300 truncate max-w-[200px]"
                    title={loadedModelId ? `Fast (TabbyAPI): ${loadedModelId}` : specs?.recommendation_reason}
                  >
                    ⚡ {fast}
                  </div>
                )}
                {heavyEnabled && heavy && (
                  <div
                    className="text-[10px] px-2 py-1 rounded bg-purple-400/10 text-purple-300 truncate max-w-[200px]"
                    title={`Heavy Track (mistral.rs): ${heavyModelId}`}
                  >
                    🚀 {heavy}
                  </div>
                )}
              </div>
            );
          })()}
          <button
            aria-label="파일 탐색기 (Cmd+B)"
            title="파일 탐색기 (Cmd+B)"
            onClick={() => setShowFileExplorer(v => {
              const next = !v;
              try { localStorage.setItem("lum.fileExplorer", next ? "1" : "0"); } catch {}
              return next;
            })}
            className={`p-1.5 rounded transition-colors ${showFileExplorer ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <FolderTree size={13} />
          </button>
          <button
            aria-label={`추론 토큰 표시 ${showReasoning ? "켜짐" : "꺼짐"} — 클릭 시 토글`}
            title={`🧠 추론 토큰 ${showReasoning ? "표시 중 (ON)" : "숨김 (OFF)"} — DeepSeek R1·EXAONE Deep 등`}
            onClick={toggleReasoning}
            className={`p-1.5 rounded transition-colors ${showReasoning ? "text-cyan-300 bg-cyan-400/10" : "text-white/30 hover:text-white/60 hover:bg-white/10"}`}
          >
            <Brain size={13} />
          </button>
          <button
            aria-label="MCP 서버 (툴 확장)"
            title="MCP 서버 관리 — Filesystem·Playwright·Git 등"
            onClick={() => setShowMcpPanel(v => !v)}
            className={`p-1.5 rounded transition-colors ${showMcpPanel ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <PlugZap size={13} />
          </button>
          <button
            aria-label="RAG 코드 검색"
            onClick={() => setShowRagPanel((v) => !v)}
            className={`p-1.5 rounded transition-colors ${showRagPanel ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <Database size={13} />
          </button>
          {/* 로컬 AI (burn/wgpu) 버튼 제거 — 미완성 실험 인프라.
              접근은 개발자 단축키 Cmd+Shift+Opt+L로만 */}
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
            aria-label="스크립트 라이브러리 (Cmd+Shift+L)"
            onClick={() => { setShowScriptPanel(v => { if (!v) scriptLib.loadScripts(); return !v; }); }}
            className={`p-1.5 rounded transition-colors ${showScriptPanel ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <BookOpen size={13} />
          </button>
          <button
            aria-label="시스템 모니터 (Cmd+Shift+M)"
            title="시스템 모니터 (Cmd+Shift+M)"
            onClick={() => setShowSysmon(v => !v)}
            className={`p-1.5 rounded transition-colors ${showSysmon ? "text-accent bg-accent/10" : "text-white/40 hover:text-white hover:bg-white/10"}`}
          >
            <Activity size={13} />
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
            title="모델 관리 (HuggingFace 다운로드)"
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
                  }}
                />
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

        {showRagPanel && (
          <div className="w-80 border-l border-white/5 shrink-0 overflow-hidden">
            <ErrorBoundary label="RAG">
              <RagPanel model={selectedModel} onClose={() => setShowRagPanel(false)} />
            </ErrorBoundary>
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
                onSave={scriptLib.saveScript}
                onClose={() => setShowScriptPanel(false)}
              />
            </ErrorBoundary>
          </div>
        )}

        {showSysmon && (
          <div className="w-64 border-l border-white/5 shrink-0 overflow-hidden">
            <ErrorBoundary label="시스템 모니터">
              <SystemMonitorPanel onClose={() => setShowSysmon(false)} />
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
          gpuVramGb={specs?.gpu_vram_gb}
          totalMemoryGb={specs?.total_memory_gb}
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

      {showLocalAI && (
        <ErrorBoundary label="로컬 AI">
          <LocalAIPanel onClose={() => setShowLocalAI(false)} />
        </ErrorBoundary>
      )}

      {showMcpPanel && (
        <ErrorBoundary label="MCP">
          <McpPanel onClose={() => setShowMcpPanel(false)} />
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

      {showWelcome && (
        <WelcomeHints
          onClose={() => {
            setShowWelcome(false);
            try { localStorage.setItem("lum.hintsShown", "1"); } catch {}
          }}
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
