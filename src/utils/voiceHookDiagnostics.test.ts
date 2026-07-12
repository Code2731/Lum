import { describe, expect, it } from "vitest";
import { getVoiceHookDiagnosticsFlowSummary } from "./voiceHookDiagnostics";

describe("getVoiceHookDiagnosticsFlowSummary", () => {
  it("로딩 상태를 반환한다", () => {
    expect(
      getVoiceHookDiagnosticsFlowSummary({
        loading: true,
        error: null,
        info: null,
        transcriptStale: false,
        transcriptAgeLabel: "방금 전",
        transcriptStaleWhileRecording: false,
      }),
    ).toEqual({
      primary: "음성 진단 갱신 중",
      secondary: "최신 상태 조회",
      detail: "시작·종료 훅과 transcript 파일 상태를 다시 확인하고 있습니다.",
      tone: "neutral",
    });
  });

  it("오류 상태를 반환한다", () => {
    expect(
      getVoiceHookDiagnosticsFlowSummary({
        loading: false,
        error: "음성 진단 조회 실패",
        info: null,
        transcriptStale: false,
        transcriptAgeLabel: "방금 전",
        transcriptStaleWhileRecording: false,
      }),
    ).toEqual({
      primary: "음성 진단 오류",
      secondary: "조회 실패",
      detail: "음성 진단 조회 실패",
      tone: "danger",
    });
  });

  it("누락된 훅이 있으면 설정 필요 상태를 반환한다", () => {
    expect(
      getVoiceHookDiagnosticsFlowSummary({
        loading: false,
        error: null,
        info: {
          recording: false,
          transcript_exists: false,
          start_hook_configured: true,
          stop_hook_configured: false,
        },
        transcriptStale: false,
        transcriptAgeLabel: "방금 전",
        transcriptStaleWhileRecording: false,
      }),
    ).toEqual({
      primary: "음성 훅 설정 필요",
      secondary: "종료 훅",
      detail: "누락된 훅 템플릿을 만들거나 파일 경로를 연결해야 합니다.",
      tone: "warning",
    });
  });

  it("녹음 중 transcript stale 상태를 반환한다", () => {
    expect(
      getVoiceHookDiagnosticsFlowSummary({
        loading: false,
        error: null,
        info: {
          recording: true,
          transcript_exists: true,
          start_hook_configured: true,
          stop_hook_configured: true,
        },
        transcriptStale: true,
        transcriptAgeLabel: "12초 전",
        transcriptStaleWhileRecording: true,
      }),
    ).toEqual({
      primary: "Transcript 갱신 점검",
      secondary: "마지막 갱신 12초 전",
      detail: "녹음 중인데 transcript 파일 갱신이 멈춰 있어 partial transcript 흐름 점검이 필요합니다.",
      tone: "warning",
    });
  });

  it("정상 녹음 상태를 반환한다", () => {
    expect(
      getVoiceHookDiagnosticsFlowSummary({
        loading: false,
        error: null,
        info: {
          recording: true,
          transcript_exists: true,
          start_hook_configured: true,
          stop_hook_configured: true,
        },
        transcriptStale: false,
        transcriptAgeLabel: "방금 전",
        transcriptStaleWhileRecording: false,
      }),
    ).toEqual({
      primary: "음성 녹음 활성",
      secondary: "훅 정상 동작 중",
      detail: "현재 transcript 파일과 시작·종료 훅이 함께 동작하고 있습니다.",
      tone: "success",
    });
  });

  it("유휴 정상 상태를 반환한다", () => {
    expect(
      getVoiceHookDiagnosticsFlowSummary({
        loading: false,
        error: null,
        info: {
          recording: false,
          transcript_exists: false,
          start_hook_configured: true,
          stop_hook_configured: true,
        },
        transcriptStale: false,
        transcriptAgeLabel: "방금 전",
        transcriptStaleWhileRecording: false,
      }),
    ).toEqual({
      primary: "음성 훅 준비 완료",
      secondary: "transcript 대기 중",
      detail: "필요할 때 바로 녹음을 시작할 수 있는 상태입니다.",
      tone: "success",
    });
  });
});
