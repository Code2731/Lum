import { describe, expect, it } from "vitest";
import { applyBackendPrefixToInput } from "./backendPrefix";

describe("applyBackendPrefixToInput", () => {
  it("일반 문장 앞에 backend prefix를 붙인다", () => {
    expect(applyBackendPrefixToInput("로그 요약해줘", "local")).toBe("@local 로그 요약해줘");
  });

  it("기존 backend prefix를 교체하고 본문은 유지한다", () => {
    expect(applyBackendPrefixToInput("@ollama src/utils.ts 수정", "xllm")).toBe("@xllm src/utils.ts 수정");
  });

  it("backend prefix만 있던 경우 공백 유지", () => {
    expect(applyBackendPrefixToInput("@gemini", "local")).toBe("@local ");
  });

  it("non-backend @강제AI 입력은 본문으로 취급한다", () => {
    expect(applyBackendPrefixToInput("@ls 왜 에러?", "gemini")).toBe("@gemini ls 왜 에러?");
  });
});
