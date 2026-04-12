import React, { useState, useEffect, useRef } from "react";
import { Terminal, Box, Download, Trash2, Loader2, Copy, RotateCcw, AlertCircle, Settings, Command } from "lucide-react";
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
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
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
      id: analysisId, command: `Analyze failure: ${block.command}`, output: "", type: "error-analysis", status: "executing",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
    <div className="flex h-screen w-screen overflow-hidden bg-term-bg font-sans">
      
      {/* 1. Native Mac-style Thin Sidebar */}
      <aside className="w-[240px] bg-term-sidebar border-r border-term-border-light flex flex-col h-full select-none shrink-0 z-20">
        
        {/* Top Header */}
        <div className="h-12 px-4 flex items-center border-b border-term-border-light">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-term-accent" strokeWidth={2.5} />
            <span className="font-semibold text-[14px] tracking-tight text-white/90">LUM Terminal</span>
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          
          {/* Models Section */}
          <div>
            <div className="px-1 mb-2 flex items-center space-x-2 text-term-muted">
              <Box className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Models</span>
            </div>
            <div className="space-y-0.5">
              {models.map((m) => (
                <div key={m} className={`nav-item group ${selectedModel === m ? 'active' : ''}`} onClick={() => setSelectedModel(m)}>
                  <span className="truncate pr-2">{m}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteModel(m); }} className="opacity-0 group-hover:opacity-100 hover:text-term-error p-1 -mr-1 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            {/* Subtle Input for Pulling */}
            <div className="mt-2 px-1 relative">
              <input 
                type="text" 
                placeholder="Pull model..." 
                className="w-full bg-black/20 border border-white/5 rounded-md text-[12px] px-2.5 py-1.5 outline-none focus:border-term-accent/40 text-term-text placeholder-term-muted"
                value={newModelName} 
                onChange={(e) => setNewModelName(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handlePullModel()} 
              />
              {isPulling && (
                <Loader2 className="w-3.5 h-3.5 absolute right-3 top-2 animate-spin text-term-accent" />
              )}
            </div>
          </div>

          {/* History Section */}
          <div>
            <div className="px-1 mb-2 flex items-center space-x-2 text-term-muted">
              <Command className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">History</span>
            </div>
            <div className="space-y-0.5">
              {history.map((h, i) => (
                <div key={i} className="px-3 py-1.5 rounded-md text-[12px] font-mono text-term-muted hover:text-term-text hover:bg-white/[0.03] cursor-pointer truncate" onClick={() => handleCommandSubmit(h, "shell")}>
                  {h}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Status */}
        <div className="p-4 border-t border-term-border-light bg-[#111317]">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${ollamaOnline ? "bg-term-success" : "bg-term-error"}`} />
              <span className="text-term-muted font-medium">{ollamaOnline ? "Ollama Connected" : "Ollama Offline"}</span>
            </div>
            <Settings className="w-4 h-4 text-term-muted hover:text-white cursor-pointer transition-colors" />
          </div>
        </div>
      </aside>

      {/* 2. Main Terminal View - Seamless Blocks */}
      <main className="flex-1 flex flex-col h-full bg-term-bg relative w-full min-w-0">
        
        {/* Output Stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto pt-6 pb-4 px-2 scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
              <Terminal className="w-12 h-12 text-term-muted mb-4" strokeWidth={1} />
              <h1 className="text-lg font-medium text-term-text mb-1">LUM Workspace initialized</h1>
              <p className="text-[13px] text-term-muted font-mono">Current Model: {selectedModel}</p>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="terminal-stream-block group">
                
                {/* Status Indicator Bar */}
                <div className={`block-indicator ${
                  block.status === 'executing' ? 'bg-term-accent animate-pulse' : 
                  block.status === 'error' ? 'bg-term-error' : 
                  'bg-term-border-light group-hover:bg-term-muted/40'
                }`} />

                {/* Command Header */}
                <div className="flex items-center justify-between pl-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-[14px] font-mono font-bold text-term-text">{block.command}</span>
                    <span className="text-[10px] text-term-muted font-mono bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {block.timestamp}
                    </span>
                  </div>
                  
                  {/* Hover Actions */}
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 text-term-muted hover:text-white rounded hover:bg-white/10" title="Copy output"><Copy className="w-3.5 h-3.5" /></button>
                    <button className="p-1 text-term-muted hover:text-white rounded hover:bg-white/10" title="Run again"><RotateCcw className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {/* Output Content */}
                <div className="mt-2 pl-2">
                  
                  {/* AI Explanation / Thought */}
                  {block.explanation && (
                    <div className="mb-3 text-[13px] text-term-muted italic border-l-2 border-term-accent/30 pl-3 py-0.5 max-w-4xl">
                      {block.explanation}
                    </div>
                  )}

                  {/* AI Error Analysis */}
                  {block.analysis && (
                    <div className="mb-4 max-w-4xl">
                      <div className="text-[13px] text-term-text leading-relaxed p-3 bg-term-error/10 border border-term-error/20 rounded-md">
                        <span className="text-term-error font-bold uppercase mr-3 tracking-widest text-[10px]">Diagnosis</span>
                        {block.analysis}
                      </div>
                      {block.suggestion && (
                        <div className="mt-2 p-3 bg-white/[0.02] border border-white/5 rounded-md font-mono text-[13px] flex items-center justify-between group/sugg cursor-pointer hover:bg-term-accent/5 hover:border-term-accent/20 transition-colors"
                             onClick={() => handleCommandSubmit(block.suggestion!, "shell")}>
                          <span className="text-term-accent">{block.suggestion}</span>
                          <span className="text-[10px] text-term-muted group-hover/sugg:text-term-accent uppercase font-bold tracking-widest flex items-center">
                            Apply Fix
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Terminal Standard Output */}
                  {block.output && (
                    <div className="font-mono text-[13.5px] leading-relaxed text-[#cccccc] overflow-x-auto selection:bg-term-accent/30 mt-1 max-w-full">
                      <Ansi>{block.output}</Ansi>
                    </div>
                  )}
                  
                  {/* Error Action Hook */}
                  {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                    <button onClick={() => handleAnalyzeError(block)} className="mt-3 flex items-center space-x-1.5 text-[11px] text-term-error hover:text-red-400 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="border-b border-dashed border-term-error/50">Ask AI to fix this error</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 3. Integrated Bottom Prompt (No Floating) */}
        <CommandInput onCommandSubmit={handleCommandSubmit} selectedModel={selectedModel} />
      </main>
    </div>
  );
};

export default App;
