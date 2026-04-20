import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import { useHardwareSpecs } from "./hooks/useHardwareSpecs";
import { invoke } from "@tauri-apps/api/core";
import { Zap, Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2, Package, Database, Plus, X } from "lucide-react";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import TerminalPane from "./components/TerminalPane";
import ModelManager from "./components/ModelManager";
import HealingPanel, { type HealingResult } from "./components/HealingPanel";
import RagPanel from "./components/RagPanel";

const stripAnsi = (s: string) =>
  s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");

const ERROR_PATTERNS = [
  /command not found/i,
  /no such file or directory/i,
  /permission denied/i,
  /enoent/i,
  /npm err!/i,
  /error:/i,
  /traceback \(most recent call last\)/i,
  /syntaxerror/i,
  /typeerror/i,
  /exception in thread/i,
  /cargo.*error/i,
  /build failed/i,
];

type ViewMode = "terminal" | "canvas" | "list";

interface Tab {
  id: string;
  title: string;
}

let tabCounter = 1;
const makeTab = (): Tab => ({ id: `tab-${Date.now()}`, title: `Shell ${tabCounter++}` });

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, processAICommand, analyzeError } = useAIProcessing();
  const { specs, loading: specsLoading } = useHardwareSpecs();

  const [viewMode, setViewMode] = useState<ViewMode>("terminal");
  const [xllmOnline, setXllmOnline] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);
  const [showRagPanel, setShowRagPanel] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [showAiBar, setShowAiBar] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // 탭 상태
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id ?? "");

  // 탭별 PTY 쓰기 함수
  const ptyWriteRefs = useRef<Map<string, (d: string) => void>>(new Map());

  // Self-Healing — 활성 탭 기준
  const [healingError, setHealingError] = useState<string | null>(null);
  const [healingResult, setHealingResult] = useState<HealingResult | null>(null);
  const [isHealingAnalyzing, setIsHealingAnalyzing] = useState(false);
  const outputBufRef = useRef("");
  const errorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  useEffect(() => {
    invoke<boolean>("check_xllm_status")
      .then(setXllmOnline)
      .catch(() => setXllmOnline(false));
  }, []);

  const selectedModel = specs?.recommended_model ?? "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

  // 새 탭 생성
  const addTab = useCallback(() => {
    const tab = makeTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    // 탭 전환 시 healing 상태 초기화
    setHealingError(null);
    setHealingResult(null);
    outputBufRef.current = "";
  }, []);

  // 탭 닫기
  const closeTab = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      invoke("close_pty", { id }).catch(() => {});
      ptyWriteRefs.current.delete(id);

      setTabs((prev) => {
        if (prev.length === 1) return prev; // 마지막 탭은 닫지 않음
        const next = prev.filter((t) => t.id !== id);
        if (id === activeTabIdRef.current) {
          const idx = prev.findIndex((t) => t.id === id);
          const nextActive = next[Math.min(idx, next.length - 1)];
          setActiveTabId(nextActive.id);
        }
        return next;
      });
      setHealingError(null);
      setHealingResult(null);
    },
    [],
  );

  // 탭 전환
  const switchTab = useCallback((id: string) => {
    setActiveTabId(id);
    setHealingError(null);
    setHealingResult(null);
    outputBufRef.current = "";
  }, []);

  // 활성 탭 출력 → 에러 감지
  const handleTerminalOutput = useCallback(
    (tabId: string) => (data: string) => {
      if (tabId !== activeTabIdRef.current) return;
      const text = stripAnsi(data);
      outputBufRef.current += text;
      if (outputBufRef.current.length > 3000) {
        outputBufRef.current = outputBufRef.current.slice(-3000);
      }
      if (errorDebounceRef.current) clearTimeout(errorDebounceRef.current);
      errorDebounceRef.current = setTimeout(() => {
        const buf = outputBufRef.current;
        outputBufRef.current = "";
        if (ERROR_PATTERNS.some((p) => p.test(buf))) {
          const snippet = buf.split("\n").filter((l) => l.trim()).slice(-5).join("\n");
          setHealingError(snippet);
          setHealingResult(null);
        }
      }, 800);
    },
    [],
  );

  // AI 에러 분석
  const handleHealingAnalyze = useCallback(async () => {
    if (!healingError) return;
    setIsHealingAnalyzing(true);
    try {
      const res = await analyzeError("", healingError, selectedModel, "");
      const suggestion: string = res?.suggestion ?? "";
      let safetyLevel: HealingResult["safetyLevel"] = "Safe";
      if (suggestion) {
        const report = await invoke<{ level: HealingResult["safetyLevel"] }>(
          "verify_command_safety",
          { command: suggestion },
        );
        safetyLevel = report.level;
      }
      setHealingResult({
        analysis: res?.analysis ?? "분석 결과를 가져오지 못했습니다.",
        suggestion,
        safetyLevel,
      });
    } catch {
      setHealingResult({
        analysis: "AI 분석에 실패했습니다. xLLM 서버 상태를 확인하세요.",
        suggestion: "",
        safetyLevel: "Blocked",
      });
    } finally {
      setIsHealingAnalyzing(false);
    }
  }, [healingError, selectedModel, analyzeError]);

  // 제안 커맨드 → 활성 탭 PTY 실행
  const handleHealingExecute = useCallback((cmd: string) => {
    ptyWriteRefs.current.get(activeTabIdRef.current)?.(cmd + "\n");
    setHealingError(null);
    setHealingResult(null);
  }, []);

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

  // 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowAiBar((v) => {
          if (!v) setTimeout(() => aiInputRef.current?.focus(), 50);
          return !v;
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        addTab();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
        closeTab(activeTabIdRef.current, fakeEvent);
      }
      if (e.key === "Escape") setShowAiBar(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addTab, closeTab]);

  const VIEW_BUTTONS: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "terminal", icon: <TerminalSquare size={14} />, label: "터미널" },
    { mode: "list", icon: <LayoutList size={14} />, label: "리스트" },
    { mode: "canvas", icon: <MousePointer2 size={14} />, label: "캔버스" },
  ];

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
            aria-label="모델 관리"
            onClick={() => setShowModelManager(true)}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Package size={13} />
          </button>
        </div>
      </header>

      {/* ── 탭 바 (터미널 뷰에서만 표시) ─────────────────────── */}
      {viewMode === "terminal" && (
        <div className="flex items-center border-b border-white/5 bg-[#0d1117] shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
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
                  onClick={(e) => closeTab(tab.id, e)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity rounded p-0.5 hover:bg-white/10"
                  aria-label={`${tab.title} 닫기`}
                >
                  <X size={9} />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={addTab}
            aria-label="새 탭 (Cmd+T)"
            title="새 탭 (Cmd+T)"
            className="px-2 py-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors shrink-0"
          >
            <Plus size={12} />
          </button>
        </div>
      )}

      {/* ── 메인 콘텐츠 ──────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex relative">
        <div className="flex-1 overflow-hidden relative">
          {/* 터미널 뷰 — 모든 탭 마운트 유지, 활성 탭만 표시 */}
          <div className={`absolute inset-0 ${viewMode === "terminal" ? "block" : "hidden"}`}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`absolute inset-0 ${tab.id === activeTabId ? "block" : "hidden"}`}
              >
                <TerminalPane
                  id={tab.id}
                  onOutput={handleTerminalOutput(tab.id)}
                  onReady={(write) => { ptyWriteRefs.current.set(tab.id, write); }}
                />
              </div>
            ))}
            {healingError && (
              <HealingPanel
                errorSnippet={healingError}
                result={healingResult}
                isAnalyzing={isHealingAnalyzing}
                onAnalyze={handleHealingAnalyze}
                onExecute={handleHealingExecute}
                onDismiss={() => { setHealingError(null); setHealingResult(null); }}
              />
            )}
          </div>

          {/* 캔버스 뷰 */}
          {viewMode === "canvas" && (
            <InfiniteCanvas blocks={blocks} onNodeMove={moveBlock} />
          )}

          {/* 리스트 뷰 */}
          {viewMode === "list" && (
            <div className="p-4 space-y-3 overflow-y-auto h-full">
              {blocks.length === 0 ? (
                <p className="text-white/20 text-xs text-center pt-12">
                  Cmd+K 로 AI에게 질문하세요.
                </p>
              ) : (
                blocks.map((block) => (
                  <div key={block.id} className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <pre className="text-xs font-mono text-accent">{block.command}</pre>
                    {block.output && (
                      <pre className="text-xs font-mono text-white/60 mt-1 whitespace-pre-wrap">
                        {block.output}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* RAG 사이드 패널 */}
        {showRagPanel && (
          <div className="w-80 border-l border-white/5 shrink-0 overflow-hidden">
            <RagPanel model={selectedModel} onClose={() => setShowRagPanel(false)} />
          </div>
        )}

        {/* AI 입력 오버레이 (Cmd+K) */}
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
    </div>
  );
};

export default App;
