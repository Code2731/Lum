import React, { useState } from "react";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import { useHardwareSpecs } from "./hooks/useHardwareSpecs";
import { invoke } from "@tauri-apps/api/core";
import { Zap, Cpu, Loader2 } from "lucide-react";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import { LayoutList, MousePointer2 } from "lucide-react";

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, processAICommand } = useAIProcessing();
  const { specs, loading: specsLoading } = useHardwareSpecs();
  const [viewMode, setViewMode] = useState<"list" | "canvas">("canvas");
  const [xllmOnline, setXllmOnline] = useState(false);

  // xLLM 서버 상태 확인
  React.useEffect(() => {
    invoke<boolean>("check_xllm_status")
      .then(setXllmOnline)
      .catch(() => setXllmOnline(false));
  }, []);

  // 추천 모델 or 기본 모델
  const selectedModel = specs?.recommended_model ?? "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

  return (
    <div className="app-root bg-terminal-dark text-white min-h-screen flex flex-col">
      <header className="h-10 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-accent" />
            <span className="text-xs font-bold tracking-widest uppercase">LUM 2.0 Spatial</span>
          </div>

          {/* 하드웨어 사양 표시 */}
          <div className="flex items-center gap-1 text-[10px] text-white/40">
            <Cpu size={10} />
            {specsLoading ? (
              <Loader2 size={10} className="animate-spin" />
            ) : specs ? (
              <span title={specs.recommendation_reason}>
                {specs.total_memory_gb}GB RAM ·{" "}
                {specs.gpu_type === "discrete"
                  ? "Discrete GPU"
                  : specs.gpu_type === "integrated"
                  ? "iGPU"
                  : "CPU"}{" "}
                · <span className={xllmOnline ? "text-green-400" : "text-red-400"}>
                  {xllmOnline ? "xLLM ●" : "xLLM ○"}
                </span>
              </span>
            ) : null}
          </div>

          <div className="flex bg-white/5 p-1 rounded-md ml-4">
            <button
              aria-label="list view"
              onClick={() => setViewMode("list")}
              className={`p-1 rounded ${viewMode === "list" ? "bg-white/10 text-white" : "text-white/40"}`}
            >
              <LayoutList size={14} />
            </button>
            <button
              aria-label="canvas view"
              onClick={() => setViewMode("canvas")}
              className={`p-1 rounded ${viewMode === "canvas" ? "bg-white/10 text-white" : "text-white/40"}`}
            >
              <MousePointer2 size={14} />
            </button>
          </div>
        </div>

        {/* 추천 모델 뱃지 */}
        {specs && (
          <div
            className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/50 truncate max-w-xs"
            title={specs.recommendation_reason}
          >
            {specs.recommended_model}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-hidden relative">
        {viewMode === "canvas" ? (
          <InfiniteCanvas blocks={blocks} onNodeMove={moveBlock} />
        ) : (
          <div className="p-4 space-y-4 overflow-y-auto h-full">
            {blocks.map((block) => (
              <div key={block.id} className="block-card p-3 bg-white/5 rounded-lg border border-white/5">
                <pre className="text-xs font-mono">{block.command}</pre>
                {block.output && (
                  <pre className="text-xs font-mono text-white/60 mt-1">{block.output}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="h-12 border-t border-white/5 px-4 flex items-center">
        <div className="flex-1 flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <input
            className="bg-transparent border-none outline-none text-xs flex-1"
            placeholder="궁금한 것이나 명령어를 입력하세요 (/명령어, ?검색)"
            disabled={isProcessing}
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              const cmd = e.currentTarget.value.trim();
              if (!cmd) return;
              e.currentTarget.value = "";
              const blockId = addBlock({ command: cmd, type: "ai" });
              try {
                const result = await processAICommand(cmd, selectedModel, "");
                updateBlock(blockId, { output: result?.explanation ?? "", status: "completed" });
              } catch (err) {
                updateBlock(blockId, { output: `Error: ${err}`, status: "error" });
              }
            }}
          />
        </div>
      </footer>
    </div>
  );
};

export default App;
