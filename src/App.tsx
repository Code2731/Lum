import React, { useState, useRef, useCallback } from "react";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import { useHardwareSpecs } from "./hooks/useHardwareSpecs";
import { invoke } from "@tauri-apps/api/core";
import { Zap, Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2, Package } from "lucide-react";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import TerminalPane from "./components/TerminalPane";
import ModelManager from "./components/ModelManager";

type ViewMode = "terminal" | "canvas" | "list";

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, processAICommand } = useAIProcessing();
  const { specs, loading: specsLoading } = useHardwareSpecs();
  const [viewMode, setViewMode] = useState<ViewMode>("terminal");
  const [xllmOnline, setXllmOnline] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);
  // AI 입력은 터미널 뷰에서 오버레이로 표시
  const [aiInput, setAiInput] = useState("");
  const [showAiBar, setShowAiBar] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // xLLM 서버 상태 확인
  React.useEffect(() => {
    invoke<boolean>("check_xllm_status")
      .then(setXllmOnline)
      .catch(() => setXllmOnline(false));
  }, []);

  const selectedModel = specs?.recommended_model ?? "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

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

  // Cmd+K 또는 Ctrl+K: AI 입력 바 토글
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowAiBar((v) => {
          if (!v) setTimeout(() => aiInputRef.current?.focus(), 50);
          return !v;
        });
      }
      if (e.key === "Escape") setShowAiBar(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

          {/* 하드웨어 상태 */}
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

          {/* 뷰 전환 */}
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
            aria-label="모델 관리"
            onClick={() => setShowModelManager(true)}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Package size={13} />
          </button>
        </div>
      </header>

      {/* ── 메인 콘텐츠 ──────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden relative">
        {/* 터미널 뷰 (항상 마운트 — 숨김/표시만 전환해 PTY 세션 유지) */}
        <div className={`absolute inset-0 ${viewMode === "terminal" ? "block" : "hidden"}`}>
          <TerminalPane
            id="main"
            onOutput={(data) => {
              // 터미널 출력을 AI 컨텍스트로 활용 (향후 Self-Healing에 전달)
              void data;
            }}
          />
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
                <div
                  key={block.id}
                  className="p-3 bg-white/5 rounded-lg border border-white/5"
                >
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

        {/* AI 입력 오버레이 (Cmd+K) */}
        {showAiBar && (
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-terminal-dark/95 to-transparent">
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
        )}
      </main>

      {/* 모달 */}
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
