import React, { useState, useEffect, useRef } from "react";
import { Copy, RotateCcw, AlertCircle, CheckCircle2, Box, Settings, Cpu, Zap, Search, Terminal as TerminalIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Ansi from "ansi-to-react";
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
  timestamp: string;
}

const App: React.FC = () => {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("llama3");
  const [context, setContext] = useState({ cwd: "~", git_branch: null });
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks]);

  useEffect(() => {
    const sync = async () => {
      try {
        const [ctx, online]: [any, boolean] = await Promise.all([
          invoke("get_system_context"),
          invoke("check_ollama_status")
        ]);
        setContext(ctx);
        setOllamaOnline(online);
        if (online && models.length === 0) {
          const modelList: string[] = await invoke("list_models");
          setModels(modelList);
        }
      } catch (e) { console.error(e); }
    };
    sync();
    const interval = setInterval(sync, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("pty-data", (event) => {
      setBlocks((prev) => {
        if (currentBlockId) {
          return prev.map((b) => b.id === currentBlockId ? { ...b, output: b.output + event.payload } : b);
        }
        return prev;
      });
    });
    return () => { unlisten.then((f) => f()); };
  }, [currentBlockId]);

  const handleCommandSubmit = async (cmd: string, type: "shell" | "ai") => {
    const id = Date.now().toString();
    const newBlock: TerminalBlock = {
      id, command: cmd, output: "", type, status: "executing",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setBlocks((prev) => [...prev, newBlock]);

    try {
      if (type === "ai") {
        const result: string = await invoke("generate_ai_command", { prompt: cmd, model: selectedModel });
        try {
          const parsed = JSON.parse(result);
          setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, command: parsed.command, explanation: parsed.explanation, status: "completed" } : b));
        } catch { setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, output: result, status: "completed" } : b)); }
      } else {
        setCurrentBlockId(id);
        await invoke("write_to_pty", { data: cmd + "\n" });
      }
    } catch (error) { setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, output: `Error: ${String(error)}`, status: "error" } : b)); }
  };

  const handleAnalyzeError = async (block: TerminalBlock) => {
    const analysisId = `err-${Date.now()}`;
    const analysisBlock: TerminalBlock = {
      id: analysisId, command: `Analyze failure: ${block.command}`, output: "", type: "error-analysis", status: "executing",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setBlocks((prev) => [...prev, analysisBlock]);
    try {
      const result: string = await invoke("analyze_error", { command: block.command, stderr: block.output, model: selectedModel });
      const parsed = JSON.parse(result);
      setBlocks((prev) => prev.map((b) => b.id === analysisId ? { ...b, analysis: parsed.analysis, suggestion: parsed.suggestion, status: "completed" } : b));
    } catch (error) { setBlocks((prev) => prev.map((b) => b.id === analysisId ? { ...b, output: `Analysis failed: ${String(error)}`, status: "error" } : b)); }
  };

  return (
    <div className="flex h-screen w-screen bg-[#0c0c0c] text-[#b0b0b0] font-sans overflow-hidden">
      
      {/* 1. Warp Sidebar (Ultra Slim) */}
      <aside className="w-12 bg-[#080808] border-r border-white/5 flex flex-col items-center py-4 space-y-6 select-none shrink-0">
        <div className="w-8 h-8 bg-warp-accent rounded-md flex items-center justify-center mb-4">
          <Zap className="text-black w-5 h-5 fill-black" />
        </div>
        <div className="mt-auto flex flex-col items-center space-y-6">
          <div className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? 'bg-warp-green' : 'bg-red-500'}`} />
          <Settings className="w-5 h-5 text-white/10 hover:text-white transition-colors cursor-pointer" />
        </div>
      </aside>

      {/* 2. Main Experience: The Warp Block Stream */}
      <main className="flex-1 flex flex-col h-full bg-[#0c0c0c] relative min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-10 select-none">
              <TerminalIcon className="w-20 h-20 mb-4" strokeWidth={1} />
              <h1 className="text-xl font-bold font-mono tracking-tighter">LUM TERMINAL v1.0</h1>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="warp-block">
                <div className="warp-block-active-frame" />
                
                {/* Prompt Line (Warp Style) */}
                <div className="warp-prompt-line">
                  <span className="text-warp-accent font-bold text-[15px]">➜</span>
                  <span className="text-warp-dim text-[11px] font-bold tracking-tight">~/lum-terminal</span>
                  <span className="font-mono text-[13.5px] font-bold text-warp-text-bright truncate">{block.command}</span>
                  
                  <div className="ml-auto flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] text-white/10 font-mono uppercase tracking-widest">{block.status}</span>
                    <div className="flex items-center gap-2 border-l border-white/5 pl-4">
                      <Copy className="w-3.5 h-3.5 text-white/20 hover:text-white cursor-pointer" />
                      <RotateCcw className="w-3.5 h-3.5 text-white/20 hover:text-white cursor-pointer" onClick={() => handleCommandSubmit(block.command, "shell")} />
                    </div>
                  </div>
                </div>

                {/* Output Area */}
                <div className="px-12 pb-4">
                  {block.explanation && (
                    <div className="mb-3 text-[12.5px] text-warp-accent/80 italic border-l border-warp-accent/20 pl-4 py-0.5 leading-relaxed">
                      {block.explanation}
                    </div>
                  )}

                  {block.analysis && (
                    <div className="mb-4 space-y-2">
                      <div className="text-[12px] text-white/60 leading-relaxed p-3 bg-red-500/5 border border-red-500/10 rounded">
                        <span className="text-red-400 font-black uppercase mr-3 tracking-widest text-[9px]">Diagnosis</span>
                        {block.analysis}
                      </div>
                      {block.suggestion && (
                        <div className="p-2 px-3 bg-warp-accent/5 border border-warp-accent/10 rounded font-mono text-[12px] flex items-center justify-between cursor-pointer hover:bg-warp-accent/10 transition-all"
                             onClick={() => handleCommandSubmit(block.suggestion!, "shell")}>
                          <span className="text-warp-accent font-bold">{block.suggestion}</span>
                          <span className="text-[9px] text-white/20 uppercase font-black tracking-widest">Apply Fix</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="font-mono text-[13px] leading-[1.6] text-warp-text-bright overflow-x-auto selection:bg-warp-accent/40 whitespace-pre-wrap">
                    <Ansi>{block.output || (block.status === 'executing' ? 'Executing...' : '')}</Ansi>
                  </div>
                  
                  {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                    <button onClick={() => handleAnalyzeError(block)} className="mt-4 flex items-center gap-2 text-[10px] text-red-400/60 hover:text-red-400 transition-colors font-bold uppercase tracking-widest border border-red-500/10 px-2 py-1 rounded">
                      <Zap className="w-3 h-3" />
                      <span>Diagnose with AI</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 3. The Pinned Warp Editor */}
        <CommandInput 
          onCommandSubmit={handleCommandSubmit} 
          selectedModel={selectedModel} 
          context={context}
        />
      </main>
    </div>
  );
};

export default App;
