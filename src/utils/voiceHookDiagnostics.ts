export interface VoiceHookDiagnosticsSnapshot {
  recording: boolean;
  transcript_exists: boolean;
  start_hook_configured: boolean;
  stop_hook_configured: boolean;
}

export interface VoiceHookDiagnosticsFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
}

interface VoiceHookDiagnosticsFlowSummaryInput {
  loading: boolean;
  error: string | null;
  info: VoiceHookDiagnosticsSnapshot | null;
  transcriptStale: boolean;
  transcriptAgeLabel: string;
  transcriptStaleWhileRecording: boolean;
}

export function getVoiceHookDiagnosticsFlowSummary({
  loading,
  error,
  info,
  transcriptStale,
  transcriptAgeLabel,
  transcriptStaleWhileRecording,
}: VoiceHookDiagnosticsFlowSummaryInput): VoiceHookDiagnosticsFlowSummary {
  if (loading) {
    return {
      primary: "음성 진단 갱신 중",
      secondary: "최신 상태 조회",
      detail: "시작·종료 훅과 transcript 파일 상태를 다시 확인하고 있습니다.",
      tone: "neutral",
    };
  }

  if (error) {
    return {
      primary: "음성 진단 오류",
      secondary: "조회 실패",
      detail: error,
      tone: "danger",
    };
  }

  if (!info) {
    return {
      primary: "음성 진단 대기",
      secondary: "정보 없음",
      detail: "아직 표시할 음성 훅 진단 정보가 없습니다.",
      tone: "neutral",
    };
  }

  if (!info.start_hook_configured || !info.stop_hook_configured) {
    const missing = [
      !info.start_hook_configured ? "시작 훅" : null,
      !info.stop_hook_configured ? "종료 훅" : null,
    ].filter((value): value is string => Boolean(value));
    return {
      primary: "음성 훅 설정 필요",
      secondary: missing.join(" · "),
      detail: "누락된 훅 템플릿을 만들거나 파일 경로를 연결해야 합니다.",
      tone: "warning",
    };
  }

  if (transcriptStale) {
    return {
      primary: transcriptStaleWhileRecording ? "Transcript 갱신 점검" : "오래된 transcript 정리",
      secondary: `마지막 갱신 ${transcriptAgeLabel}`,
      detail: transcriptStaleWhileRecording
        ? "녹음 중인데 transcript 파일 갱신이 멈춰 있어 partial transcript 흐름 점검이 필요합니다."
        : "이전 세션 transcript가 남아 있을 수 있어 확인 또는 비우기가 필요합니다.",
      tone: "warning",
    };
  }

  if (info.recording) {
    return {
      primary: "음성 녹음 활성",
      secondary: "훅 정상 동작 중",
      detail: "현재 transcript 파일과 시작·종료 훅이 함께 동작하고 있습니다.",
      tone: "success",
    };
  }

  return {
    primary: "음성 훅 준비 완료",
    secondary: info.transcript_exists ? "transcript 확인됨" : "transcript 대기 중",
    detail: "필요할 때 바로 녹음을 시작할 수 있는 상태입니다.",
    tone: "success",
  };
}
