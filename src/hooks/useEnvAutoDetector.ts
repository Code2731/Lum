import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface EnvSuggestion {
  file: string;
  runtime: string;
  cmd: string;
  description: string;
}

export interface EnvSuggestionMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getEnvSuggestionMeta(suggestions: EnvSuggestion[]): EnvSuggestionMeta {
  const first = suggestions[0];
  const runtime = first?.runtime?.trim() || "환경";
  const primaryFile = first?.file?.trim() || "감지 파일";

  return {
    title: suggestions.length > 1 ? `${runtime} 실행 환경 후보 ${suggestions.length}개` : `${runtime} 실행 환경 제안`,
    badges: [
      `먼저 ${primaryFile}`,
      suggestions.length > 1 ? `다음 후보 ${suggestions.length - 1}개` : "다음 바로 실행",
      "마지막 현재 터미널 적용",
    ],
    helper: suggestions.length > 1
      ? `${primaryFile} 기준으로 실행 명령 후보를 정리했습니다. 내용을 확인한 뒤 현재 터미널에 바로 적용할 수 있습니다.`
      : `${primaryFile} 기준으로 바로 실행할 명령을 준비했습니다. 현재 터미널 흐름을 끊지 않고 이어서 적용할 수 있습니다.`,
  };
}

export function shouldShowEnvSuggestions(next: EnvSuggestion[]): boolean {
  return next.length > 0;
}

export function useEnvAutoDetector(
  activePaneIdRef: React.MutableRefObject<string>,
  ptyWriteRefs: React.MutableRefObject<Map<string, (d: string) => void>>,
) {
  const [suggestions, setSuggestions] = useState<EnvSuggestion[]>([]);
  const [visible, setVisible] = useState(false);
  const lastCwdRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const detectEnv = useCallback(async (cwd: string) => {
    if (!cwd || cwd === lastCwdRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      lastCwdRef.current = cwd;
      try {
        const result = await invoke<EnvSuggestion[]>("detect_env_files", { cwd });
        if (shouldShowEnvSuggestions(result)) {
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
