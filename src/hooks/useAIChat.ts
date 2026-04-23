import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const XLLM_TOKEN_EVENT = "xllm_token";

const GIT_KEYWORDS =
  /\b(git|커밋|commit|푸시|push|풀|pull|브랜치|branch|diff|머지|merge|리베이스|rebase|스태시|stash|상태|status|log|원격|remote|클론|clone|체크아웃|checkout)\b/i;

const COMMIT_KEYWORDS =
  /\b(커밋\s*메시지|commit\s*message|커밋해|커밋\s*작성|이거\s*커밋|변경사항\s*커밋)\b/i;

function extractCwd(context: string): string | null {
  const m = context.match(/CWD:\s*(\S+)/);
  return m ? m[1] : null;
}

function extractPaths(text: string, cwd: string | null): { paths: string[]; useCwd: boolean } {
  const cwdKeywords = /(?:이\s*폴더|현재\s*폴더|이\s*디렉토리|현재\s*디렉토리|여기|this\s*folder|current\s*dir)/i;
  const useCwd = cwdKeywords.test(text) && cwd != null;

  const pathRegex = /(?:^|\s)((?:~\/|\.\.?\/|\/)[^\s"'`,;:()[\]{}]+)/gm;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pathRegex.exec(text)) !== null) {
    paths.push(m[1].replace(/[.,;:]+$/, ""));
  }

  const quoted = /["'`]([^"'`\n]{2,80})["'`]/g;
  while ((m = quoted.exec(text)) !== null) {
    const candidate = m[1];
    if (candidate.includes("/") || candidate.includes("\\")) {
      paths.push(candidate);
    }
  }

  return { paths: [...new Set(paths)], useCwd };
}

async function buildContextAddons(text: string, termCtx: string): Promise<string[]> {
  const cwd = extractCwd(termCtx);
  const addons: string[] = [];

  // 파일/폴더 읽기
  const { paths, useCwd } = extractPaths(text, cwd);
  const fileTargets = useCwd && cwd ? [cwd, ...paths] : paths;
  if (fileTargets.length > 0) {
    const results = await Promise.allSettled(
      fileTargets.map((p) => invoke<string>("read_path_for_context", { path: p, cwd: cwd ?? null })),
    );
    const fileContent = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n");
    if (fileContent) addons.push(`[첨부 파일 내용]\n${fileContent}`);
  }

  // git 컨텍스트
  if (cwd && GIT_KEYWORDS.test(text)) {
    const gitCtx = await invoke<string>("get_git_context", { cwd }).catch(() => "");
    if (gitCtx) addons.push(`[Git 상태]\n${gitCtx}`);

    // 커밋 요청이면 staged diff까지 포함
    if (COMMIT_KEYWORDS.test(text)) {
      const diff = await invoke<string>("get_staged_diff", { cwd }).catch(() => "");
      if (diff) addons.push(`[Staged Diff]\n\`\`\`diff\n${diff}\n\`\`\``);
    }
  }

  return addons;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function useAIChat(model: string, getTerminalContext: () => string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (streaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const historyLines = messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const termCtx = getTerminalContext();
      const addons = await buildContextAddons(text, termCtx);
      const context = [...addons, historyLines, termCtx].filter(Boolean).join("\n\n");

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
      ]);

      setStreaming(true);
      setError(null);

      const unlisten = await listen<string>(XLLM_TOKEN_EVENT, (event) => {
        const token = event.payload.replace(/<\|im_end\|>|<\|endoftext\|>|<\|im_start\|>/g, "");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m,
          ),
        );
      });

      try {
        await invoke("stream_ai_command", { prompt: text, model, context });
      } catch (e) {
        const msg = (() => {
          if (!e) return "알 수 없는 오류";
          if (typeof e === "string") return e;
          const raw = e as { message?: string };
          return raw.message ?? JSON.stringify(e);
        })();
        setError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `❌ ${msg}` } : m,
          ),
        );
      } finally {
        unlisten();
        setStreaming(false);
      }
    },
    [model, messages, streaming, getTerminalContext],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, streaming, error, sendMessage, clear };
}
