import { describe, expect, it } from "vitest";
import { getVoiceErrorFlowSummary, parseVoiceError } from "./voiceError";

describe("parseVoiceError", () => {
  it("표준 에러 코드 메시지를 한국어로 변환한다", () => {
    const msg = parseVoiceError(
      "Error invoking command 'stop_voice_recording': LUM_VOICE_ERROR::TRANSCRIPT_NOT_FOUND::음성 인식 결과를 찾지 못했습니다."
    );
    expect(msg).toContain("음성 인식 결과를 찾지 못했습니다.");
  });

  it("권한 오류 문자열을 친화 메시지로 변환한다", () => {
    const msg = parseVoiceError(new Error("mic permission denied"));
    expect(msg).toContain("마이크 권한이 거부되었습니다.");
  });

  it("알 수 없는 오류는 원문을 유지한다", () => {
    const msg = parseVoiceError("unknown issue");
    expect(msg).toBe("unknown issue");
  });

  it("타임아웃 코드는 사용자 친화 메시지로 변환한다", () => {
    const msg = parseVoiceError(
      "LUM_VOICE_ERROR::COMMAND_TIMEOUT::음성 처리 명령이 제한 시간 내에 끝나지 않았습니다.",
    );
    expect(msg).toContain("음성 처리 명령이 제한 시간 내에 끝나지 않았습니다.");
  });

  it("전환 중 에러 코드를 사용자 친화 메시지로 변환한다", () => {
    const msg = parseVoiceError(
      "LUM_VOICE_ERROR::TRANSITION_IN_PROGRESS::이전 음성 녹음 종료 처리 중입니다.",
    );
    expect(msg).toBe(
      "이전 음성 녹음 종료 처리가 아직 진행 중입니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  it("중복 상세 메시지는 다시 붙이지 않는다", () => {
    const msg = parseVoiceError(
      "LUM_VOICE_ERROR::COMMAND_TIMEOUT::음성 처리 명령이 제한 시간 내에 끝나지 않았습니다.",
    );
    expect(msg).toBe("음성 처리 명령이 제한 시간 내에 끝나지 않았습니다.");
  });

  it("마이크 점유 오류를 친화 메시지로 변환한다", () => {
    const msg = parseVoiceError("device busy");
    expect(msg).toBe(
      "다른 앱이 이미 마이크를 사용 중입니다. 사용 중인 녹음 앱을 닫고 다시 시도해 주세요.",
    );
  });

  it("음성 런타임 누락 오류를 친화 메시지로 변환한다", () => {
    const msg = parseVoiceError("python: command not found");
    expect(msg).toBe("음성 입력 실행 환경을 찾지 못했습니다. Python/Whisper 설정을 확인해 주세요.");
  });

  it("일반 타임아웃 문자열도 친화 메시지로 변환한다", () => {
    const msg = parseVoiceError("request timed out");
    expect(msg).toBe("음성 입력 처리 시간이 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.");
  });
});

describe("getVoiceErrorFlowSummary", () => {
  it("권한 오류는 권한 확인 상태를 반환한다", () => {
    expect(getVoiceErrorFlowSummary("mic permission denied")).toEqual({
      primary: "마이크 권한 확인",
      secondary: "권한 허용 필요",
      detail: "마이크 권한이 거부되었습니다. 시스템 설정에서 권한을 허용해 주세요.",
    });
  });

  it("점유 오류는 마이크 사용 중 상태를 반환한다", () => {
    expect(getVoiceErrorFlowSummary("device busy")).toEqual({
      primary: "마이크 사용 중",
      secondary: "다른 앱 점유",
      detail: "다른 앱이 이미 마이크를 사용 중입니다. 사용 중인 녹음 앱을 닫고 다시 시도해 주세요.",
    });
  });

  it("런타임 오류는 실행 환경 점검 상태를 반환한다", () => {
    expect(getVoiceErrorFlowSummary("python: command not found")).toEqual({
      primary: "음성 런타임 확인",
      secondary: "Python/Whisper 점검",
      detail: "음성 입력 실행 환경을 찾지 못했습니다. Python/Whisper 설정을 확인해 주세요.",
    });
  });

  it("타임아웃 오류는 처리 지연 상태를 반환한다", () => {
    expect(getVoiceErrorFlowSummary("request timed out")).toEqual({
      primary: "음성 처리 지연",
      secondary: "타임아웃 발생",
      detail: "음성 입력 처리 시간이 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("기타 오류는 기본 상태를 반환한다", () => {
    expect(getVoiceErrorFlowSummary("unknown issue")).toEqual({
      primary: "음성 입력 오류",
      secondary: "원인 확인 필요",
      detail: "unknown issue",
    });
  });
});
