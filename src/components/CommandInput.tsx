import React, { useState } from "react";
import { Terminal, Sparkles } from "lucide-react";

interface CommandInputProps {
  onCommandSubmit: (cmd: string, type: "shell" | "ai") => void;
}

const CommandInput: React.FC<CommandInputProps> = ({ onCommandSubmit }) => {
  const [value, setValue] = useState("");
  const isAI = value.startsWith("/");

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      const type = isAI ? "ai" : "shell";
      const command = isAI ? value.slice(1) : value;
      onCommandSubmit(command, type);
      setValue("");
    }
  };

  return (
    <div className="neon-input-container w-full max-w-4xl mx-auto p-1 bg-white/5">
      <div className="flex items-center px-4 py-2 space-x-3">
        {isAI ? (
          <Sparkles className="w-5 h-5 text-lum-cyan animate-pulse" />
        ) : (
          <Terminal className="w-5 h-5 text-white/50" />
        )}
        <input
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/20 text-lg py-2"
          placeholder={isAI ? "Ask AI for commands..." : "Enter command (use / for AI)..."}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        {isAI && (
          <span className="text-[10px] bg-lum-cyan/20 text-lum-cyan px-2 py-0.5 rounded border border-lum-cyan/30 font-bold uppercase tracking-wider">
            AI Mode
          </span>
        )}
      </div>
    </div>
  );
};

export default CommandInput;
