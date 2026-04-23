import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const XLLM_TOKEN_EVENT = "xllm_token";

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

  const streamAICommand = useCallback(async (
    prompt: string,
    model: string,
    context: string,
    onToken: (accumulated: string) => void,
  ): Promise<void> => {
    setIsProcessing(true);
    let accumulated = "";

    const unlisten = await listen<string>(XLLM_TOKEN_EVENT, (event) => {
      accumulated += event.payload.replace(/<\|im_end\|>|<\|endoftext\|>|<\|im_start\|>/g, "");
      onToken(accumulated);
    });

    try {
      await invoke<string>("stream_ai_command", { prompt, model, context });
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
