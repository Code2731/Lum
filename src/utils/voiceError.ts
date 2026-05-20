const VOICE_ERROR_PREFIX = "LUM_VOICE_ERROR::";

const CODE_MESSAGES: Record<string, string> = {
  ALREADY_RECORDING: "이미 음성 녹음이 진행 중입니다.",
  NOT_RECORDING: "현재 진행 중인 음성 녹음이 없습니다.",
  TRANSCRIPT_NOT_FOUND: "음성 인식 결과를 찾지 못했습니다.",
  START_HOOK_FAILED: "음성 입력 시작에 실패했습니다.",
  COMMAND_EXEC_FAILED: "음성 처리 명령 실행에 실패했습니다.",
  COMMAND_EXIT_NON_ZERO: "음성 처리 명령이 비정상 종료되었습니다.",
  COMMAND_STDERR: "음성 처리 중 오류가 발생했습니다.",
  COMMAND_TIMEOUT: "음성 처리 명령이 제한 시간 내에 끝나지 않았습니다.",
  STATE_LOCK_POISONED: "음성 상태 동기화에 실패했습니다.",
  TRANSITION_IN_PROGRESS: "이전 음성 녹음 종료 처리가 아직 진행 중입니다. 잠시 후 다시 시도해 주세요.",
};

function unwrapErrorText(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  return String(raw ?? "");
}

export function parseVoiceError(raw: unknown): string {
  const text = unwrapErrorText(raw);
  const marker = text.indexOf(VOICE_ERROR_PREFIX);
  if (marker >= 0) {
    const payload = text.slice(marker + VOICE_ERROR_PREFIX.length);
    const [code, detail] = payload.split("::", 2);
    const message = CODE_MESSAGES[code] ?? "음성 입력 처리 중 오류가 발생했습니다.";
    const extra = (detail ?? "").trim();
    if (!extra) return message;
    if (code === "ALREADY_RECORDING" || code === "NOT_RECORDING") return message;
    return `${message} (${extra})`;
  }

  const lower = text.toLowerCase();
  if (lower.includes("permission") || lower.includes("not allowed") || lower.includes("denied")) {
    return "마이크 권한이 거부되었습니다. 시스템 설정에서 권한을 허용해 주세요.";
  }
  if (lower.includes("not found") || lower.includes("no such file")) {
    return "음성 모델/전사 파일을 찾지 못했습니다.";
  }
  return text || "음성 입력 처리 중 오류가 발생했습니다.";
}
