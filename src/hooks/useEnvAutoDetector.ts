import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface EnvSuggestion {
  file: string;
  runtime: string;
  cmd: string;
  description: string;
}

export function useEnvAutoDetector(
  activePaneIdRef: React.MutableRefObject<string>,
  ptyWriteRefs: React.MutableRefObject<Map<string, (d: string) => void>>,
) {
  const [suggestions, setSuggestions] = useState<EnvSuggestion[]>([]);
  const [visible, setVisible] = useState(false);
  const lastCwdRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detectEnv = useCallback(async (cwd: string) => {
    if (!cwd || cwd === lastCwdRef.current) return;
    lastCwdRef.current = cwd;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const result = await invoke<EnvSuggestion[]>("detect_env_files", { cwd });
        if (result.length > 0) {
          setSuggestions(result);
          setVisible(true);
        } else {
          setVisible(false);
        }
      } catch {
        // 감지 실패는 조용히 무시
      }
    }, 600);
  }, []);

  const executeCmd = useCallback((cmd: string) => {
    ptyWriteRefs.current.get(activePaneIdRef.current)?.(cmd + "\n");
    setVisible(false);
  }, [activePaneIdRef, ptyWriteRefs]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { suggestions, visible, detectEnv, executeCmd, dismiss };
}
