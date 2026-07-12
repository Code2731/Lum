import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const XLLM_TOKEN_EVENT = "xllm_token";

export type AIProcessingPhase = "idle" | "generating" | "analyzing" | "verifying" | "streaming";

export interface AIProcessingPhaseMeta {
  label: string;
  description: string;
}

export function getAIProcessingPhaseMeta(phase: AIProcessingPhase): AIProcessingPhaseMeta {
  switch (phase) {
    case "generating":
      return {
        label: "명령 생성 중",
        description: "프롬프트와 문맥을 바탕으로 다음 실행 제안을 만들고 있습니다.",
      };
    case "analyzing":
      return {
        label: "오류 분석 중",
        description: "stderr와 실행 문맥을 바탕으로 원인과 복구 제안을 정리하고 있습니다.",
      };
    case "verifying":
      return {
        label: "화면 검증 중",
        description: "현재 화면이 목표를 만족하는지 확인하고 다음 액션을 계산하고 있습니다.",
      };
    case "streaming":
      return {
        label: "응답 스트리밍 중",
        description: "AI 응답을 토큰 단위로 받아 UI에 이어 붙이고 있습니다.",
      };
    default:
      return {
        label: "대기 중",
        description: "다음 AI 작업을 바로 시작할 수 있는 상태입니다.",
      };
  }
}

function parseJsonResponse<T>(response: string, command: string): T {
  try {
    return JSON.parse(response) as T;
  } catch {
    const snippet = response.slice(0, 160).replace(/\s+/g, " ").trim();
    throw new Error(`${command} 응답 JSON 파싱 실패${snippet ? `: ${snippet}` : ""}`);
  }
}

export const useAIProcessing = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [phase, setPhase] = useState<AIProcessingPhase>("idle");
  const requestIdRef = useRef(0);
  const unlistenRef = useRef<(() => void) | null>(null);
  const isStreamingRef = useRef(false);

  const clearCurrentStreamListener = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (!isStreamingRef.current) {
        clearCurrentStreamListener();
        return;
      }
      requestIdRef.current += 1;
      clearCurrentStreamListener();
      invoke("cancel_ai_stream").catch(() => {});
      isStreamingRef.current = false;
    };
  }, [clearCurrentStreamListener]);

  const processAICommand = useCallback(async (
    prompt: string,
    model: string,
    context: string,
    imageData?: string | null,
  ) => {
    setIsProcessing(true);
    setPhase("generating");
    try {
      const response = await invoke<string>("generate_ai_command", {
        prompt,
        model,
        context,
        imageData: imageData ?? null,
      });
      return parseJsonResponse(response, "generate_ai_command");
    } catch (e) {
      console.error("AI Command failed:", e);
      throw e;
    } finally {
      setIsProcessing(false);
      setPhase("idle");
    }
  }, []);

  const analyzeError = useCallback(async (
    command: string,
    stderr: string,
    model: string,
    context: string,
  ): Promise<{ analysis?: string; suggestion?: string } | null> => {
    setIsProcessing(true);
    setPhase("analyzing");
    try {
      const response = await invoke<string>("analyze_error", {
        command,
        stderr,
        model,
        context,
      });
      return parseJsonResponse<{ analysis?: string; suggestion?: string }>(response, "analyze_error");
    } catch (e) {
      console.error("Error analysis failed:", e);
      throw e;
    } finally {
      setIsProcessing(false);
      setPhase("idle");
    }
  }, []);

  const verifyVisionGoal = useCallback(async (
    goal: string,
    screenshotBase64: string,
    model: string,
    iteration: number,
  ) => {
    setIsProcessing(true);
    setPhase("verifying");
    try {
      return await invoke<{ achieved: boolean; reason: string; nextActions: any[] }>(
        "verify_vision_goal",
        { goal, screenshotBase64, model, iteration },
      );
    } finally {
      setIsProcessing(false);
      setPhase("idle");
    }
  }, []);

  const streamAICommand = useCallback(async (
    prompt: string,
    model: string,
    context: string,
    onToken: (accumulated: string) => void,
  ): Promise<void> => {
    clearCurrentStreamListener();

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    isStreamingRef.current = true;
    setIsProcessing(true);
    setPhase("streaming");
    let accumulated = "";

    const unlisten = await listen<string>(XLLM_TOKEN_EVENT, (event) => {
      if (requestIdRef.current !== requestId) return;
      accumulated += event.payload.replace(/<\|im_end\|>|<\|endoftext\|>|<\|im_start\|>/g, "");
      onToken(accumulated);
    });
    unlistenRef.current = unlisten;

    try {
      await invoke("reset_ai_stream").catch(() => {});
      if (requestIdRef.current !== requestId) {
        return;
      }
      await invoke<string>("stream_ai_command", { prompt, model, context });
    } finally {
      if (requestIdRef.current === requestId) {
        clearCurrentStreamListener();
        isStreamingRef.current = false;
        setIsProcessing(false);
        setPhase("idle");
      }
    }
  }, [clearCurrentStreamListener]);

  const cancelStreamAICommand = useCallback(() => {
    requestIdRef.current += 1;
    clearCurrentStreamListener();
    invoke("cancel_ai_stream").catch(() => {});
    isStreamingRef.current = false;
    setIsProcessing(false);
    setPhase("idle");
  }, [clearCurrentStreamListener]);

  return {
    isProcessing,
    phase,
    processAICommand,
    analyzeError,
    verifyVisionGoal,
    streamAICommand,
    cancelStreamAICommand,
  };
};
