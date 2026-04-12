import React, { useState } from "react";
import { Terminal, Sparkles, Folder, ChevronRight, Zap, Command } from "lucide-react";

interface CommandInputProps {
  onCommandSubmit: (cmd: string, type: "shell" | "ai") => void;
  selectedModel: string;
}

const CommandInput: React.FC<CommandInputProps> = ({ onCommandSubmit, selectedModel }) => {
  const [value, setValue] = useState("");
  const isAI = value.startsWith("/");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      const type = isAI ? "ai" : "shell";
      const command = isAI ? value.slice(1) : value;
      onCommandSubmit(command, type);
      setValue("");
    }
  };

  return (
    <div className="w-full px-8 pb-10">
      <div className="warp-input-dock">
        {/* Left Side: Context Breadcrumb */}
        <div className="flex items-center space-x-3 mr-6 shrink-0">
          <div className="prompt-pill">
            <Folder className="w-3 h-3 text-warp-accent/80" />
            <span className="tracking-tight">lum-terminal</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-white/5" />
        </div>

        {/* Input: The Core Area */}
        <div className="flex-1 flex items-center space-x-4">
          <div className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${isAI ? 'bg-warp-accent/20 border border-warp-accent/40' : 'bg-white/5 border border-white/5'}`}>
            {isAI ? (
              <Zap className="w-3.5 h-3.5 text-warp-accent fill-warp-accent/20 animate-pulse" />
            ) : (
              <Terminal className="w-3.5 h-3.5 text-white/30" />
            )}
          </div>
          
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-white/90 placeholder-white/[0.08] text-[13.5px] font-mono selection:bg-warp-accent/40"
            placeholder={isAI ? `What do you want to do with ${selectedModel}?` : "Type a command or / for AI assistant..."}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        {/* Right Side: Indicators */}
        <div className="flex items-center space-x-4 ml-4 shrink-0">
          {isAI ? (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-warp-accent/10 border border-warp-accent/10 rounded-lg">
              <Sparkles className="w-3 h-3 text-warp-accent" />
              <span className="text-[9px] text-warp-accent font-black uppercase tracking-[0.15em]">{selectedModel}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.05] rounded-lg">
              <Command className="w-3 h-3 text-white/20" />
              <span className="text-[10px] text-white/20 font-bold tracking-widest font-mono">K</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
