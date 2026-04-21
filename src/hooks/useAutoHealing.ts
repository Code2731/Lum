import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HealingResult } from "../components/HealingPanel";

const stripAnsi = (s: string) =>
  s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");

const ERROR_PATTERNS = [
  /command not found/i,
  /no such file or directory/i,
  /permission denied/i,
  /enoent/i,
  /npm err!/i,
  /error:/i,
  /traceback \(most recent call last\)/i,
  /syntaxerror/i,
  /typeerror/i,
  /exception in thread/i,
  /cargo.*error/i,
  /build failed/i,
];

type AnalyzeErrorFn = (
  command: string,
  stderr: string,
  model: string,
  context: string,
) => Promise<{ analysis?: string; suggestion?: string } | null>;

export function useAutoHealing(
  selectedModel: string,
  activePaneIdRef: React.MutableRefObject<string>,
  ptyWriteRefs: React.MutableRefObject<Map<string, (d: string) => void>>,
  analyzeError: AnalyzeErrorFn,
) {
  const [healingError, setHealingError] = useState<string | null>(null);
  const [healingResult, setHealingResult] = useState<HealingResult | null>(null);
  const [isHealingAnalyzing, setIsHealingAnalyzing] = useState(false);
  const outputBufRef = useRef("");
  const errorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHealing = useCallback(() => {
    setHealingError(null);
    setHealingResult(null);
    outputBufRef.current = "";
  }, []);

  const detectError = useCallback((rawData: string) => {
    const text = stripAnsi(rawData);
    outputBufRef.current += text;
    if (outputBufRef.current.length > 3000) {
      outputBufRef.current = outputBufRef.current.slice(-3000);
    }
    if (errorDebounceRef.current) clearTimeout(errorDebounceRef.current);
    errorDebounceRef.current = setTimeout(() => {
      const buf = outputBufRef.current;
      outputBufRef.current = "";
      if (ERROR_PATTERNS.some((p) => p.test(buf))) {
        const snippet = buf.split("\n").filter((l) => l.trim()).slice(-5).join("\n");
        setHealingError(snippet);
        setHealingResult(null);
      }
    }, 800);
  }, []);

  const handleAnalyze = useCallback(async (errorSnippet: string) => {
    setIsHealingAnalyzing(true);
    try {
      const res = await analyzeError("", errorSnippet, selectedModel, "");
      const suggestion: string = res?.suggestion ?? "";
      let safetyLevel: HealingResult["safetyLevel"] = "Safe";
      if (suggestion) {
        const report = await invoke<{ level: HealingResult["safetyLevel"] }>(
          "verify_command_safety",
          { command: suggestion },
        );
        safetyLevel = report.level;
      }
      setHealingResult({
        analysis: res?.analysis ?? "분석 결과를 가져오지 못했습니다.",
        suggestion,
        safetyLevel,
      });
    } catch {
      setHealingResult({
        analysis: "AI 분석에 실패했습니다. xLLM 서버 상태를 확인하세요.",
        suggestion: "",
        safetyLevel: "Blocked",
      });
    } finally {
      setIsHealingAnalyzing(false);
    }
  }, [analyzeError, selectedModel]);

  const handleExecute = useCallback((cmd: string) => {
    ptyWriteRefs.current.get(activePaneIdRef.current)?.(cmd + "\n");
    setHealingError(null);
    setHealingResult(null);
  }, [activePaneIdRef, ptyWriteRefs]);

  return {
    healingError,
    healingResult,
    isHealingAnalyzing,
    resetHealing,
    detectError,
    handleAnalyze,
    handleExecute,
    clearHealing: () => { setHealingError(null); setHealingResult(null); },
  };
}
