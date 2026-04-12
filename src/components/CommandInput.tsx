import React, { useState } from "react";
import { Folder, ChevronRight, Zap, GitBranch } from "lucide-react";

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
    <div className="warp-input-wrapper">
      {/* Path Breadcrumb */}
      <div className="flex items-center gap-2 mb-2 select-none">
        <div className="breadcrumb-item">
          <Folder className="w-3 h-3 mr-1 opacity-40" />
          <span>{currentFolder}</span>
        </div>
        {context.git_branch && (
          <>
            <ChevronRight className="w-3 h-3 text-white/5" />
            <div className="breadcrumb-item !text-[#95d886]/60">
              <GitBranch className="w-3 h-3 mr-1 opacity-40" />
              <span>{context.git_branch}</span>
            </div>
          </>
        )}
      </div>

      {/* Input Line */}
      <div className="flex items-center gap-3">
        <span className={isAI ? "text-[#268bd2] font-bold text-[15px]" : "text-[#268bd2] font-bold text-[15px]"}>
          ➜
        </span>
        
        <div className="flex-1 flex items-center relative">
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-warp-text-bright text-[14px] font-mono selection:bg-[#268bd2]/40"
            placeholder={isAI ? `Ask AI (${selectedModel})...` : ""}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
          />
          {value.length === 0 && <div className="cursor-block" />}
        </div>

        {isAI && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#268bd2]/10 border border-[#268bd2]/20 rounded text-[10px] text-[#268bd2] font-black uppercase tracking-widest">
            <Zap className="w-3 h-3 fill-[#268bd2]" />
            <span>AI</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandInput;
