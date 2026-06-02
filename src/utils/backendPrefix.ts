import type { AiBackend } from "./inputRouter";

const BACKEND_KEYWORDS: Record<string, AiBackend> = {
  local: "local",
  embedded: "local",
  ollama: "ollama",
  xllm: "xllm",
  sglang: "xllm",
  gemini: "gemini",
  cloud: "gemini",
};

const BACKEND_ALIAS = new Set(Object.keys(BACKEND_KEYWORDS));

function splitFirstToken(raw: string): { token: string; rest: string } {
  const firstWs = raw.search(/\s/);
  if (firstWs === -1) {
    return { token: raw.toLowerCase(), rest: "" };
  }
  return {
    token: raw.slice(0, firstWs).toLowerCase(),
    rest: raw.slice(firstWs + 1).trim(),
  };
}

function normalizeBackendAlias(token: string): AiBackend | null {
  return BACKEND_KEYWORDS[token] ?? null;
}

/**
 * `@<backend> <rest>` 형태에서 backend를 파싱한다.
 * alias(embedded→local, sglang→xllm, cloud→gemini)를 정규화해 반환한다.
 * 일치하지 않으면 null.
 */
export function parseBackendPrefixFromInput(raw: string): { backend: AiBackend; rest: string } | null {
  const src = raw.trimStart();
  if (!src.startsWith("@")) return null;
  const stripped = src.slice(1).trimStart();
  const { token, rest } = splitFirstToken(stripped);
  const backend = normalizeBackendAlias(token);
  if (!backend) return null;
  return { backend, rest };
}

/**
 * 입력 문자열에 backend prefix(@local/@ollama/@xllm/@sglang/@gemini)를 적용한다.
 * 기존 @backend prefix가 있으면 본문을 유지한 채 prefix만 교체한다.
 */
export function applyBackendPrefixToInput(raw: string, backend: AiBackend): string {
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const src = raw.trimStart();
  let body = src.trim();

  if (src.startsWith("@")) {
    const stripped = src.slice(1).trimStart();
    const { token, rest } = splitFirstToken(stripped);
    if (BACKEND_ALIAS.has(token)) {
      body = rest;
    } else {
      body = stripped.trim();
    }
  }

  return body ? `${leading}@${backend} ${body}` : `${leading}@${backend} `;
}

/**
 * 입력 문자열에서 backend prefix(@local/@ollama/@xllm/@sglang/@gemini)만 제거한다.
 * backend prefix가 없으면 원본 문자열을 그대로 반환한다.
 */
export function clearBackendPrefixFromInput(raw: string): string {
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const src = raw.trimStart();
  if (!src.startsWith("@")) return raw;
  const stripped = src.slice(1).trimStart();
  const { token, rest } = splitFirstToken(stripped);
  if (!BACKEND_ALIAS.has(token)) return raw;
  return `${leading}${rest}`;
}

/**
 * 입력 문자열의 backend prefix를 감지한다.
 * alias(embedded→local, sglang→xllm, cloud→gemini)를 정규화해서 반환한다.
 */
export function detectBackendPrefixFromInput(raw: string): AiBackend | null {
  const src = raw.trimStart();
  if (!src.startsWith("@")) return null;
  const stripped = src.slice(1).trimStart();
  const { token } = splitFirstToken(stripped);
  return normalizeBackendAlias(token);
}
