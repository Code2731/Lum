import type { AiBackend } from "./inputRouter";

const BACKEND_ALIAS = new Set(["local", "embedded", "ollama", "xllm", "gemini", "cloud"]);

/**
 * 입력 문자열에 backend prefix(@local/@ollama/@xllm/@gemini)를 적용한다.
 * 기존 @backend prefix가 있으면 본문을 유지한 채 prefix만 교체한다.
 */
export function applyBackendPrefixToInput(raw: string, backend: AiBackend): string {
  const src = raw.trimStart();
  let body = src.trim();

  if (src.startsWith("@")) {
    const stripped = src.slice(1).trimStart();
    const firstSpace = stripped.indexOf(" ");
    const firstToken = (firstSpace === -1 ? stripped : stripped.slice(0, firstSpace)).toLowerCase();
    if (BACKEND_ALIAS.has(firstToken)) {
      body = firstSpace === -1 ? "" : stripped.slice(firstSpace + 1).trim();
    } else {
      body = stripped.trim();
    }
  }

  return body ? `@${backend} ${body}` : `@${backend} `;
}
