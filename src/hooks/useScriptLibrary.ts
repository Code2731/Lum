import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Script {
  id: string;
  name: string;
  description: string;
  commands: string[];
  created_at: number;
}

export function useScriptLibrary(
  activePaneIdRef: React.MutableRefObject<string>,
  ptyWriteRefs: React.MutableRefObject<Map<string, (d: string) => void>>,
) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);

  const loadScripts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<Script[]>("list_scripts");
      setScripts(result);
    } catch {
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveScript = useCallback(
    async (name: string, description: string, commands: string[]) => {
      const script = await invoke<Script>("save_script", { name, description, commands });
      setScripts((prev) => [...prev, script]);
      return script;
    },
    [],
  );

  const deleteScript = useCallback(async (id: string) => {
    await invoke("delete_script", { id });
    setScripts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const runScript = useCallback(
    (commands: string[]) => {
      const write = ptyWriteRefs.current.get(activePaneIdRef.current);
      if (!write) return;
      for (const cmd of commands) {
        write(cmd + "\n");
      }
    },
    [activePaneIdRef, ptyWriteRefs],
  );

  return { scripts, loading, loadScripts, saveScript, deleteScript, runScript };
}
