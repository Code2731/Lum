import type { Script } from "../../hooks/useScriptLibrary";

export type InspectorTab = "summary" | "rag" | "scripts" | "sysmon";
export type InspectorDensity = "cozy" | "compact";

export interface InspectorAnalyzeCache {
  blockId: string;
  command: string;
  requestedAt: number;
  status: "streaming" | "done" | "error";
  result: string;
  rawResult: string;
  suggestedCommands: string[];
}

export interface InspectorFailedBlock {
  id: string;
  command: string;
  exitCode: number;
  outputTail: string;
}

export interface InspectorRecentBlock {
  id: string;
  command: string;
  exitCode: number | null;
  durationMs: number | null;
  outputTail: string;
}

export interface InspectorTabItem {
  id: InspectorTab;
  label: string;
  shortcut: string;
}

export interface ScriptLibraryLike {
  scripts: Script[];
  loading: boolean;
  onLoad: () => Promise<void>;
  onRun: (commands: string[]) => void;
  onDelete: (id: string) => Promise<void>;
  onSave: (name: string, description: string, commands: string[]) => Promise<Script>;
}
