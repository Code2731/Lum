import { describe, expect, it } from "vitest";
import {
  formatAIErrorMessage,
  isAuthError,
  isCancelError,
  isModelError,
  isNetworkError,
  isRoutingError,
  isRuntimeUnavailableError,
  toErrorMessage,
} from "./errorMessage";

describe("errorMessage", () => {
  it("타임아웃 문자열은 네트워크 가이드를 붙인다", () => {
    const msg = formatAIErrorMessage("MCP 응답 타임아웃 (3000 ms)");
    expect(msg).toContain("네트워크/백엔드 연결 불안정");
    expect(msg).toContain("MCP 응답 타임아웃 (3000 ms)");
  });

  it("라우팅 상태 메시지는 안내 가이드를 붙인다", () => {
    const msg = formatAIErrorMessage(
      "임베디드 mistral.rs 모델이 로드되지 않았습니다. 패널에서 모델/URL/API 키를 확인하고 다시 시도하세요.",
    );
    expect(msg).toMatch(/^라우팅 실패:/);
    expect(msg).toContain("해결: 백엔드 설정(모델/URL/API 키) 확인 후 다시 시도해 주세요.");
  });

  it("취소 메시지는 빈 문자열로 정규화한다", () => {
    expect(formatAIErrorMessage({ error: "canceled by user" })).toBe("");
    expect(isCancelError({ error: "취소 됨" })).toBe(true);
  });

  it("객체 메시지의 여러 필드를 순차적으로 해석한다", () => {
    expect(isRoutingError({ foo: "other info" })).toBe(false);
    expect(toErrorMessage({ errorMessage: "message-by-key" })).toBe("message-by-key");
    expect(isNetworkError({ error_description: "연결 오류" })).toBe(true);
  });

  it("인증/API 키 오류는 별도 가이드를 붙인다", () => {
    const msg = formatAIErrorMessage("401 unauthorized: invalid api key");
    expect(isAuthError("401 unauthorized: invalid api key")).toBe(true);
    expect(msg).toContain("인증/API 키 확인 필요");
    expect(msg).toContain("API 키와 권한 범위");
  });

  it("모델 누락 오류는 모델 설정 가이드를 붙인다", () => {
    const msg = formatAIErrorMessage("model not found");
    expect(isModelError("model not found")).toBe(true);
    expect(msg).toContain("모델 설정 확인 필요");
    expect(msg).toContain("모델 이름을 다시 선택");
  });

  it("런타임 제약 오류를 감지해 안내 가이드를 붙인다", () => {
    const msg = formatAIErrorMessage("[metal::load_device] No Metal device available");
    expect(isRuntimeUnavailableError("[metal::load_device] No Metal device available")).toBe(true);
    expect(msg).toContain("런타임 제약으로 백엔드가 실행되지 않습니다");
    expect(msg).toContain("해결: GPU/Metal 사용 가능한 환경");
  });
});
