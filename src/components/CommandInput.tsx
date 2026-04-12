import React, { useState } from "react";
import { Folder, ChevronRight, Zap, GitBranch } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    <div className="w-full px-6 pb-8">
      <motion.div 
        layout
        className={`warp-editor-prompt ${isAI ? 'border-warp-blue/30 ring-1 ring-warp-blue/10' : ''}`}
      >
        {/* Breadcrumb Area */}
        <div className="flex items-center space-x-2 mb-3 select-none">
          <div className="breadcrumb-pill">
            <Folder className="w-3 h-3 opacity-60" />
            <span>{displayPath}</span>
          </div>
          
          {context.git_branch && (
            <div className="breadcrumb-pill !text-warp-green/80 !border-warp-green/10">
              <GitBranch className="w-3 h-3 opacity-60" />
              <span>{context.git_branch}</span>
            </div>
          )}

          <ChevronRight className="w-3.5 h-3.5 text-white/5" />
        </div>

        {/* Input Area */}
        <div className="flex items-center space-x-4">
          <span className={`text-[16px] font-bold select-none ${isAI ? 'text-warp-blue' : 'text-warp-green'}`}>
            ➜
          </span>
          
          <div className="flex-1 flex items-center relative">
            <input
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-white text-[14.5px] font-mono selection:bg-warp-blue/30 py-0.5"
              placeholder={isAI ? `Ask ${selectedModel}...` : "Command or /AI"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
            />
            {value.length === 0 && <div className="warp-cursor" />}
          </div>

          <AnimatePresence>
            {isAI && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-warp-blue/10 border border-warp-blue/20 rounded-lg"
              >
                <Zap className="w-3 h-3 fill-warp-blue text-warp-blue" />
                <span className="text-[10px] text-warp-blue font-black uppercase tracking-widest">{selectedModel}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default CommandInput;
