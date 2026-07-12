import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Script {
  id: string;
  name: string;
  description: string;
  commands: string[];
  created_at: number;
}

export interface ScriptLibraryMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getScriptLibraryMeta(scripts: Script[], loading: boolean): ScriptLibraryMeta {
  if (loading) {
    return {
      title: "스크립트 라이브러리 불러오는 중",
      badges: ["먼저 저장 스크립트", "다음 커맨드 묶음", "마지막 현재 터미널 실행"],
      helper: "저장된 자동화 스크립트를 읽고 현재 터미널에서 바로 실행할 준비를 하고 있습니다.",
    };
  }

  const scriptCount = scripts.length;
  const commandCount = scripts.reduce((sum, script) => sum + script.commands.length, 0);

  return {
    title: scriptCount > 0 ? `저장 스크립트 ${scriptCount}개` : "저장된 스크립트가 없습니다",
    badges: [
      `스크립트 ${scriptCount}개`,
      `커맨드 ${commandCount}개`,
      scriptCount > 0 ? "바로 실행 가능" : "새 스크립트 작성",
    ],
    helper: scriptCount > 0
      ? "반복 커맨드를 묶어 현재 터미널에 바로 흘려보낼 수 있습니다."
      : "자주 쓰는 커맨드 흐름을 저장해두면 다음부터는 한 번에 실행할 수 있습니다.",
  };
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
      setScripts((prev) => [script, ...prev]);
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
