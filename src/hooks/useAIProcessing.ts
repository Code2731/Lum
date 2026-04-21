import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const useAIProcessing = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const processAICommand = useCallback(async (
    prompt: string,
    model: string,
    context: string,
    imageData?: string | null,
  ) => {
    setIsProcessing(true);
    try {
      const response = await invoke<string>("generate_ai_command", {
        prompt,
        model,
        context,
        imageData: imageData ?? null,
      });
      return JSON.parse(response);
    } catch (e) {
      console.error("AI Command failed:", e);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const analyzeError = useCallback(async (
    command: string,
    stderr: string,
    model: string,
    context: string,
  ) => {
    setIsProcessing(true);
    try {
      const response = await invoke<string>("analyze_error", {
        command,
        stderr,
        model,
        context,
      });
      return JSON.parse(response);
    } catch (e) {
      console.error("Error analysis failed:", e);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const verifyVisionGoal = useCallback(async (
    goal: string,
    screenshotBase64: string,
    model: string,
    iteration: number,
  ) => {
    return invoke<{ achieved: boolean; reason: string; nextActions: any[] }>(
      "verify_vision_goal",
      { goal, screenshotBase64, model, iteration },
    );
  }, []);

  // ⑥ EPD 스트리밍 — xllm_token 이벤트로 토큰 수신, onToken(누적문자열) 콜백 호출
  const streamAICommand = useCallback(async (
    prompt: string,
    model: string,
    context: string,
    onToken: (accumulated: string) => void,
  ) => {
    setIsProcessing(true);
    let accumulated = "";

    const unlisten = await listen<string>("xllm_token", (event) => {
      accumulated += event.payload;
      onToken(accumulated);
    });

    try {
      const result = await invoke<string>("stream_ai_command", { prompt, model, context });
      return result;
    } finally {
      unlisten();
      setIsProcessing(false);
    }
  }, []);

  return {
    isProcessing,
    processAICommand,
    analyzeError,
    verifyVisionGoal,
    streamAICommand,
  };
};
