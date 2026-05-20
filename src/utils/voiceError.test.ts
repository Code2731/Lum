import { describe, expect, it } from "vitest";
import { parseVoiceError } from "./voiceError";

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
    expect(msg).toContain("이전 음성 녹음 종료 처리가 아직 진행 중입니다.");
  });
});
