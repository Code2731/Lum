import React, { useState } from "react";
import { Folder, ChevronRight, Zap } from "lucide-react";

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

  const currentFolder = context.cwd.split('/').pop() || 'root';

  return (
    <div className="warp-editor-block">
      {/* Warp Editor Header: Path & Git */}
      <div className="flex items-center gap-2 mb-3">
        <div className="path-pill">
          <Folder className="w-3 h-3 opacity-40" />
          <span>{currentFolder}</span>
        </div>
        {context.git_branch && (
          <div className="path-pill !text-warp-green/60">
            <span>{context.git_branch}</span>
          </div>
        )}
        <ChevronRight className="w-3 h-3 text-white/5" />
      </div>

      {/* Warp Input Line: Prompt + Editor */}
      <div className="flex items-center gap-3">
        <span className="text-warp-accent font-bold text-[16px] select-none">➜</span>
        
        <div className="flex-1 flex items-center relative">
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-warp-text-bright text-[14px] font-mono selection:bg-warp-accent/40 py-0.5"
            placeholder={isAI ? `Ask AI (${selectedModel})...` : ""}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
          />
          {value.length === 0 && <div className="warp-cursor" />}
        </div>

        {isAI && (
          <div className="flex items-center gap-2 px-2 py-0.5 bg-warp-accent/10 border border-warp-accent/20 rounded text-[9px] text-warp-accent font-black uppercase tracking-widest">
            <Zap className="w-3 h-3 fill-warp-accent" />
            <span>AI MODE</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandInput;
