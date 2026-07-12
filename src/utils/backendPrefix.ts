import type { AiBackend } from "./inputRouter";
import { WHITESPACE, LEADING_WHITESPACE, trimWhitespace, trimWhitespaceStart } from "./whitespace";

const BACKEND_KEYWORDS: Record<string, AiBackend> = {
  local: "local",
  embedded: "local",
  ollama: "ollama",
  xllm: "xllm",
  sglang: "xllm",
  gemini: "gemini",
  cloud: "gemini",
};

export interface BackendPrefixFlowSummary {
  badges: [string, string, string];
  helper: string;
}

function splitFirstToken(raw: string): { token: string; rest: string } {
  const firstWs = raw.search(WHITESPACE);
  if (firstWs === -1) {
    return { token: raw.toLowerCase(), rest: "" };
  }
  return {
    token: raw.slice(0, firstWs).toLowerCase(),
    rest: trimWhitespace(raw.slice(firstWs + 1)),
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
  const src = trimWhitespaceStart(raw);
  if (!src.startsWith("@")) return null;
  const stripped = trimWhitespaceStart(src.slice(1));
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
  const leading = raw.match(LEADING_WHITESPACE)?.[0] ?? "";
  const src = trimWhitespaceStart(raw);
  let body = trimWhitespace(src);

  const parsed = parseBackendPrefixFromInput(raw);
  if (src.startsWith("@") && parsed) {
    body = parsed.rest;
  } else if (src.startsWith("@")) {
    body = trimWhitespaceStart(src.slice(1));
  }

  return body ? `${leading}@${backend} ${body}` : `${leading}@${backend} `;
}

/**
 * 입력 문자열에서 backend prefix(@local/@ollama/@xllm/@sglang/@gemini)만 제거한다.
 * backend prefix가 없으면 원본 문자열을 그대로 반환한다.
 */
export function clearBackendPrefixFromInput(raw: string): string {
  const leading = raw.match(LEADING_WHITESPACE)?.[0] ?? "";
  const src = trimWhitespaceStart(raw);
  if (!src.startsWith("@")) return raw;
  const parsed = parseBackendPrefixFromInput(raw);
  if (!parsed) return raw;
  return `${leading}${parsed.rest}`;
}

/**
 * 입력 문자열의 backend prefix를 감지한다.
 * alias(embedded→local, sglang→xllm, cloud→gemini)를 정규화해서 반환한다.
 */
export function detectBackendPrefixFromInput(raw: string): AiBackend | null {
  const parsed = parseBackendPrefixFromInput(raw);
  return parsed?.backend ?? null;
}

export function isBackendOnlyInput(raw: string): boolean {
  const parsed = parseBackendPrefixFromInput(raw);
  return parsed !== null && trimWhitespace(parsed.rest) === "";
}

export function getBackendPrefixFlowSummary(
  raw: string,
): BackendPrefixFlowSummary {
  const parsed = parseBackendPrefixFromInput(raw);
  if (!parsed) {
    return {
      badges: ["백엔드 미지정", "기본 라우팅", "자동 선택"],
      helper: "입력에 backend prefix가 없어 기존 라우팅 규칙에 따라 로컬·외부 백엔드가 자동 선택됩니다.",
    };
  }

  if (isBackendOnlyInput(raw)) {
    return {
      badges: [`@${parsed.backend}`, "백엔드만 지정", "다음 입력 대기"],
      helper: "백엔드만 미리 고른 상태라 다음 질문이나 작업 지시가 들어오면 이 백엔드로 바로 이어집니다.",
    };
  }

  return {
    badges: [`@${parsed.backend}`, "본문 포함", "강제 라우팅"],
    helper: "backend prefix가 본문과 함께 있어 이번 입력은 지정한 백엔드로 바로 라우팅됩니다.",
  };
}
