import React, { useState, useEffect } from "react";
import { History, LayoutGrid, Terminal, Command, Clock, Search, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import CommandInput from "./components/CommandInput";

interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  type: "shell" | "ai";
  status: "executing" | "completed" | "error";
}

const App: React.FC = () => {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen<string>("pty-data", (event) => {
      setBlocks((prev) => {
        if (currentBlockId) {
          return prev.map((b) =>
            b.id === currentBlockId
              ? { ...b, output: b.output + event.payload }
              : b
          );
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
        setBlocks((prev) =>
          prev.map((b) => (b.id === id ? { ...b, output: result, status: "completed" } : b))
        );
      } else {
        setCurrentBlockId(id);
        await invoke("write_to_pty", { data: cmd + "\n" });
        // We don't mark shell commands as "completed" easily without complex PTY tracking
        // but for this MVP, we'll just keep it open for streaming.
      }
    } catch (error) {
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, output: `Error: ${String(error)}`, status: "error" } : b))
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
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]" />
          <span className="text-xs text-white/50 font-medium">Ollama: Online</span>
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
                  {block.type === "ai" && (
                    <Sparkles className="w-4 h-4 text-lum-cyan/50" />
                  )}
                </div>
                <pre className="font-mono text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                  {block.output}
                </pre>
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
