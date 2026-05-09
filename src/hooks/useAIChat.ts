import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiBackend } from "../utils/inputRouter";

const XLLM_TOKEN_EVENT = "xllm_token";

const GIT_KEYWORDS =
  /\b(git|커밋|commit|푸시|push|풀|pull|브랜치|branch|diff|머지|merge|리베이스|rebase|스태시|stash|상태|status|log|원격|remote|클론|clone|체크아웃|checkout)\b/i;

const COMMIT_KEYWORDS =
  /\b(커밋\s*메시지|commit\s*message|커밋해|커밋\s*작성|이거\s*커밋|변경사항\s*커밋)\b/i;

// 코드 분석 의도 — CWD 자동 포함 트리거
const CODE_ANALYSIS_KEYWORDS =
  /(코드\s*리뷰|code\s*review|리뷰|리팩토링|refactor|분석해|설명해|structure|구조|어떻게\s*돼|뭐하는|프로젝트|버그\s*찾|문제점)/i;

// 코드 수정 의도 — SEARCH/REPLACE 지시 주입 트리거
const CODE_EDIT_KEYWORDS =
  /(수정|고쳐|바꿔|추가해|삭제해|변경|리팩토|fix|edit|change|add|remove|delete|update|refactor|implement|구현|만들어|작성해|쓰세요)/i;

const EDIT_FORMAT_INSTRUCTION = `
파일을 수정할 때는 아래 SEARCH/REPLACE 블록 형식을 정확히 사용하세요. 파일 경로는 펜스 바로 뒤 첫 줄에 배치하세요.

\`\`\`언어
path/to/file.ext
<<<<<<< SEARCH
원본 코드 (정확히 일치해야 함)
=======
새 코드
>>>>>>> REPLACE
\`\`\`

규칙:
- 한 번에 여러 파일/여러 블록 가능
- SEARCH는 파일에 반드시 존재하는 문자열 (공백 포함 일치)
- 새 파일 생성 시 SEARCH는 빈 줄 (파일 내용 전체를 REPLACE에)
- 설명은 블록 밖 간결히 작성`;

function extractCwd(context: string): string | null {
  // CWD: 뒤부터 줄 끝까지 — Windows 경로에 공백(Program Files 등)이 있어도 OK
  const m = context.match(/CWD:\s*(.+?)(?:\r?\n|$)/);
  return m ? m[1].trim() : null;
}

function extractPaths(text: string, cwd: string | null): { paths: string[]; useCwd: boolean } {
  const cwdKeywords = /(?:이\s*폴더|현재\s*폴더|이\s*디렉토리|현재\s*디렉토리|여기|this\s*folder|current\s*dir)/i;
  // cwd가 있으면 "이 폴더" 키워드 OR 코드 분석 의도 감지 시 자동 포함
  const useCwd = cwd != null && (cwdKeywords.test(text) || CODE_ANALYSIS_KEYWORDS.test(text));

  const paths: string[] = [];
  let m: RegExpExecArray | null;

  // Unix 경로: ~/, ./, ../, /
  const unixPath = /(?:^|\s)((?:~\/|\.\.?\/|\/)[^\s"'`,;:()[\]{}]+)/gm;
  while ((m = unixPath.exec(text)) !== null) {
    paths.push(m[1].replace(/[.,;:]+$/, ""));
  }

  // Windows 경로: C:\, H:/, D:\Users\... — 드라이브 레터 + 백슬래시 또는 슬래시
  const winPath = /(?:^|\s)([A-Za-z]:[\\/][^\s"'`,;:()[\]{}]+)/gm;
  while ((m = winPath.exec(text)) !== null) {
    paths.push(m[1].replace(/[.,;:]+$/, ""));
  }

  // 따옴표로 감싼 경로 — /, \ 모두 허용
  const quoted = /["'`]([^"'`\n]{2,120})["'`]/g;
  while ((m = quoted.exec(text)) !== null) {
    const candidate = m[1];
    if (candidate.includes("/") || candidate.includes("\\")) {
      paths.push(candidate);
    }
  }

  // Warp-style @ 컨텍스트 첨부: "@README.md", "@src/App.tsx", "@docs/"
  // 시작 위치는 문장 시작 또는 공백 뒤만 허용해 email 같은 패턴을 피한다.
  const mention = /(?:^|\s)@([^\s@]+(?:\/[^\s@]+)*)/g;
  while ((m = mention.exec(text)) !== null) {
    const candidate = m[1].replace(/[.,;:!?]+$/, "");
    if (!candidate) continue;
    // backend prefix(@local/@ollama 등) 오탐 방지
    if (["local", "embedded", "ollama", "xllm", "gemini", "cloud"].includes(candidate.toLowerCase())) {
      continue;
    }
    paths.push(candidate);
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
    async (
      text: string,
      images?: string[],
      engine?: "heavy" | "fast",
      backend?: AiBackend,
    ) => {
      if (streaming) {
        console.warn("[AI] sendMessage skipped — already streaming");
        return;
      }
      console.log(
        "[AI] sendMessage:",
        text,
        "model:",
        model,
        "engine:",
        engine ?? "auto",
        "backend:",
        backend ?? "auto",
        images?.length ? `· ${images.length}개 이미지` : "",
      );

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: images?.length ? `${text}\n\n(이미지 ${images.length}개 첨부됨)` : text,
        timestamp: Date.now(),
      };

      const historyLines = messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const termCtx = getTerminalContext();
      const addons = await buildContextAddons(text, termCtx);
      const editHint = CODE_EDIT_KEYWORDS.test(text) ? EDIT_FORMAT_INSTRUCTION : "";
      // 활성화된 MCP 서버의 도구 사용 지시 — 빈 문자열 반환이면 주입 안 됨
      const mcpHint = await invoke<string>("mcp_system_prompt").catch(() => "");
      const context = [mcpHint, editHint, ...addons, historyLines, termCtx]
        .filter(Boolean)
        .join("\n\n");

      // RAG Librarian: 프롬프트에서 첫 번째 파일 경로 추출 → active_file로 전달
      const cwd = extractCwd(termCtx);
      const { paths } = extractPaths(text, cwd);
      const activeFile = paths.length > 0 ? paths[0] : null;

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
      ]);

      setStreaming(true);
      setError(null);

      let tokenCount = 0;
      const unlisten = await listen<string>(XLLM_TOKEN_EVENT, (event) => {
        tokenCount++;
        if (tokenCount === 1) console.log("[AI] first token received");
        const token = event.payload.replace(/<\|im_end\|>|<\|endoftext\|>|<\|im_start\|>/g, "");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m,
          ),
        );
      });

      try {
        console.log("[AI] invoking stream_ai_command, context len:", context.length);
        await invoke("stream_ai_command", {
          prompt: text,
          model,
          context,
          images: images && images.length > 0 ? images : null,
          engine: engine ?? null,
          backend: backend ?? null,
          activeFile,
        });
        console.log("[AI] stream_ai_command returned, tokens:", tokenCount);
      } catch (e) {
        console.error("[AI] stream_ai_command threw:", e);
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

  const cancel = useCallback(() => {
    invoke("cancel_ai_stream").catch(() => {});
    setStreaming(false);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, streaming, error, sendMessage, cancel, clear };
}
