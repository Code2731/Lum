export function toErrorMessage(error: unknown): string {
  if (!error) return "알 수 없는 오류";

  if (typeof error === "string") {
    const message = error.trim();
    return message || "알 수 없는 오류";
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    return message || "알 수 없는 오류";
  }

  if (typeof error === "object" && error !== null) {
    const value = error as Record<string, unknown>;

    if (typeof value.message === "string" && value.message.trim()) {
      return value.message.trim();
    }

    if (typeof value.error === "string" && value.error.trim()) {
      return value.error.trim();
    }

    if (typeof value.errorMessage === "string" && value.errorMessage.trim()) {
      return value.errorMessage.trim();
    }

    if (typeof value.error_description === "string" && value.error_description.trim()) {
      return value.error_description.trim();
    }

    try {
      const serialized = JSON.stringify(error);
      return serialized.trim() || "알 수 없는 오류";
    } catch {
      return "알 수 없는 오류";
    }
  }

  return "알 수 없는 오류";
}

const networkIndicators: string[] = [
  "network",
  "네트워크",
  "방화벽",
  "연결",
  "타임아웃",
  "응답 타임아웃",
  "timed out",
  "timeout",
  "connection",
  "econnrefused",
  "econnreset",
  "server access",
];

export function isNetworkError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return networkIndicators.some((keyword) => message.includes(keyword));
}

export function isCancelError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return message.includes("취소") || message.includes("canceled") || message.includes("cancel");
}

const ROUTING_FAIL_INDICATORS: string[] = [
  "backend 강제 요청이지만",
  "지원하지 않는 backend",
  "gemini backend를 강제하려면",
  "local_embed_unavailable",
  "모델 미초기화",
  "모델이 로드되지 않았습니다",
  "백엔드가 미설정/미연결 상태입니다",
  "모델 조회 실패",
  "모델 조회 응답 파싱 실패",
  "사용 가능한 URL 후보가 없습니다",
  "임베디드 모델이 로드되지 않았습니다",
  "임베디드 mistral.rs 모델이 로드되지 않았습니다",
  "모델을 로드한 뒤 다시 시도하세요",
  "모델 패널에서 gemini-* 모델을 선택하세요",
];

export function isRoutingError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return ROUTING_FAIL_INDICATORS.some((keyword) => message.includes(keyword.toLowerCase()));
}

export function formatAIErrorMessage(error: unknown): string {
  const message = toErrorMessage(error);

  if (!message) return "알 수 없는 오류";
  if (isCancelError(error)) return "";
  if (isRoutingError(message)) {
    return `라우팅 실패: ${message}\n해결: 백엔드 설정(모델/URL/API 키) 확인 후 다시 시도해 주세요.`;
  }
  if (isNetworkError(error)) {
    return `네트워크/백엔드 연결 불안정: ${message}\n해결: 네트워크 상태와 백엔드 URL을 확인한 뒤 재시도하세요.`;
  }
  return message;
}
