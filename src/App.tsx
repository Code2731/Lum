import React, { useState } from "react";
import { useTerminalBlocks } from "./hooks/useTerminalBlocks";
import { useAIProcessing } from "./hooks/useAIProcessing";
import { Zap } from "lucide-react";
import InfiniteCanvas from "./components/layout/InfiniteCanvas";
import { LayoutList, MousePointer2 } from "lucide-react";

const App: React.FC = () => {
  const { blocks, addBlock, updateBlock, moveBlock } = useTerminalBlocks();
  const { isProcessing, processAICommand } = useAIProcessing();
  const [viewMode, setViewMode] = useState<"list" | "canvas">("canvas");

  return (
    <div className="app-root bg-terminal-dark text-white min-h-screen flex flex-col">
      <header className="h-10 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-accent" />
            <span className="text-xs font-bold tracking-widest uppercase">LUM 2.0 Spatial</span>
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
      </header>

      <main className="flex-1 overflow-hidden relative">
        {viewMode === "canvas" ? (
          <InfiniteCanvas blocks={blocks} onNodeMove={moveBlock} />
        ) : (
          <div className="p-4 space-y-4 overflow-y-auto h-full">
            {blocks.map((block) => (
              <div key={block.id} className="block-card p-3 bg-white/5 rounded-lg border border-white/5">
                <pre className="text-xs font-mono">{block.command}</pre>
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
                const result = await processAICommand(cmd, "llama3", "");
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
