import React, { useState } from "react";
import { Terminal, Sparkles, Folder, ChevronRight, Zap } from "lucide-react";

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
    <div className="w-full max-w-5xl mx-auto px-6 pb-10">
      <div className="warp-input-dock group">
        <div className="flex items-center space-x-3 mr-6">
          <div className="prompt-path">
            <Folder className="w-3.5 h-3.5 opacity-60" />
            <span className="font-bold tracking-tight">lum</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-white/10" />
        </div>

        <div className="flex-1 flex items-center space-x-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-white/5 border border-white/5">
            {isAI ? (
              <Zap className="w-3.5 h-3.5 text-warp-accent fill-warp-accent/20 animate-pulse" />
            ) : (
              <Terminal className="w-3.5 h-3.5 text-white/40" />
            )}
          </div>
          
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-white/90 placeholder-white/10 text-[13px] font-mono selection:bg-warp-accent/40"
            placeholder={isAI ? `Ask ${selectedModel}...` : "Command or /AI"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        <div className="flex items-center space-x-4">
          {isAI && (
            <div className="flex items-center space-x-2 px-2.5 py-1 bg-warp-accent/10 border border-warp-accent/20 rounded-md">
              <Sparkles className="w-3 h-3 text-warp-accent" />
              <span className="text-[10px] text-warp-accent font-black uppercase tracking-widest">{selectedModel}</span>
            </div>
          )}
          <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
