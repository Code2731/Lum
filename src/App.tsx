import React, { useState, useEffect, useRef } from "react";
import { Terminal, Clock, Sparkles, Box, Download, Trash2, ChevronRight, Loader2, Copy, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
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
      } catch {
        setOllamaOnline(false);
      }
    };

    const fetchModels = async () => {
      try {
        const modelList: string[] = await invoke("list_models");
        setModels(modelList);
        if (modelList.length > 0 && !modelList.includes(selectedModel)) {
          setSelectedModel(modelList[0]);
        }
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
          return prev.map((b) =>
            b.id === currentBlockId ? { ...b, output: b.output + event.payload } : b
          );
        }
        return prev;
      });
    });
    return () => { unlisten.then((f) => f()); };
  }, [currentBlockId]);

  const handleCommandSubmit = async (cmd: string, type: "shell" | "ai") => {
    const id = Date.now().toString();
    const newBlock: TerminalBlock = {
      id,
      command: cmd,
      output: "",
      type,
      status: "executing",
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
        } catch {
          setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, output: result, status: "completed" } : b));
        }
      } else {
        setCurrentBlockId(id);
        await invoke("write_to_pty", { data: cmd + "\n" });
      }
    } catch (error) {
      setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, output: `Error: ${String(error)}`, status: "error" } : b));
    }
  };

  const handleAnalyzeError = async (block: TerminalBlock) => {
    const analysisId = Date.now().toString();
    const analysisBlock: TerminalBlock = {
      id: analysisId,
      command: `Analyze: ${block.command}`,
      output: "",
      type: "error-analysis",
      status: "executing",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setBlocks((prev) => [...prev, analysisBlock]);
    try {
      const result: string = await invoke("analyze_error", { command: block.command, stderr: block.output, model: selectedModel });
      const parsed = JSON.parse(result);
      setBlocks((prev) => prev.map((b) => b.id === analysisId ? { ...b, analysis: parsed.analysis, suggestion: parsed.suggestion, status: "completed" } : b));
    } catch (error) {
      setBlocks((prev) => prev.map((b) => b.id === analysisId ? { ...b, output: `Analysis failed: ${String(error)}`, status: "error" } : b));
    }
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
    <div className="flex h-screen w-screen overflow-hidden bg-warp-bg">
      {/* Warp Style Sidebar */}
      <aside className="w-64 bg-warp-sidebar border-r border-warp-border flex flex-col p-6 space-y-8 h-full">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-warp-accent rounded flex items-center justify-center shadow-[var(--shadow-neon)]">
            <Terminal className="text-warp-bg w-5 h-5" />
          </div>
          <span className="text-xl font-black tracking-tight text-white">LUM</span>
        </div>

        <nav className="flex-1 flex flex-col space-y-8 overflow-y-auto pr-2 scrollbar-hide">
          <div className="space-y-4">
            <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold flex items-center px-1">
              <Box className="w-3 h-3 mr-2" /> Models
            </div>
            <div className="space-y-1">
              {models.map((m) => (
                <div key={m} className={`group flex items-center justify-between p-2 rounded transition-all cursor-pointer ${selectedModel === m ? 'bg-warp-accent/10 text-warp-accent' : 'text-white/40 hover:bg-white/5'}`} onClick={() => setSelectedModel(m)}>
                  <div className="flex items-center space-x-2 truncate">
                    <span className={`text-xs truncate ${selectedModel === m ? 'font-bold' : ''}`}>{m}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteModel(m); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center space-x-2 bg-white/5 rounded border border-white/5 focus-within:border-warp-accent/30 transition-all p-1 mt-2">
              <input type="text" placeholder="Pull model..." className="bg-transparent border-none outline-none text-[10px] text-white/60 p-1 flex-1 min-w-0" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePullModel()} />
              <button onClick={handlePullModel} disabled={isPulling} className="p-1 text-warp-accent/60 hover:text-warp-accent disabled:opacity-30">{isPulling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}</button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold px-1">History</div>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="text-[10px] text-white/30 hover:text-warp-accent/60 cursor-pointer truncate px-2 py-1 rounded hover:bg-white/5 transition-all">{h}</div>
              ))}
            </div>
          </div>
        </nav>

        <div className="mt-auto pt-6 border-t border-warp-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? "bg-warp-accent animate-pulse" : "bg-red-500"}`} />
            <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{ollamaOnline ? "Online" : "Offline"}</span>
          </div>
          <span className="text-[9px] text-white/20 font-mono">v1.0.0</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-warp-bg relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
              <Sparkles className="w-12 h-12 text-warp-accent mb-4" />
              <h1 className="text-xl font-bold text-white mb-2">Ready for Command</h1>
              <p className="text-xs text-white/60">Using {selectedModel} model</p>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="warp-card animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="block-header">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    {block.status === "executing" ? <Loader2 className="w-3.5 h-3.5 text-warp-accent animate-spin" /> : 
                     block.status === "error" ? <AlertCircle className="w-3.5 h-3.5 text-red-400" /> : 
                     <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                    <span className="font-mono text-xs text-warp-accent truncate">{block.command}</span>
                  </div>
                  <div className="flex items-center space-x-4 ml-4">
                    <div className="flex items-center space-x-1 text-[10px] text-white/20 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{block.timestamp}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button className="p-1 text-white/20 hover:text-white transition-all"><Copy className="w-3 h-3" /></button>
                      <button className="p-1 text-white/20 hover:text-white transition-all"><RotateCcw className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {block.explanation && (
                    <div className="mb-4 text-xs text-warp-accent/60 italic border-l border-warp-accent/30 pl-3 py-1">
                      {block.explanation}
                    </div>
                  )}

                  {block.analysis && (
                    <div className="mb-4 space-y-3">
                      <div className="text-xs text-white/50 leading-relaxed">
                        <span className="text-warp-accent/80 font-bold uppercase mr-2 tracking-widest text-[10px]">AI Insight:</span>
                        {block.analysis}
                      </div>
                      {block.suggestion && (
                        <div className="p-3 bg-warp-accent/5 rounded border border-warp-accent/10 font-mono text-xs group cursor-pointer hover:border-warp-accent/40 transition-all"
                             onClick={() => handleCommandSubmit(block.suggestion!, "shell")}>
                          <div className="text-[9px] text-warp-accent/40 uppercase mb-1 font-bold">Suggested Fix</div>
                          <div className="text-warp-accent">{block.suggestion}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {block.output && (
                    <pre className="font-mono text-xs text-white/80 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {block.output}
                    </pre>
                  )}
                  
                  {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                    <button onClick={() => handleAnalyzeError(block)} className="mt-4 flex items-center space-x-2 text-[10px] bg-red-500/10 text-red-400 px-3 py-1.5 rounded border border-red-500/20 hover:bg-red-500/20 transition-all">
                      <Sparkles className="w-3 h-3" />
                      <span>Analyze Error with AI</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Area */}
        <div className="bg-gradient-to-t from-warp-bg via-warp-bg to-transparent pt-8">
          <CommandInput onCommandSubmit={handleCommandSubmit} selectedModel={selectedModel} />
        </div>
      </main>
    </div>
  );
};

export default App;
