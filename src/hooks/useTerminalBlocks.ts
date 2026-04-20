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
  // Infinite Canvas 전용 속성 추가
  position: { x: number; y: number };
  links: string[]; // 연결된 다른 블록의 ID 리스트
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
      // 기본 위치: 마지막 블록 옆 또는 랜덤 배치
      position: { x: blocks.length * 350, y: 50 },
      links: [],
      ...block,
    };
    setBlocks((prev) => [...prev, newBlock]);
    return newBlock.id;
  }, [blocks.length]);

  const updateBlock = useCallback((id: string, updates: Partial<TerminalBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
  }, []);

  const moveBlock = useCallback((id: string, x: number, y: number) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, position: { x, y } } : b))
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
    moveBlock,
    clearBlocks,
  };
};
