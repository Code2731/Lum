import React, { useState, useEffect, useRef } from "react";
import { Copy, RotateCcw, AlertCircle, CheckCircle2, MoreHorizontal, Box, Settings, Cpu, Zap, Share2, Terminal as TerminalIcon, Search, User, Loader2, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import Ansi from "ansi-to-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import CommandInput from "./components/CommandInput";

// UI Utility
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

interface SystemContext {
  cwd: string;
  git_branch: string | null;
}

const App: React.FC = () => {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("llama3");
  const [context, setContext] = useState<SystemContext>({ cwd: "~", git_branch: null });
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto Scroll with Smooth Animation
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [blocks]);

  // Sync System Context & Ollama Status
  useEffect(() => {
    const sync = async () => {
      try {
        const [ctx, online] = await Promise.all([
          invoke("get_system_context") as Promise<SystemContext>,
          invoke("check_ollama_status") as Promise<boolean>
        ]);
        setContext(ctx);
        setOllamaOnline(online);
        if (online && models.length === 0) fetchModels();
      } catch (e) {
        console.error("Sync Error:", e);
      }
    };

    const fetchModels = async () => {
      try {
        const modelList: string[] = await invoke("list_models");
        setModels(modelList);
        if (modelList.length > 0 && !modelList.includes(selectedModel)) setSelectedModel(modelList[0]);
      } catch (e) { console.error(e); }
    };

    sync();
    const interval = setInterval(sync, 5000);
    return () => clearInterval(interval);
  }, [selectedModel, models.length]);

  // PTY Data Listener
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
          setBlocks((prev) => prev.map((b) => b.id === id ? { 
            ...b, 
            command: parsed.command, 
            explanation: parsed.explanation, 
            status: "completed" 
          } : b));
        } catch {
          setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, output: result, status: "completed" } : b));
        }
      } else {
        setCurrentBlockId(id);
        await invoke("write_to_pty", { data: cmd + "\n" });
        // We don't mark as completed immediately to allow streaming output
      }
    } catch (error) {
      setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, output: `Error: ${String(error)}`, status: "error" } : b));
    }
  };

  const handleAnalyzeError = async (block: TerminalBlock) => {
    const analysisId = `err-${Date.now()}`;
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
    <div className="flex h-screen w-screen bg-[#0b0d0f] text-[#e2e8f0] font-sans overflow-hidden">
      
      {/* 1. Warp Sidebar - The Professional Command Center */}
      <aside className="w-[260px] bg-[#14171a] border-r border-white/[0.05] flex flex-col h-full select-none shrink-0 z-30">
        <div className="h-14 flex items-center px-6 border-b border-white/[0.03]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#00f3ff] to-[#268bd2] rounded-lg flex items-center justify-center shadow-lg shadow-[#00f3ff]/10">
              <Zap className="text-black w-5 h-5 fill-black" />
            </div>
            <span className="font-black text-lg tracking-tighter text-white">LUM</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8 scrollbar-hide">
          <div className="space-y-2">
            <div className="px-3 mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
              <span>Models</span>
              <Box className="w-3 h-3" />
            </div>
            <div className="space-y-1">
              {models.map((m) => (
                <div 
                  key={m} 
                  className={cn(
                    "flex items-center px-3 py-2 rounded-xl text-[13px] transition-all cursor-pointer group",
                    selectedModel === m ? "bg-white/[0.06] text-[#00f3ff] shadow-inner" : "text-white/40 hover:bg-white/[0.03] hover:text-white/80"
                  )}
                  onClick={() => setSelectedModel(m)}
                >
                  <div className={cn("w-1.5 h-1.5 rounded-full mr-3", selectedModel === m ? "bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]" : "bg-white/10")} />
                  <span className="truncate flex-1 font-medium tracking-tight">{m}</span>
                  {selectedModel === m && <div className="w-1 h-1 rounded-full bg-[#00f3ff] ml-2" />}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="px-3 mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/20 flex items-center justify-between">
              <span>Shortcuts</span>
              <Settings className="w-3 h-3" />
            </div>
            <div className="space-y-1 text-white/30">
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold">
                <span>AI Prompt</span>
                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5 font-mono text-[9px]">/</span>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold">
                <span>Search</span>
                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5 font-mono text-[9px]">⌘ K</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/[0.03] bg-black/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={cn("w-2 h-2 rounded-full", ollamaOnline ? "bg-[#00f3ff] animate-pulse shadow-[0_0_10px_#00f3ff]" : "bg-red-500 shadow-[0_0_10px_#ef4444]")} />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{ollamaOnline ? "Engine Ready" : "Disconnected"}</span>
            </div>
            <User className="w-4 h-4 text-white/10 hover:text-white/40 transition-colors cursor-pointer" />
          </div>
        </div>
      </aside>

      {/* 2. Main Terminal Experience */}
      <main className="flex-1 flex flex-col h-full bg-[#0b0d0f] relative min-w-0">
        
        {/* Floating Top Bar (Minimal Warp Style) */}
        <div className="absolute top-0 inset-x-0 h-14 border-b border-white/[0.03] bg-[#0b0d0f]/80 backdrop-blur-md z-20 flex items-center justify-between px-10">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2 text-[11px] font-black text-white/40 uppercase tracking-widest">
              <TerminalIcon className="w-3.5 h-3.5" />
              <span>Session 01</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center space-x-2 text-[11px] font-bold text-[#00f3ff]/60 uppercase tracking-wider">
              <Zap className="w-3 h-3 fill-[#00f3ff]/40" />
              <span>{selectedModel} active</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Search className="w-4 h-4 text-white/20 hover:text-white transition-colors cursor-pointer" />
            <Share2 className="w-4 h-4 text-white/20 hover:text-white transition-colors cursor-pointer" />
          </div>
        </div>

        {/* The Stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 pt-20 pb-40 space-y-8 scrollbar-hide">
          <AnimatePresence mode="popLayout">
            {blocks.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none"
              >
                <div className="relative mb-8">
                  <div className="absolute inset-0 blur-3xl bg-[#00f3ff]/20 rounded-full animate-pulse" />
                  <Cpu className="w-20 h-20 text-[#00f3ff]" strokeWidth={1} />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tighter mb-2">LUM TERMINAL</h1>
                <p className="text-sm font-medium text-white/40">Local Universal Machine initialized. Awaiting commands.</p>
              </motion.div>
            ) : (
              blocks.map((block) => (
                <motion.div 
                  key={block.id}
                  initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="warp-block group shadow-2xl"
                >
                  {/* Block Header */}
                  <div className="warp-block-header">
                    <div className="flex items-center space-x-4">
                      <div className={cn(
                        "p-1.5 rounded-lg flex items-center justify-center transition-colors",
                        block.status === 'executing' ? "bg-[#00f3ff]/10 text-[#00f3ff]" : 
                        block.status === 'error' ? "bg-red-500/10 text-red-500" : 
                        "bg-green-500/10 text-green-500"
                      )}>
                        {block.status === "executing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 
                         block.status === "error" ? <AlertCircle className="w-3.5 h-3.5" /> : 
                         <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <span className="font-mono text-[13.5px] font-bold text-white/90 truncate tracking-tight">{block.command}</span>
                    </div>
                    
                    <div className="flex items-center space-x-5 shrink-0">
                      <span className="text-[10px] font-mono font-black text-white/10 tracking-[0.2em]">{block.timestamp}</span>
                      <div className="flex items-center space-x-1 border-l border-white/[0.05] pl-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button className="p-1.5 text-white/20 hover:text-white transition-all"><Copy className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 text-white/20 hover:text-white transition-all" onClick={() => handleCommandSubmit(block.command, "shell")}><RotateCcw className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 text-white/20 hover:text-white transition-all"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>

                  {/* Block Body */}
                  <div className="p-6">
                    {/* AI Thought Process */}
                    {block.explanation && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="mb-6 flex items-start space-x-4 bg-[#00f3ff]/[0.03] p-4 rounded-2xl border border-[#00f3ff]/10"
                      >
                        <Sparkles className="w-4 h-4 text-[#00f3ff] mt-0.5 shrink-0" />
                        <div className="text-[13px] text-[#00f3ff]/80 font-medium leading-relaxed italic">
                          {block.explanation}
                        </div>
                      </motion.div>
                    )}

                    {/* AI Diagnostic Report */}
                    {block.analysis && (
                      <div className="mb-6 space-y-4">
                        <div className="text-[12.5px] text-white/60 leading-relaxed p-4 bg-red-500/[0.02] border-l-2 border-red-500/20 rounded-r-2xl">
                          <span className="text-red-400 font-black uppercase mr-3 tracking-[0.2em] text-[10px]">Diagnosis</span>
                          {block.analysis}
                        </div>
                        {block.suggestion && (
                          <div 
                            className="p-4 bg-[#00f3ff]/[0.04] rounded-2xl border border-[#00f3ff]/10 font-mono text-[13px] group/sugg cursor-pointer hover:bg-[#00f3ff]/[0.08] hover:border-[#00f3ff]/40 transition-all shadow-lg"
                            onClick={() => handleCommandSubmit(block.suggestion!, "shell")}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] text-[#00f3ff]/50 uppercase font-black tracking-[0.25em]">Recommended Solution</span>
                              <div className="bg-[#00f3ff]/10 text-[#00f3ff] text-[9px] px-2 py-0.5 rounded font-black">CLICK TO RUN</div>
                            </div>
                            <div className="text-[#00f3ff] font-bold">{block.suggestion}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Terminal Real Output */}
                    <div className="font-mono text-[13.5px] leading-relaxed text-[#f3f4f6] overflow-x-auto selection:bg-[#00f3ff]/30">
                      {block.output ? (
                        <Ansi>{block.output}</Ansi>
                      ) : (
                        block.status === 'executing' && (
                          <div className="flex items-center space-x-2 text-white/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                            <span className="text-[11px] font-bold uppercase tracking-widest">Streaming binary data...</span>
                          </div>
                        )
                      )}
                    </div>
                    
                    {/* Failure Recovery Trigger */}
                    {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleAnalyzeError(block)} 
                        className="mt-6 flex items-center space-x-3 bg-red-500/10 text-red-400 px-5 py-2.5 rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-all font-black text-[11px] uppercase tracking-[0.15em] shadow-lg"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Diagnose failure with AI</span>
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* 3. The Pinned Command Dock */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0b0d0f] via-[#0b0d0f]/95 to-transparent pt-32 pb-8 z-20 pointer-events-none">
          <div className="pointer-events-auto">
            <CommandInput 
              onCommandSubmit={handleCommandSubmit} 
              selectedModel={selectedModel} 
              context={context}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
