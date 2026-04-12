import React, { useState } from "react";
import { Terminal, Sparkles, Folder, ChevronRight } from "lucide-react";

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
    <div className="w-full max-w-5xl mx-auto px-4 pb-8 pt-4">
      <div className={`warp-input-container ${isAI ? 'border-warp-accent/40 bg-warp-accent/5' : ''}`}>
        <div className="flex items-center space-x-2 mr-4">
          <div className="flex items-center space-x-1 text-warp-text-dim/60 font-mono text-xs bg-white/5 px-2 py-1 rounded">
            <Folder className="w-3 h-3" />
            <span className="truncate max-w-[120px]">~/lum-project</span>
          </div>
          <ChevronRight className="w-3 h-3 text-warp-text-dim/40" />
        </div>

        <div className="flex-1 flex items-center space-x-3">
          {isAI ? (
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-warp-accent animate-pulse" />
              <span className="text-[10px] bg-warp-accent/20 text-warp-accent px-1.5 py-0.5 rounded border border-warp-accent/30 font-bold uppercase tracking-wider">
                {selectedModel}
              </span>
            </div>
          ) : (
            <Terminal className="w-4 h-4 text-warp-accent/60" />
          )}
          
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/20 text-sm py-1 font-mono"
            placeholder={isAI ? "Ask AI anything..." : "Enter command or use / for AI"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        {isAI && (
          <div className="flex items-center text-[10px] text-warp-text-dim/40 italic ml-2">
            AI Assistant
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandInput;
