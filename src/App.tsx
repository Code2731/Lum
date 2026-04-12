import React, { useState, useEffect } from "react";
import { Terminal, Clock, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import CommandInput from "./components/CommandInput";

interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  explanation?: string;
  analysis?: string;
  suggestion?: string;
  type: "shell" | "ai" | "error-analysis";
  status: "executing" | "completed" | "error";
}

const App: React.FC = () => {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const isOnline: boolean = await invoke("check_ollama_status");
        setOllamaOnline(isOnline);
      } catch {
        setOllamaOnline(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("pty-data", (event) => {
      setBlocks((prev) => {
        if (currentBlockId) {
          return prev.map((b) => {
            if (b.id === currentBlockId) {
              const newOutput = b.output + event.payload;
              // Simple error detection: if output contains common error patterns
              // In a real PTY, we'd check the exit code, but here we can look for "error" or "not found"
              return { ...b, output: newOutput };
            }
            return b;
          });
        }
        return prev;
      });
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [currentBlockId]);

  const handleCommandSubmit = async (cmd: string, type: "shell" | "ai") => {
    const id = Date.now().toString();
    const newBlock: TerminalBlock = {
      id,
      command: cmd,
      output: "",
      type,
      status: "executing",
    };

    setBlocks((prev) => [...prev, newBlock]);
    setHistory((prev) => [cmd, ...prev].slice(0, 50));

    try {
      if (type === "ai") {
        const result: string = await invoke("generate_ai_command", { prompt: cmd });
        try {
          const parsed = JSON.parse(result);
          setBlocks((prev) =>
            prev.map((b) =>
              b.id === id
                ? {
                    ...b,
                    command: parsed.command,
                    explanation: parsed.explanation,
                    status: "completed",
                  }
                : b
            )
          );
        } catch {
          setBlocks((prev) =>
            prev.map((b) => (b.id === id ? { ...b, output: result, status: "completed" } : b))
          );
        }
      } else {
        setCurrentBlockId(id);
        await invoke("write_to_pty", { data: cmd + "\n" });
      }
    } catch (error) {
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, output: `Error: ${String(error)}`, status: "error" } : b))
      );
    }
  };

  const handleAnalyzeError = async (block: TerminalBlock) => {
    const analysisId = Date.now().toString();
    const analysisBlock: TerminalBlock = {
      id: analysisId,
      command: `Analyze: ${block.command}`,
      output: "Analyzing...",
      type: "error-analysis",
      status: "executing",
    };

    setBlocks((prev) => [...prev, analysisBlock]);

    try {
      const result: string = await invoke("analyze_error", {
        command: block.command,
        stderr: block.output,
      });
      const parsed = JSON.parse(result);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === analysisId
            ? {
                ...b,
                analysis: parsed.analysis,
                suggestion: parsed.suggestion,
                output: "",
                status: "completed",
              }
            : b
        )
      );
    } catch (error) {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === analysisId ? { ...b, output: `Analysis failed: ${String(error)}`, status: "error" } : b
        )
      );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Glass Sidebar */}
      <aside className="w-64 glass-sidebar flex flex-col p-6 space-y-8 h-full">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-lum-cyan rounded-lg flex items-center justify-center shadow-[var(--color-lum-neon-glow)]">
            <Terminal className="text-lum-bg w-6 h-6" />
          </div>
          <span className="text-2xl font-black tracking-tighter text-white">LUM</span>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto pr-2">
          <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">History</div>
          {history.length === 0 ? (
            <div className="text-white/20 text-sm italic">No recent history</div>
          ) : (
            history.map((h, i) => (
              <div key={i} className="flex items-center space-x-3 text-white/50 hover:text-lum-cyan cursor-pointer transition-colors group">
                <Clock className="w-4 h-4 group-hover:scale-110" />
                <span className="truncate text-sm font-medium">{h}</span>
              </div>
            ))
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10 flex items-center space-x-3">
          <div className={`w-2 h-2 rounded-full ${ollamaOnline ? "bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]" : "bg-red-500 shadow-[0_0_8px_#ef4444]"}`} />
          <span className="text-xs text-white/50 font-medium">Ollama: {ollamaOnline ? "Online" : "Offline"}</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-[#0d1117] relative">
        <div className="flex-1 overflow-y-auto p-12 space-y-6 scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <Sparkles className="w-16 h-16 text-lum-cyan/20" />
              <div>
                <h1 className="text-3xl font-black text-white/80 mb-2">Welcome to LUM</h1>
                <p className="text-white/40 max-w-sm">
                  Your local AI-native terminal. Start typing or use <kbd className="bg-white/10 px-1.5 rounded">/</kbd> for AI assistance.
                </p>
              </div>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="terminal-block animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                  <div className="flex items-center space-x-3">
                    <span className="text-white/40 font-mono text-xs">{">"}</span>
                    <span className="font-mono text-sm text-lum-cyan">{block.command}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {block.type === "shell" && block.output.toLowerCase().includes("error") && (
                      <button
                        onClick={() => handleAnalyzeError(block)}
                        className="text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/30 hover:bg-red-500/40 transition-colors"
                      >
                        Analyze Error
                      </button>
                    )}
                    {(block.type === "ai" || block.type === "error-analysis") && (
                      <Sparkles className="w-4 h-4 text-lum-cyan/50" />
                    )}
                  </div>
                </div>

                {block.explanation && (
                  <div className="mb-4 p-3 bg-lum-cyan/5 border-l-2 border-lum-cyan/30 text-xs text-lum-cyan/80 italic">
                    {block.explanation}
                  </div>
                )}

                {block.analysis && (
                  <div className="mb-4 space-y-3">
                    <div className="text-xs text-white/60">
                      <span className="text-lum-cyan font-bold uppercase mr-2 tracking-widest text-[10px]">Analysis:</span>
                      {block.analysis}
                    </div>
                    {block.suggestion && (
                      <div className="p-3 bg-white/5 rounded border border-white/10 font-mono text-sm group cursor-pointer hover:border-lum-cyan/50 transition-colors"
                           onClick={() => handleCommandSubmit(block.suggestion!, "shell")}>
                        <div className="text-[10px] text-white/30 uppercase mb-1">Suggested Fix (Click to run):</div>
                        <div className="text-lum-cyan">{block.suggestion}</div>
                      </div>
                    )}
                  </div>
                )}

                {block.output && (
                  <pre className="font-mono text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                    {block.output}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input Bar Section */}
        <div className="p-12 pt-0">
          <CommandInput onCommandSubmit={handleCommandSubmit} />
        </div>
      </main>
    </div>
  );
};

export default App;
