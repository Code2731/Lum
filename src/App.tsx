import React, { useState, useEffect, useRef } from "react";
import { Copy, RotateCcw, AlertCircle, CheckCircle2, MoreHorizontal, History as HistoryIcon, Box, Settings, Cpu } from "lucide-react";
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
    const interval = setInterval(checkStatus, 10000);
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
      id: analysisId, command: `Analyze: ${block.command}`, output: "", type: "error-analysis", status: "executing",
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

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0c0c] text-[#cccccc] font-mono overflow-hidden">
      
      {/* Warp Top Header Bar (Minimal) */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-white/5 select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#268bd2]" />
            <span className="font-bold text-sm tracking-tight text-white/90">LUM Terminal</span>
          </div>
          <div className="h-4 w-px bg-white/10 mx-2" />
          <div className="flex items-center gap-4 text-xs font-bold text-white/40">
            <span className="hover:text-white transition-colors cursor-pointer">Blocks</span>
            <span className="hover:text-white transition-colors cursor-pointer">AI Assistant</span>
            <span className="hover:text-white transition-colors cursor-pointer">Settings</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <div className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? 'bg-[#95d886]' : 'bg-red-500'}`} />
            <span className="uppercase tracking-widest text-white/40">Ollama {ollamaOnline ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold px-2 py-1 bg-white/5 rounded border border-white/10">
            <span className="text-white/20 uppercase">Model</span>
            <span className="text-[#268bd2]">{selectedModel}</span>
          </div>
        </div>
      </header>

      {/* Main Terminal View (Warp Blocks) */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 scroll-smooth scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
              <span className="text-6xl mb-6">➜</span>
              <h1 className="text-xl font-bold">LUM Terminal Initialized</h1>
              <p className="text-xs mt-2">Warp-style Block Rendering Enabled</p>
            </div>
          ) : (
            blocks.map((block) => (
              <div key={block.id} className="warp-block border border-white/10 rounded-lg overflow-hidden bg-[#1a1a1a]/30 mb-6 group transition-all duration-300">
                {/* Block Header (Warp Style) */}
                <div className="warp-block-header flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-[#268bd2] font-bold">➜</span>
                    <span className="text-white/40 text-[10px] tracking-tight">~/lum-terminal</span>
                    <span className="font-bold text-xs text-white/80 truncate font-mono">{block.command}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 ml-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] text-white/20 font-mono">{block.timestamp}</span>
                    <Copy className="w-3.5 h-3.5 text-white/40 hover:text-white cursor-pointer" />
                    <RotateCcw className="w-3.5 h-3.5 text-white/40 hover:text-white cursor-pointer" />
                    <MoreHorizontal className="w-3.5 h-3.5 text-white/40 hover:text-white cursor-pointer" />
                  </div>
                </div>

                {/* Block Content */}
                <div className="p-4 relative">
                  {/* AI Explanation Line */}
                  {block.explanation && (
                    <div className="mb-3 text-[11px] text-[#268bd2]/80 italic border-l border-[#268bd2]/30 pl-3">
                      {block.explanation}
                    </div>
                  )}

                  {/* AI Error Analysis Block */}
                  {block.analysis && (
                    <div className="mb-4 space-y-3">
                      <div className="p-3 bg-red-500/5 border border-red-500/10 rounded text-xs text-white/70">
                        <span className="text-red-400 font-bold uppercase mr-3 text-[9px] tracking-widest">Analysis</span>
                        {block.analysis}
                      </div>
                      {block.suggestion && (
                        <div 
                          className="p-3 bg-[#268bd2]/5 border border-[#268bd2]/20 rounded font-mono text-xs cursor-pointer hover:bg-[#268bd2]/10 transition-colors"
                          onClick={() => handleCommandSubmit(block.suggestion!, "shell")}
                        >
                          <div className="text-[9px] text-[#268bd2]/40 uppercase mb-1 font-bold">Suggested Fix</div>
                          <div className="text-[#268bd2]">{block.suggestion}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Terminal Standard Output with Ansi Rendering */}
                  <div className="text-[13px] leading-relaxed overflow-x-auto selection:bg-[#268bd2]/40 whitespace-pre-wrap">
                    <Ansi>{block.output || (block.status === 'executing' ? 'Executing...' : '')}</Ansi>
                  </div>

                  {/* AI Diagnosis Button for Shell Errors */}
                  {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                    <button 
                      onClick={() => handleAnalyzeError(block)}
                      className="mt-4 flex items-center gap-2 text-[10px] bg-[#268bd2]/10 text-[#268bd2] px-3 py-1.5 rounded border border-[#268bd2]/20 hover:bg-[#268bd2]/20 transition-all font-bold uppercase tracking-widest"
                    >
                      <AlertCircle className="w-3 h-3" />
                      <span>Ask AI for a Fix</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Warp Bottom Input */}
        <CommandInput onCommandSubmit={handleCommandSubmit} selectedModel={selectedModel} />
      </main>
    </div>
  );
};

export default App;
