import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

export interface Action {
  type: "run" | "create" | "patch";
  cmd?: string;
  path?: string;
  content?: string;
  label: string;
}

export interface TerminalBlock {
  id: string;
  command: string;
  output: string;
  explanation?: string;
  actions?: Action[];
  type: "shell" | "ai" | "error-analysis" | "refactor" | "review";
  status: "executing" | "completed" | "error" | "blocked" | "healing";
  cwd: string;
  gitBranch: string | null;
}

export const useTerminalBlocks = () => {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [activeTab, setActiveTab] = useState<string>("default");

  const addBlock = useCallback((block: Partial<TerminalBlock>) => {
    const newBlock: TerminalBlock = {
      id: uuidv4(),
      command: "",
      output: "",
      status: "executing",
      cwd: "/",
      gitBranch: null,
      type: "shell",
      ...block,
    };
    setBlocks((prev) => [...prev, newBlock]);
    return newBlock.id;
  }, []);

  const updateBlock = useCallback((id: string, updates: Partial<TerminalBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
  }, []);

  const clearBlocks = useCallback(() => {
    setBlocks([]);
  }, []);

  return {
    blocks,
    activeTab,
    setActiveTab,
    addBlock,
    updateBlock,
    clearBlocks,
  };
};
