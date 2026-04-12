import React, { useState, useEffect, useRef } from "react";
import { Copy, RotateCcw, AlertCircle, CheckCircle2, MoreHorizontal, Box, Settings, Cpu, Zap, Search, Terminal as TerminalIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
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
    <div className="flex h-screen w-screen bg-[#0c0c0c] text-[#cccccc] font-sans overflow-hidden">
      
      {/* 1. Slim Warp Sidebar */}
      <aside className="w-64 bg-[#14171a] border-r border-white/[0.05] flex flex-col p-6 space-y-8 select-none shrink-0">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 bg-[#268bd2] rounded flex items-center justify-center">
            <Zap className="text-black w-5 h-5 fill-black" />
          </div>
          <span className="text-xl font-black text-white tracking-tight">LUM</span>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-6 scrollbar-hide">
          <div className="space-y-3">
            <div className="text-[10px] text-white/20 uppercase tracking-widest font-black px-3">Installed Models</div>
            <div className="space-y-1">
              {models.map((m) => (
                <div key={m} className={`flex items-center px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${selectedModel === m ? 'bg-white/5 text-white shadow-inner' : 'text-white/40 hover:bg-white/[0.02]'}`} onClick={() => setSelectedModel(m)}>
                  <div className={`w-1 h-3 rounded-full mr-3 ${selectedModel === m ? 'bg-[#268bd2]' : 'bg-transparent'}`} />
                  <span className="truncate flex-1 font-medium">{m}</span>
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="pt-6 border-t border-white/[0.05] flex items-center justify-between text-[10px] font-bold text-white/20 uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? 'bg-[#95d886]' : 'bg-red-500'}`} />
            <span>{ollamaOnline ? 'System Ready' : 'Offline'}</span>
          </div>
          <Settings className="w-3.5 h-3.5" />
        </div>
      </aside>

      {/* 2. Main Terminal Experience */}
      <main className="flex-1 flex flex-col h-full bg-[#0c0c0c] relative min-w-0">
        
        {/* Floating Top Nav (Warp Style) */}
        <div className="h-12 border-b border-white/[0.05] flex items-center justify-between px-10 bg-white/[0.02] backdrop-blur-md">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-[11px] font-black text-white/40 uppercase">
              <TerminalIcon className="w-3 h-3" />
              <span>local-session</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#268bd2]/60 uppercase">
              <Box className="w-3 h-3" />
              <span>{selectedModel}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Search className="w-3.5 h-3.5 text-white/20 hover:text-white transition-colors cursor-pointer" />
          </div>
        </div>

        {/* The Stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-6 scrollbar-hide">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20 select-none">
              <Cpu className="w-16 h-16 mb-6" strokeWidth={1} />
              <h1 className="text-2xl font-black text-white">LUM TERMINAL</h1>
              <p className="text-xs mt-2">Warp-style Block Rendering v1.0</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {blocks.map((block) => (
                <motion.div 
                  key={block.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="warp-block"
                >
                  {/* Block Header */}
                  <div className="warp-block-header">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={block.status === 'error' ? 'text-red-500' : block.status === 'completed' ? 'text-[#95d886]' : 'text-[#268bd2]'}>
                        {block.status === "executing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 
                         block.status === "error" ? <AlertCircle className="w-3.5 h-3.5" /> : 
                         <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <span className="font-mono text-xs font-bold text-white/80 truncate">{block.command}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[9px] text-white/10 font-mono tracking-widest">{block.timestamp}</span>
                      <div className="flex items-center gap-2 border-l border-white/5 pl-4">
                        <Copy className="w-3 h-3 text-white/20 hover:text-white cursor-pointer" />
                        <RotateCcw className="w-3 h-3 text-white/20 hover:text-white cursor-pointer" onClick={() => handleCommandSubmit(block.command, "shell")} />
                      </div>
                    </div>
                  </div>

                  {/* Block Body */}
                  <div className="p-4">
                    {block.explanation && (
                      <div className="mb-4 text-[12px] text-[#268bd2]/80 italic border-l border-[#268bd2]/30 pl-4 py-0.5 leading-relaxed">
                        {block.explanation}
                      </div>
                    )}

                    {block.analysis && (
                      <div className="mb-4 space-y-3">
                        <div className="text-[12px] text-white/60 leading-relaxed p-3 bg-red-500/5 border border-red-500/10 rounded">
                          <span className="text-red-400 font-black uppercase mr-3 tracking-widest text-[9px]">Diagnosis</span>
                          {block.analysis}
                        </div>
                        {block.suggestion && (
                          <div className="p-3 bg-[#268bd2]/5 rounded border border-[#268bd2]/10 font-mono text-[12px] flex items-center justify-between cursor-pointer hover:bg-[#268bd2]/10 transition-all"
                               onClick={() => handleCommandSubmit(block.suggestion!, "shell")}>
                            <span className="text-[#268bd2] font-bold">{block.suggestion}</span>
                            <span className="text-[9px] text-white/20 uppercase font-black tracking-widest">Apply</span>
                          </div>
                        )}
                      </div>
                    )}

                    {block.output && (
                      <div className="font-mono text-[13px] leading-relaxed text-[#f3f4f6] overflow-x-auto selection:bg-[#268bd2]/40">
                        <Ansi>{block.output}</Ansi>
                      </div>
                    )}
                    
                    {block.type === "shell" && block.output.toLowerCase().includes("error") && !block.analysis && (
                      <button onClick={() => handleAnalyzeError(block)} className="mt-4 flex items-center gap-2 text-[10px] bg-red-500/10 text-red-400 px-3 py-1.5 rounded border border-red-500/10 hover:bg-red-500/20 transition-all font-black uppercase tracking-widest">
                        <Zap className="w-3 h-3" />
                        <span>Fix with AI</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* 3. The Warp Integrated Dock */}
        <div className="bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c] to-transparent pt-20 pb-4">
          <CommandInput 
            onCommandSubmit={handleCommandSubmit} 
            selectedModel={selectedModel} 
            context={context}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
