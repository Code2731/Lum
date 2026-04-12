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
    <div className="w-full px-4 pb-6">
      <div className={`warp-prompt-container ${isAI ? 'border-warp-accent/30 ring-1 ring-warp-accent/10' : ''}`}>
        {/* Warp Breadcrumb: Path Info */}
        <div className="warp-path-breadcrumb">
          <Folder className="w-3.5 h-3.5 mr-0.5" />
          <span>lum-terminal</span>
          <ChevronRight className="w-3.5 h-3.5 opacity-30" />
        </div>

        {/* Warp Input: The Prompt */}
        <div className="warp-input-area">
          <span className={`font-bold text-[15px] select-none ${isAI ? 'text-warp-accent' : 'text-green-400'}`}>
            ❯
          </span>
          
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-white text-[14px] font-mono selection:bg-warp-accent/30 py-1"
            placeholder={isAI ? `Ask AI (${selectedModel})...` : ""}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />

          {isAI && (
            <div className="flex items-center space-x-2 px-2 py-1 bg-warp-accent/10 border border-warp-accent/10 rounded text-[10px] text-warp-accent font-black tracking-widest uppercase">
              <Zap className="w-3 h-3 fill-warp-accent" />
              <span>{selectedModel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
