import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const XLLM_TOKEN_EVENT = "xllm_token";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function useAIChat(model: string, getTerminalContext: () => string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  const sendMessage = useCallback(
    async (text: string) => {
      if (streaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      // 직전 6개 턴을 컨텍스트로 직렬화 (토큰 절약)
      const historyLines = messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const termCtx = getTerminalContext();
      const context = [historyLines, termCtx].filter(Boolean).join("\n\n");

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
      ]);

      setStreaming(true);

      const unlisten = await listen<string>(XLLM_TOKEN_EVENT, (event) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + event.payload } : m,
          ),
        );
      });

      try {
        await invoke("stream_ai_command", { prompt: text, model, context });
      } finally {
        unlisten();
        setStreaming(false);
      }
    },
    [model, messages, streaming, getTerminalContext],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, streaming, sendMessage, clear };
}
