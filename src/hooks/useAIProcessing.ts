import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export const useAIProcessing = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const processAICommand = useCallback(async (prompt: string, model: string, context: string) => {
    setIsProcessing(true);
    try {
      const response = await invoke<string>("generate_ai_command", {
        prompt,
        model,
        context,
      });
      return JSON.parse(response);
    } catch (e) {
      console.error("AI Command failed:", e);
      throw e;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const analyzeError = useCallback(async (command: string, stderr: string, model: string, context: string) => {
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

  return {
    isProcessing,
    processAICommand,
    analyzeError,
  };
};
