import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const XLLM_TOKEN_EVENT = "xllm_token";

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
      return parseJsonResponse(response, "analyze_error");
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
    clearCurrentStreamListener();

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    isStreamingRef.current = true;
    setIsProcessing(true);
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
      }
    }
  }, [clearCurrentStreamListener]);

  const cancelStreamAICommand = useCallback(() => {
    requestIdRef.current += 1;
    clearCurrentStreamListener();
    invoke("cancel_ai_stream").catch(() => {});
    isStreamingRef.current = false;
    setIsProcessing(false);
  }, [clearCurrentStreamListener]);

  return {
    isProcessing,
    processAICommand,
    analyzeError,
    verifyVisionGoal,
    streamAICommand,
    cancelStreamAICommand,
  };
};
