import React, { useState } from "react";

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
    <div className="warp-input-container px-6">
      <div className="flex items-center gap-3">
        {/* Warp Prompt Symbol */}
        <span className="text-[#268bd2] font-bold text-lg select-none">➜</span>
        
        {/* Context info for AI Mode */}
        {isAI && (
          <span className="text-[#268bd2]/60 text-xs font-bold uppercase border border-[#268bd2]/20 px-1.5 py-0.5 rounded bg-[#268bd2]/5">
            AI: {selectedModel}
          </span>
        )}

        <div className="relative flex-1 flex items-center">
          <input
            type="text"
            className="bg-transparent border-none outline-none w-full text-white text-[14px] font-mono selection:bg-[#268bd2]/40"
            placeholder={isAI ? "Ask AI anything..." : "Enter command..."}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
          />
          
          {/* Warp Custom Blinking Cursor */}
          <div className="w-2 h-5 bg-[#95d886] animate-pulse ml-1 shrink-0" />
        </div>
      </div>
      
      {/* Path Breadcrumb (Warp Style) */}
      <div className="flex items-center gap-2 mt-2 ml-8 opacity-40 text-[10px]">
        <span>~/lum-terminal</span>
        <span className="text-white/20">|</span>
        <span>main*</span>
      </div>
    </div>
  );
};

export default CommandInput;
