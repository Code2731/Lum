import React, { useState, useRef, useCallback, useEffect } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import { useHardwareSpecs } from "./hooks/useHardwareSpecs";
import { useCommandBlocks } from "./hooks/useCommandBlocks";
import { useTabManager, splitId } from "./hooks/useTabManager";
import { useAutoHealing } from "./hooks/useAutoHealing";
import { usePanelVisibility } from "./hooks/usePanelVisibility";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { invoke } from "@tauri-apps/api/core";
import {
  Zap, Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2,
  Package, Database, Plus, X, Columns2, Rows2, SlidersHorizontal, ArrowUpCircle,
} from "lucide-react";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import TerminalPane from "./components/TerminalPane";
import ModelManager from "./components/ModelManager";
import HealingPanel from "./components/HealingPanel";
import RagPanel from "./components/RagPanel";
import CommandBlockBar from "./components/CommandBlockBar";
import HistorySearch from "./components/HistorySearch";
import CommitPanel from "./components/CommitPanel";
import XllmPanel from "./components/XllmPanel";

type ViewMode = "terminal" | "canvas" | "list";

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, processAICommand, analyzeError } = useAIProcessing();
  const { specs, loading: specsLoading } = useHardwareSpecs();
  const { blocks: cmdBlocks, feedRaw } = useCommandBlocks();

  const selectedModel = specs?.recommended_model ?? "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

  const {
    tabs, activeTabId, activePaneId, setActivePaneId,
    activeTabIdRef, activePaneIdRef, ptyWriteRefs,
    addTab, closeTab, switchTab, toggleSplit,
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
    closeOverlays,
  } = usePanelVisibility();

  const { updateInfo, dismissUpdate } = useUpdateCheck();

  const [viewMode, setViewMode] = useState<ViewMode>("terminal");
  const [xllmOnline, setXllmOnline] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [showAiBar, setShowAiBar] = useState(false);
  const [dismissedBlockId, setDismissedBlockId] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  useEffect(() => {
    invoke<boolean>("check_xllm_status")
      .then(setXllmOnline)
      .catch(() => setXllmOnline(false));
  }, []);

  // 새 커맨드 블록 완료 시 시맨틱 히스토리 저장
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
    }
  }, [cmdBlocks, selectedModel]);

  const handleTerminalOutput = useCallback(
    (paneId: string) => (data: string) => {
      if (paneId !== activePaneIdRef.current) return;
      feedRaw(data);
      detectError(data);
    },
    [activePaneIdRef, feedRaw, detectError],
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
      const result = await processAICommand(cmd, selectedModel, "");
      updateBlock(blockId, { output: result?.explanation ?? "", status: "completed" });
    } catch (err) {
      updateBlock(blockId, { output: `Error: ${err}`, status: "error" });
    }
  }, [aiInput, selectedModel, addBlock, updateBlock, processAICommand]);

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
      if (mod && e.key === "k") {
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
      if (e.key === "Escape") {
        setShowAiBar(false);
        closeOverlays();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", captureHandler, { capture: true });
      window.removeEventListener("keydown", handler);
    };
  }, [addTabWithReset, closeTabWithReset, toggleSplit, closeOverlays, activeTabIdRef, setShowCommitPanel, setShowHistorySearch]);

  const VIEW_BUTTONS: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "terminal", icon: <TerminalSquare size={14} />, label: "터미널" },
    { mode: "list", icon: <LayoutList size={14} />, label: "리스트" },
    { mode: "canvas", icon: <MousePointer2 size={14} />, label: "캔버스" },
  ];

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const lastCmdBlock = cmdBlocks[cmdBlocks.length - 1] ?? null;
  const showBlockBar = lastCmdBlock !== null && lastCmdBlock.id !== dismissedBlockId && !healingError;

  return (
    <div className="app-root bg-terminal-dark text-white min-h-screen flex flex-col">
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <header className="h-10 border-b border-white/5 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
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
        <div className="flex items-center gap-2 px-4 py-1.5 bg-accent/10 border-b border-accent/20 shrink-0 text-[11px]">
          <ArrowUpCircle size={12} className="text-accent shrink-0" />
          <span className="text-white/70">
            새 버전 <span className="text-accent font-semibold">v{updateInfo.latest}</span> 출시 — {updateInfo.releaseName}
          </span>
          <a
            href={updateInfo.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-accent hover:text-accent/80 underline underline-offset-2 transition-colors"
          >
            다운로드
          </a>
          <button
            onClick={dismissUpdate}
            className="ml-auto text-white/30 hover:text-white/60 transition-colors"
            aria-label="알림 닫기"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── 탭 바 ─────────────────────────────────────────────── */}
      {viewMode === "terminal" && (
        <div className="flex items-center border-b border-white/5 bg-[#0d1117] shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTabWithReset(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-white/5 whitespace-nowrap transition-colors group ${
                tab.id === activeTabId
                  ? "bg-[#161b22] text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/3"
              }`}
            >
              <TerminalSquare size={10} className="shrink-0" />
              {tab.title}
              {tabs.length > 1 && (
                <span
                  role="button"
                  onClick={(e) => closeTabWithReset(tab.id, e)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity rounded p-0.5 hover:bg-white/10"
                  aria-label={`${tab.title} 닫기`}
                >
                  <X size={9} />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={addTabWithReset}
            aria-label="새 탭 (Cmd+T)"
            title="새 탭 (Cmd+T)"
            className="px-2 py-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors shrink-0"
          >
            <Plus size={12} />
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
                        <TerminalPane
                          id={tab.id}
                          model={selectedModel}
                          onOutput={handleTerminalOutput(tab.id)}
                          onReady={(write) => { ptyWriteRefs.current.set(tab.id, write); }}
                        />
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
                        <TerminalPane
                          id={splitId(tab.id)}
                          model={selectedModel}
                          onOutput={handleTerminalOutput(splitId(tab.id))}
                          onReady={(write) => { ptyWriteRefs.current.set(splitId(tab.id), write); }}
                        />
                      </PaneWrapper>
                    </Panel>
                  </PanelGroup>
                ) : (
                  <div className="flex-1">
                    <TerminalPane
                      id={tab.id}
                      model={selectedModel}
                      onOutput={handleTerminalOutput(tab.id)}
                      onReady={(write) => { ptyWriteRefs.current.set(tab.id, write); }}
                    />
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
            <RagPanel model={selectedModel} onClose={() => setShowRagPanel(false)} />
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
        <CommitPanel
          model={selectedModel}
          onExecute={handleCommitExecute}
          onClose={() => setShowCommitPanel(false)}
        />
      )}

      {showXllmPanel && (
        <XllmPanel onClose={() => setShowXllmPanel(false)} />
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

export default App;
