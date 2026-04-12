import React, { useState } from "react";
import { Folder, Command } from "lucide-react";

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
    <div className="w-full flex items-start px-4 py-3 bg-[#111317] border-t border-term-border-light relative z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
      
      {/* Left Margin / Indicator area */}
      <div className="w-6 flex justify-center mt-1 shrink-0">
        {isAI ? (
          <div className="w-1.5 h-1.5 rounded-full bg-term-accent mt-1 animate-pulse" />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-term-muted mt-1" />
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {/* Context / Prompt Header */}
        <div className="flex items-center space-x-2 mb-1.5 select-none">
          <Folder className="w-3 h-3 text-term-muted" strokeWidth={2.5} />
          <span className="text-[11px] font-mono text-term-muted tracking-tight font-medium">~/lum-workspace</span>
          
          {isAI && (
            <>
              <span className="text-[10px] text-term-muted px-1.5 py-0.5 rounded border border-white/5 bg-white/[0.02] ml-2">
                Ask {selectedModel}
              </span>
            </>
          )}
        </div>

        {/* Input Field */}
        <div className="flex items-center w-full relative group">
          <span className={`absolute left-0 top-0 text-[14px] font-mono select-none ${isAI ? 'text-term-accent' : 'text-term-success'}`}>
            ❯
          </span>
          <input
            type="text"
            className={`w-full bg-transparent border-none outline-none text-[14px] font-mono pl-5 h-6 selection:bg-term-accent/30 ${isAI ? 'text-term-text' : 'text-term-text'}`}
            placeholder=""
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck="false"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Right Edge: Subtle Helper */}
      <div className="shrink-0 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4 pt-1">
        <Command className="w-3 h-3 text-term-muted" />
        <span className="text-[10px] font-mono text-term-muted">Enter</span>
      </div>
    </div>
  );
};

export default CommandInput;
