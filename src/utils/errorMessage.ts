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
