import React, { useState, useEffect, useRef } from "react";
import { Terminal, Clock, Sparkles, Box, Download, Trash2, ChevronRight, Loader2, Copy, RotateCcw, CheckCircle2, AlertCircle, Cpu, LayoutGrid, Settings, HelpCircle } from "lucide-react";
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
  const [history, setHistory] = useState<string[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("llama3");
  const [newModelName, setNewModelName] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [blocks]);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const isOnline: boolean = await invoke("check_ollama_status");
        setOllamaOnline(isOnline);
        if (isOnline) fetchModels();
      } catch { setOllamaOnline(false); }
    };

    const fetchModels = async () => {
      try {
        const modelList: string[] = await invoke("list_models");
        setModels(modelList);
        if (modelList.length > 0 && !modelList.includes(selectedModel)) setSelectedModel(modelList[0]);
      } catch (e) { console.error(e); }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [selectedModel]);

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
    setHistory((prev) => Array.from(new Set([cmd, ...prev])).slice(0, 50));
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
    const analysisId = Date.now().toString();
    const analysisBlock: TerminalBlock = {
      id: analysisId, command: `Analyze: ${block.command}`, output: "", type: "error-analysis", status: "executing",
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
    <div className="flex h-screen w-screen overflow-hidden bg-warp-bg">
      {/* Sidebar - Precision Warp Design */}
      <aside className="w-72 bg-warp-sidebar flex flex-col p-6 space-y-8 h-full border-r border-white/[0.04]">
        <div className="flex items-center space-x-3.5 mb-2 px-2">
          <div className="w-9 h-9 bg-warp-accent rounded-xl flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Cpu className="text-black w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-white leading-tight">LUM</span>
            <span className="text-[9px] font-bold text-warp-accent/60 tracking-widest uppercase">Universal Machine</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col space-y-8 overflow-y-auto pr-2 scrollbar-hide">
          <div className="space-y-3">
            <div className="text-[10px] text-white/20 uppercase tracking-[0.25em] font-black px-3 flex items-center justify-between">
              <span>Installed Models</span>
              <Box className="w-3 h-3" />
            </div>
            <div className="space-y-1">
              {models.map((m) => (
                <div key={m} className={`sidebar-item ${selectedModel === m ? 'active' : ''}`} onClick={() => setSelectedModel(m)}>
                  <div className={`w-1 h-3 rounded-full ${selectedModel === m ? 'bg-warp-accent' : 'bg-transparent'}`} />
                  <span className="text-[13px] font-medium flex-1 truncate">{m}</span>
                  <button onClick={(e) => { e.stopPropagation(); /* Delete Logic */ }} className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[10px] text-white/20 uppercase tracking-[0.25em] font-black px-3">History</div>
            <div className="space-y-1 px-1">
              {history.map((h, i) => (
                <div key={i} className="text-[11px] text-white/30 hover:text-warp-accent cursor-pointer truncate px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all font-mono">{h}</div>
              ))}
            </div>
          </div>
        </nav>

        <div className="pt-6 border-t border-white/[0.04] space-y-4 px-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`status-dot ${ollamaOnline ? "bg-warp-accent" : "bg-red-500"}`} />
              <span className="text-[10px] text-white/40 font-black uppercase tracking-[0.1em]">{ollamaOnline ? "Ollama Ready" : "System Offline"}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Terminal View */}
      <main className="flex-1 flex flex-col h-full bg-[#090b10] relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-12 pt-16 pb-32 space-y-8 scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40">
              <Sparkles className="w-16 h-16 text-warp-accent/20 mb-6" />
              <h1 className="text-2xl font-black text-white/90 mb-2">Welcome to your AI workspace</h1>
              <p className="text-xs text-white/30 font-medium">Start typing to begin or use <kbd className="bg-white/5 border border-white/10 px-1 rounded mx-1">/</kbd> for AI</p>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="warp-block animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="warp-block-header">
                  <div className="flex items-center space-x-4">
                    <div className={`p-1 rounded-md ${block.status === 'executing' ? 'text-warp-accent bg-warp-accent/10' : block.status === 'error' ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'}`}>
                      {block.status === "executing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 
                       block.status === "error" ? <AlertCircle className="w-3.5 h-3.5" /> : 
                       <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <span className="font-mono text-[13px] font-bold text-white/80">{block.command}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-[10px] font-mono text-white/10 tracking-widest">{block.timestamp}</span>
                    <div className="flex items-center space-x-1 border-l border-white/[0.04] pl-4">
                      <button className="p-1.5 text-white/20 hover:text-white hover:bg-white/5 rounded transition-all"><Copy className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 text-white/20 hover:text-white hover:bg-white/5 rounded transition-all"><RotateCcw className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {block.explanation && (
                    <div className="mb-6 flex items-start space-x-4 bg-warp-accent/[0.03] p-4 rounded-xl border border-warp-accent/10">
                      <Sparkles className="w-4 h-4 text-warp-accent mt-0.5" />
                      <div className="text-[12px] text-warp-accent/80 font-medium leading-relaxed italic">
                        {block.explanation}
                      </div>
                    </div>
                  )}

                  {block.analysis && (
                    <div className="mb-6 space-y-4">
                      <div className="text-[12.5px] text-white/60 leading-relaxed p-4 bg-red-500/[0.02] border-l-2 border-red-500/20 rounded-r-xl">
                        <span className="text-red-400 font-black uppercase mr-3 tracking-[0.2em] text-[10px]">AI Diagnosis</span>
                        {block.analysis}
                      </div>
                      {block.suggestion && (
                        <div className="p-4 bg-warp-accent/[0.04] rounded-2xl border border-warp-accent/10 font-mono text-[12.5px] group cursor-pointer hover:bg-warp-accent/[0.08] hover:border-warp-accent/40 transition-all"
                             onClick={() => handleCommandSubmit(block.suggestion!, "shell")}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] text-warp-accent/50 uppercase font-black tracking-widest">Suggested Fix</span>
                            <ChevronRight className="w-3.5 h-3.5 text-warp-accent/30 group-hover:translate-x-1 transition-transform" />
                          </div>
                          <div className="text-warp-accent font-bold">{block.suggestion}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {block.output && (
                    <div className="font-mono text-[13px] leading-relaxed overflow-x-auto terminal-output">
                      <Ansi>{block.output}</Ansi>
                    </div>
                  )}
                  
                  {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                    <button onClick={() => handleAnalyzeError(block)} className="mt-6 flex items-center space-x-2.5 bg-red-500/10 text-red-400 px-4 py-2 rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-all font-black text-[10.5px] uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Analyze Failure</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Floating Dock Experience */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#090b10] via-[#090b10] to-transparent pt-32 pb-4 pointer-events-none">
          <div className="pointer-events-auto">
            <CommandInput onCommandSubmit={handleCommandSubmit} selectedModel={selectedModel} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
