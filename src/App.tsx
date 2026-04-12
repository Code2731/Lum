import React, { useState, useEffect, useRef } from "react";
import { Terminal, Clock, Sparkles, Box, Download, Trash2, ChevronRight, Loader2, Copy, RotateCcw, CheckCircle2, AlertCircle, Cpu, Zap } from "lucide-react";
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
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
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

  const handlePullModel = async () => {
    if (!newModelName) return;
    setIsPulling(true);
    try {
      await invoke("pull_model", { name: newModelName });
      const modelList: string[] = await invoke("list_models");
      setModels(modelList);
      setNewModelName("");
    } catch (e) { alert(e); } finally { setIsPulling(false); }
  };

  const handleDeleteModel = async (name: string) => {
    if (!confirm(`Delete model ${name}?`)) return;
    try {
      await invoke("delete_model", { name });
      const modelList: string[] = await invoke("list_models");
      setModels(modelList);
    } catch (e) { alert(e); }
  };

  return (
    <div className="flex h-screen w-screen bg-warp-bg font-sans overflow-hidden">
      
      {/* 1. Warp Sidebar: Minimal & Unified */}
      <aside className="w-64 bg-warp-sidebar border-r border-warp-border flex flex-col p-6 space-y-8 select-none shrink-0">
        <div className="flex items-center space-x-3 mb-2 px-1">
          <div className="w-8 h-8 bg-warp-accent rounded flex items-center justify-center">
            <Zap className="text-black w-5 h-5 fill-black" />
          </div>
          <span className="text-xl font-black text-white tracking-tight">LUM</span>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-6 scrollbar-hide">
          <div className="space-y-3">
            <div className="text-[10px] text-warp-dim uppercase tracking-widest font-black px-3">Models</div>
            <div className="space-y-1">
              {models.map((m) => (
                <div key={m} className={`warp-nav-item group ${selectedModel === m ? 'active' : ''}`} onClick={() => setSelectedModel(m)}>
                  <span className="truncate flex-1 font-medium">{m}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteModel(m); }} className="opacity-0 group-hover:opacity-100 p-1 text-warp-dim hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="px-3">
              <div className="flex items-center space-x-2 bg-white/5 rounded border border-white/5 focus-within:border-warp-accent/30 transition-all p-1.5">
                <input type="text" placeholder="Pull model..." className="bg-transparent border-none outline-none text-[10px] text-white/50 p-1 flex-1 min-w-0" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePullModel()} />
                <button onClick={handlePullModel} disabled={isPulling} className="p-1 text-warp-accent/60 hover:text-warp-accent disabled:opacity-30">{isPulling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}</button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[10px] text-warp-dim uppercase tracking-widest font-black px-3">History</div>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="text-[11px] text-warp-dim hover:text-white cursor-pointer truncate px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-all font-mono">{h}</div>
              ))}
            </div>
          </div>
        </nav>

        <div className="pt-6 border-t border-warp-border flex items-center justify-between text-[10px]">
          <div className="flex items-center space-x-2">
            <div className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? "bg-warp-accent shadow-[0_0_10px_rgba(0,243,255,0.4)]" : "bg-red-500"}`} />
            <span className="text-warp-dim font-bold uppercase tracking-wider">{ollamaOnline ? "Ready" : "Offline"}</span>
          </div>
          <span className="text-white/10 font-mono tracking-widest">v1.0.0</span>
        </div>
      </aside>

      {/* 2. Main Terminal: The Iconic Block Stream */}
      <main className="flex-1 flex flex-col h-full bg-warp-bg relative min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 space-y-6 scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
              <Sparkles className="w-16 h-16 text-warp-accent mb-6" />
              <h1 className="text-2xl font-black text-white/90 mb-2">Welcome to LUM Workspace</h1>
              <p className="text-xs text-warp-dim font-medium">Your AI-native terminal using <span className="text-warp-accent">{selectedModel}</span>.</p>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="warp-block-card animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Block Header */}
                <div className="warp-block-header">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    {block.status === "executing" ? <Loader2 className="w-3.5 h-3.5 text-warp-accent animate-spin" /> : 
                     block.status === "error" ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : 
                     <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    <span className="font-mono text-[13px] font-bold text-white/90 truncate">{block.command}</span>
                  </div>
                  <div className="flex items-center space-x-4 shrink-0">
                    <span className="text-[10px] text-warp-dim font-mono tracking-widest">{block.timestamp}</span>
                    <div className="flex items-center space-x-2 border-l border-warp-border pl-4">
                      <button className="p-1 text-warp-dim hover:text-white transition-all"><Copy className="w-3.5 h-3.5" /></button>
                      <button className="p-1 text-warp-dim hover:text-white transition-all"><RotateCcw className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>

                {/* Block Body */}
                <div className="p-5">
                  {block.explanation && (
                    <div className="mb-4 text-[12px] text-warp-accent/80 italic border-l-2 border-warp-accent/30 pl-4 py-0.5 leading-relaxed">
                      {block.explanation}
                    </div>
                  )}

                  {block.analysis && (
                    <div className="mb-5 space-y-4">
                      <div className="text-[12px] text-white/70 leading-relaxed p-4 bg-red-500/[0.03] border-l-2 border-red-500/20 rounded-r-lg">
                        <span className="text-red-400 font-black uppercase mr-3 tracking-[0.2em] text-[10px]">Failure Analysis</span>
                        {block.analysis}
                      </div>
                      {block.suggestion && (
                        <div className="p-4 bg-warp-accent/[0.04] rounded-xl border border-warp-accent/10 font-mono text-[12px] group cursor-pointer hover:bg-warp-accent/[0.08] hover:border-warp-accent/30 transition-all"
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
                    <div className="font-mono text-[13px] leading-relaxed text-[#f3f4f6] overflow-x-auto selection:bg-warp-accent/30">
                      <Ansi>{block.output}</Ansi>
                    </div>
                  )}
                  
                  {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                    <button onClick={() => handleAnalyzeError(block)} className="mt-4 flex items-center space-x-2 text-[10.5px] bg-red-500/10 text-red-400 px-4 py-2 rounded-lg border border-red-500/10 hover:bg-red-500/20 transition-all font-black uppercase tracking-widest">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ask AI for a Fix</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 3. The Warp Input Dock: Unified at Bottom */}
        <div className="bg-gradient-to-t from-warp-bg via-warp-bg to-transparent pt-32 pb-6 px-12">
          <CommandInput onCommandSubmit={handleCommandSubmit} selectedModel={selectedModel} />
        </div>
      </main>
    </div>
  );
};

export default App;
