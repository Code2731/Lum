import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HealingResult } from "../components/HealingPanel";

const stripAnsi = (s: string) =>
  s
    .replace(/\x1b\][^\x07\x1b]*[\x07\x1b]/g, "")  // OSC (BEL 또는 ESC 종료)
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")          // CSI
    .replace(/\x1b[()#;?][0-9A-Za-z]/g, "")           // 문자셋 등 기타 ESC
    .replace(/\x1b./g, "")                             // 나머지 ESC + 1문자
    .replace(/\x07/g, "");                             // BEL

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

export interface AutoHealingMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getAutoHealingMeta(input: {
  healingError: string | null;
  healingResult: HealingResult | null;
  isHealingAnalyzing: boolean;
}): AutoHealingMeta {
  if (input.isHealingAnalyzing) {
    return {
      title: "자동 복구 분석 중",
      badges: ["먼저 오류 감지", "다음 AI 분석", "마지막 실행 제안"],
      helper: "최근 오류 출력과 문맥을 바탕으로 복구 제안과 안전도를 계산하고 있습니다.",
    };
  }

  if (input.healingResult) {
    return {
      title: "자동 복구 제안 준비됨",
      badges: [
        "오류 감지 완료",
        `안전도 ${input.healingResult.safetyLevel}`,
        input.healingResult.suggestion ? "바로 실행 가능" : "제안 재검토 필요",
      ],
      helper: input.healingResult.analysis || "복구 제안을 검토한 뒤 바로 실행하거나 닫을 수 있습니다.",
    };
  }

  if (input.healingError) {
    return {
      title: "자동 복구 오류 감지",
      badges: ["오류 감지됨", "다음 분석 실행", "마지막 제안 확인"],
      helper: input.healingError,
    };
  }

  return {
    title: "자동 복구 대기 중",
    badges: ["먼저 오류 감지", "다음 AI 분석", "마지막 승인 실행"],
    helper: "실행 오류가 감지되면 최근 출력 조각을 바탕으로 복구 제안 흐름이 시작됩니다.",
  };
}

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
    // 원시 데이터를 누적 후 한 번에 스트립 — 청크 경계에 걸린 ESC 시퀀스 방지
    outputBufRef.current += rawData;
    if (outputBufRef.current.length > 4000) {
      outputBufRef.current = outputBufRef.current.slice(-4000);
    }
    if (errorDebounceRef.current) clearTimeout(errorDebounceRef.current);
    errorDebounceRef.current = setTimeout(() => {
      const raw = outputBufRef.current;
      outputBufRef.current = "";
      const text = stripAnsi(raw);

      // 한글·CJK 등 비-ASCII 명령어의 "command not found"는 의도치 않은 입력 — 무시
      if (/command not found/i.test(text) && /[^\x00-\x7F]/.test(
        (text.match(/command not found:\s*(.+)/i)?.[1] ?? ""),
      )) return;

      if (ERROR_PATTERNS.some((p) => p.test(text))) {
        const snippet = text
          .split("\n")
          .map((l) => l.replace(/[\r\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trimEnd())
          .filter((l) => l.trim())
          .slice(-5)
          .join("\n");
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

  // Phase 117 — 결정을 dataset에 기록. 실패는 무시 (학습 데이터 수집은 best-effort).
  const recordDecision = useCallback(
    (decision: "approve" | "reject", appliedCommand?: string) => {
      if (!healingError || !healingResult) return;
      invoke("record_healing_decision", {
        model: selectedModel,
        error: healingError,
        analysis: healingResult.analysis ?? "",
        suggestion: healingResult.suggestion ?? "",
        safetyLevel: healingResult.safetyLevel,
        decision,
        appliedCommand: appliedCommand ?? null,
      }).catch(() => {});
    },
    [healingError, healingResult, selectedModel],
  );

  const handleExecute = useCallback((cmd: string) => {
    recordDecision("approve", cmd);
    ptyWriteRefs.current.get(activePaneIdRef.current)?.(cmd + "\n");
    setHealingError(null);
    setHealingResult(null);
  }, [activePaneIdRef, ptyWriteRefs, recordDecision]);

  const clearHealing = useCallback(() => {
    // 분석 결과가 있는 상태에서 dismiss = reject 신호.
    // analyze 전에 닫는 건 데이터 가치가 없으므로 기록하지 않음.
    if (healingResult) recordDecision("reject");
    setHealingError(null);
    setHealingResult(null);
  }, [healingResult, recordDecision]);

  return {
    healingError,
    healingResult,
    isHealingAnalyzing,
    resetHealing,
    detectError,
    handleAnalyze,
    handleExecute,
    clearHealing,
  };
}
