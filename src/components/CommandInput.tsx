import React, { useState } from "react";
import { Folder, ChevronRight, Zap, GitBranch } from "lucide-react";
import { motion } from "framer-motion";

interface CommandInputProps {
  onCommandSubmit: (cmd: string, type: "shell" | "ai") => void;
  selectedModel: string;
  context: {
    cwd: string;
    git_branch: string | null;
  };
}

const CommandInput: React.FC<CommandInputProps> = ({ onCommandSubmit, selectedModel, context }) => {
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

  const displayPath = context.cwd.split('/').pop() || 'root';

  return (
    <div className="w-full max-w-5xl mx-auto px-6 pb-10">
      <div className={`warp-prompt-dock ${isAI ? 'border-warp-accent/40' : ''}`}>
        {/* Breadcrumb Header */}
        <div className="flex items-center gap-2 mb-3 select-none">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded border border-white/5 text-[11px] text-warp-dim font-bold">
            <Folder className="w-3 h-3 opacity-60" />
            <span>{displayPath}</span>
          </div>
          
          {context.git_branch && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#95d886]/10 rounded border border-[#95d886]/10 text-[11px] text-[#95d886]/80 font-bold">
              <GitBranch className="w-3 h-3 opacity-60" />
              <span>{context.git_branch}</span>
            </div>
          )}
          
          <ChevronRight className="w-3 h-3 text-white/5" />
        </div>

        {/* Input Line */}
        <div className="flex items-center gap-4">
          <span className={`text-lg font-bold select-none ${isAI ? 'text-warp-accent' : 'text-warp-accent'}`}>
            ➜
          </span>
          
          <div className="flex-1 flex items-center relative">
            <input
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-white text-[14px] font-mono selection:bg-warp-accent/30 py-0.5"
              placeholder={isAI ? `Ask ${selectedModel}...` : "Command or /AI"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
            />
            {value.length === 0 && <div className="warp-cursor" />}
          </div>

          {isAI && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-warp-accent/10 border border-warp-accent/20 rounded-md">
              <Zap className="w-3 h-3 fill-warp-accent text-warp-accent" />
              <span className="text-[10px] text-warp-accent font-black uppercase tracking-widest">{selectedModel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
