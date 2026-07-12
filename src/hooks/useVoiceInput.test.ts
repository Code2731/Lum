import { describe, expect, it } from "vitest";
import { getVoiceInputStatusSummary } from "./useVoiceInput";

describe("getVoiceInputStatusSummary", () => {
  it("비활성 상태를 반환한다", () => {
    expect(
      getVoiceInputStatusSummary({
        enabled: false,
        voiceBusy: false,
        voiceError: null,
        voicePartialTranscript: "",
        voiceStatus: "idle",
      }),
    ).toEqual({
      primary: "음성 입력 비활성",
      secondary: "설정 필요",
      detail: "음성 입력이 꺼져 있어 마이크를 사용할 수 없습니다.",
    });
  });

  it("오류 상태를 우선 반환한다", () => {
    expect(
      getVoiceInputStatusSummary({
        enabled: true,
        voiceBusy: false,
        voiceError: "마이크 권한이 거부되었습니다.",
        voicePartialTranscript: "",
        voiceStatus: "error",
      }),
    ).toEqual({
      primary: "음성 오류",
      secondary: "원인 확인 필요",
      detail: "마이크 권한이 거부되었습니다.",
    });
  });

  it("busy 상태를 반환한다", () => {
    expect(
      getVoiceInputStatusSummary({
        enabled: true,
        voiceBusy: true,
        voiceError: null,
        voicePartialTranscript: "",
        voiceStatus: "idle",
      }),
    ).toEqual({
      primary: "음성 준비 중",
      secondary: "요청 처리 중",
      detail: "마이크 토글 요청을 처리하고 있습니다.",
    });
  });

  it("listening 상태에서 부분 전사를 보여준다", () => {
    expect(
      getVoiceInputStatusSummary({
        enabled: true,
        voiceBusy: false,
        voiceError: null,
        voicePartialTranscript: "git status",
        voiceStatus: "listening",
      }),
    ).toEqual({
      primary: "음성 듣는 중",
      secondary: "실시간 전사 수신",
      detail: "git status",
    });
  });

  it("processing 상태에서 기본 안내를 반환한다", () => {
    expect(
      getVoiceInputStatusSummary({
        enabled: true,
        voiceBusy: false,
        voiceError: null,
        voicePartialTranscript: "",
        voiceStatus: "processing",
      }),
    ).toEqual({
      primary: "음성 반영 중",
      secondary: "전사 처리 중",
      detail: "녹음을 마친 뒤 전사 결과를 정리하고 있습니다.",
    });
  });

  it("idle 상태를 반환한다", () => {
    expect(
      getVoiceInputStatusSummary({
        enabled: true,
        voiceBusy: false,
        voiceError: null,
        voicePartialTranscript: "",
        voiceStatus: "idle",
      }),
    ).toEqual({
      primary: "음성 대기",
      secondary: "마이크 준비됨",
      detail: "필요할 때 바로 음성 입력을 시작할 수 있습니다.",
    });
  });
});
