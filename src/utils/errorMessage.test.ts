import { describe, expect, it } from "vitest";
import {
  formatAIErrorMessage,
  isCancelError,
  isNetworkError,
  isRoutingError,
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
});
