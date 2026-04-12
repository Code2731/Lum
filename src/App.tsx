import React, { useState, useEffect, useRef } from "react";
import { Terminal, Clock, Sparkles, Box, Download, Trash2, ChevronRight, Loader2, Copy, RotateCcw, CheckCircle2, AlertCircle, Cpu, ShieldCheck } from "lucide-react";
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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
    <div className="flex h-screen w-screen overflow-hidden bg-warp-bg font-sans">
      {/* Sidebar - Ultramodern Glass */}
      <aside className="w-[280px] bg-warp-sidebar/80 border-r border-white/[0.04] flex flex-col p-8 space-y-10 backdrop-blur-3xl">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-gradient-to-br from-warp-accent to-blue-500 rounded-xl flex items-center justify-center shadow-[var(--shadow-neon)]">
            <Cpu className="text-black w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tight text-white leading-tight">LUM</span>
            <span className="text-[10px] font-bold text-warp-accent/60 tracking-[0.2em] uppercase">Core Engine</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col space-y-10 overflow-y-auto pr-2 scrollbar-hide">
          <div className="space-y-4">
            <div className="text-[10px] text-white/20 uppercase tracking-[0.3em] font-black px-1 flex items-center justify-between">
              <span>Installed Models</span>
              <Box className="w-3 h-3" />
            </div>
            <div className="space-y-2">
              {models.map((m) => (
                <div key={m} className={`group flex items-center justify-between p-3 rounded-xl transition-all duration-300 cursor-pointer ${selectedModel === m ? 'bg-white/[0.06] border border-white/[0.08] shadow-lg' : 'hover:bg-white/[0.03] border border-transparent opacity-40 hover:opacity-100'}`} onClick={() => setSelectedModel(m)}>
                  <div className="flex items-center space-x-3 truncate">
                    <div className={`w-1.5 h-1.5 rounded-full ${selectedModel === m ? 'bg-warp-accent' : 'bg-white/20'}`} />
                    <span className={`text-[13px] truncate font-medium ${selectedModel === m ? 'text-white' : 'text-white/60'}`}>{m}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteModel(m); }} className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center space-x-3 bg-white/[0.02] rounded-xl border border-white/[0.05] focus-within:border-warp-accent/20 transition-all p-2 mt-4">
              <input type="text" placeholder="Pull from Ollama..." className="bg-transparent border-none outline-none text-[11px] text-white/50 p-1 flex-1 min-w-0" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePullModel()} />
              <button onClick={handlePullModel} disabled={isPulling} className="p-2 text-warp-accent/60 hover:text-warp-accent disabled:opacity-20">{isPulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}</button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[10px] text-white/20 uppercase tracking-[0.3em] font-black px-1">Session History</div>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="text-[11px] text-white/30 hover:text-warp-accent cursor-pointer truncate px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all">{h}</div>
              ))}
            </div>
          </div>
        </nav>

        <div className="pt-8 border-t border-white/[0.04] space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center space-x-3">
              <div className={`w-2 h-2 rounded-full ${ollamaOnline ? "bg-warp-accent shadow-[0_0_10px_rgba(0,243,255,0.4)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]"}`} />
              <span className="text-[10px] text-white/50 font-black uppercase tracking-widest">{ollamaOnline ? "System Ready" : "Ollama Down"}</span>
            </div>
            <ShieldCheck className={`w-4 h-4 ${ollamaOnline ? 'text-warp-accent/40' : 'text-red-500/40'}`} />
          </div>
        </div>
      </aside>

      {/* Main Experience */}
      <main className="flex-1 flex flex-col h-full bg-[#090b10] relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 pt-12 pb-24 space-y-8 scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="relative mb-10">
                <Sparkles className="w-20 h-20 text-warp-accent opacity-10 animate-pulse" />
                <div className="absolute inset-0 blur-3xl bg-warp-accent/20 rounded-full" />
              </div>
              <h1 className="text-3xl font-black text-white/90 mb-3 tracking-tighter">LUM TERMINAL</h1>
              <p className="text-sm text-white/30 font-medium max-w-[280px]">AI-Powered workspace running <span className="text-warp-accent">{selectedModel}</span> locally.</p>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="warp-block animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="warp-block-header">
                  <div className="flex items-center space-x-4 overflow-hidden">
                    <div className={`p-1.5 rounded-lg ${block.status === 'executing' ? 'bg-warp-accent/10' : block.status === 'error' ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                      {block.status === "executing" ? <Loader2 className="w-3.5 h-3.5 text-warp-accent animate-spin" /> : 
                       block.status === "error" ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : 
                       <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    </div>
                    <span className="font-mono text-[13px] font-bold text-white/80 truncate leading-none">{block.command}</span>
                  </div>
                  <div className="flex items-center space-x-6 shrink-0">
                    <span className="text-[10px] font-black text-white/10 font-mono tracking-widest">{block.timestamp}</span>
                    <div className="flex items-center space-x-1 border-l border-white/[0.04] pl-4">
                      <button className="icon-button"><Copy className="w-3.5 h-3.5" /></button>
                      <button className="icon-button"><RotateCcw className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {block.explanation && (
                    <div className="mb-6 flex items-start space-x-4 bg-warp-accent/[0.03] p-4 rounded-xl border border-warp-accent/10">
                      <Sparkles className="w-4 h-4 text-warp-accent mt-0.5 shrink-0" />
                      <div className="text-[12px] text-warp-accent/80 leading-relaxed font-medium">
                        {block.explanation}
                      </div>
                    </div>
                  )}

                  {block.analysis && (
                    <div className="mb-6 space-y-4">
                      <div className="text-[12px] text-white/60 leading-relaxed p-4 bg-red-500/[0.02] border-l-2 border-red-500/20 rounded-r-xl">
                        <span className="text-red-400 font-black uppercase mr-3 tracking-[0.2em] text-[10px]">Failure Analysis</span>
                        {block.analysis}
                      </div>
                      {block.suggestion && (
                        <div className="p-4 bg-warp-accent/5 rounded-2xl border border-warp-accent/10 font-mono text-[12px] group cursor-pointer hover:bg-warp-accent/10 hover:border-warp-accent/30 transition-all"
                             onClick={() => handleCommandSubmit(block.suggestion!, "shell")}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] text-warp-accent/50 uppercase font-black tracking-widest">Recommended Fix</span>
                            <ChevronRight className="w-3.5 h-3.5 text-warp-accent/30 group-hover:translate-x-1 transition-transform" />
                          </div>
                          <div className="text-warp-accent font-bold">{block.suggestion}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {block.output && (
                    <div className="relative group">
                      <pre className="font-mono text-[13px] text-white/70 whitespace-pre-wrap leading-relaxed overflow-x-auto selection:bg-warp-accent/40">
                        {block.output}
                      </pre>
                    </div>
                  )}
                  
                  {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                    <button onClick={() => handleAnalyzeError(block)} className="mt-6 flex items-center space-x-2.5 bg-red-500/10 text-red-400 px-4 py-2 rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-all font-bold text-[11px] uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Diagnose with AI</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* The Dock */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/95 to-transparent pt-20 pb-2 pointer-events-none">
          <div className="pointer-events-auto">
            <CommandInput onCommandSubmit={handleCommandSubmit} selectedModel={selectedModel} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
