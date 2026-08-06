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

export interface VoiceErrorFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
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
    if (
      code === "ALREADY_RECORDING"
      || code === "NOT_RECORDING"
      || code === "TRANSITION_IN_PROGRESS"
    ) {
      return message;
    }
    if (extra === message || extra.startsWith(message)) {
      return message;
    }
    return `${message} (${extra})`;
  }

  const lower = text.toLowerCase();
  if (lower.includes("permission") || lower.includes("not allowed") || lower.includes("denied")) {
    return "마이크 권한이 거부되었습니다. 시스템 설정에서 권한을 허용해 주세요.";
  }
  if (
    lower.includes("busy")
    || lower.includes("in use")
    || lower.includes("resource busy")
    || lower.includes("device busy")
  ) {
    return "다른 앱이 이미 마이크를 사용 중입니다. 사용 중인 녹음 앱을 닫고 다시 시도해 주세요.";
  }
  if (
    lower.includes("command not found")
    || lower.includes("executable file not found")
    || lower.includes("module not found")
    || lower.includes("python")
    || lower.includes("whisper")
  ) {
    return "음성 입력 실행 환경을 찾지 못했습니다. Python/Whisper 설정을 확인해 주세요.";
  }
  if (lower.includes("not found") || lower.includes("no such file")) {
    return "음성 모델/전사 파일을 찾지 못했습니다.";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "음성 입력 처리 시간이 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  return text || "음성 입력 처리 중 오류가 발생했습니다.";
}

export function getVoiceErrorFlowSummary(raw: unknown): VoiceErrorFlowSummary {
  const message = parseVoiceError(raw);

  if (message.includes("마이크 권한")) {
    return {
      primary: "마이크 권한 확인",
      secondary: "권한 허용 필요",
      detail: message,
    };
  }

  if (message.includes("마이크를 사용 중")) {
    return {
      primary: "마이크 사용 중",
      secondary: "다른 앱 점유",
      detail: message,
    };
  }

  if (message.includes("실행 환경")) {
    return {
      primary: "음성 런타임 확인",
      secondary: "Python/Whisper 점검",
      detail: message,
    };
  }

  if (message.includes("제한 시간") || message.includes("오래 걸리고")) {
    return {
      primary: "음성 처리 지연",
      secondary: "타임아웃 발생",
      detail: message,
    };
  }

  if (message.includes("진행 중")) {
    return {
      primary: "이전 작업 정리 중",
      secondary: "잠시 후 재시도",
      detail: message,
    };
  }

  return {
    primary: "음성 입력 오류",
    secondary: "원인 확인 필요",
    detail: message,
  };
}
