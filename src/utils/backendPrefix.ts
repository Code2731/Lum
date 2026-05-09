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

/**
 * 입력 문자열에서 backend prefix(@local/@ollama/@xllm/@gemini)만 제거한다.
 * backend prefix가 없으면 원본 문자열을 그대로 반환한다.
 */
export function clearBackendPrefixFromInput(raw: string): string {
  const src = raw.trimStart();
  if (!src.startsWith("@")) return raw;
  const stripped = src.slice(1).trimStart();
  const firstSpace = stripped.indexOf(" ");
  const firstToken = (firstSpace === -1 ? stripped : stripped.slice(0, firstSpace)).toLowerCase();
  if (!BACKEND_ALIAS.has(firstToken)) return raw;
  if (firstSpace === -1) return "";
  return stripped.slice(firstSpace + 1).trim();
}

/**
 * 입력 문자열의 backend prefix를 감지한다.
 * alias(embedded→local, cloud→gemini)를 정규화해서 반환한다.
 */
export function detectBackendPrefixFromInput(raw: string): AiBackend | null {
  const src = raw.trimStart();
  if (!src.startsWith("@")) return null;
  const stripped = src.slice(1).trimStart();
  const firstSpace = stripped.indexOf(" ");
  const firstToken = (firstSpace === -1 ? stripped : stripped.slice(0, firstSpace)).toLowerCase();
  if (!BACKEND_ALIAS.has(firstToken)) return null;
  if (firstToken === "embedded") return "local";
  if (firstToken === "cloud") return "gemini";
  return firstToken as AiBackend;
}
