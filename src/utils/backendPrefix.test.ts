import { describe, expect, it } from "vitest";
import {
  applyBackendPrefixToInput,
  clearBackendPrefixFromInput,
  detectBackendPrefixFromInput,
} from "./backendPrefix";

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

describe("clearBackendPrefixFromInput", () => {
  it("backend prefix를 제거하고 본문을 반환한다", () => {
    expect(clearBackendPrefixFromInput("@local 로그 요약해줘")).toBe("로그 요약해줘");
  });

  it("backend prefix만 있으면 빈 문자열로 된다", () => {
    expect(clearBackendPrefixFromInput("@ollama")).toBe("");
  });

  it("backend prefix가 없으면 원본을 유지한다", () => {
    expect(clearBackendPrefixFromInput("@ls 왜 에러?")).toBe("@ls 왜 에러?");
    expect(clearBackendPrefixFromInput("plain text")).toBe("plain text");
  });
});

describe("detectBackendPrefixFromInput", () => {
  it("backend prefix를 감지한다", () => {
    expect(detectBackendPrefixFromInput("@local hi")).toBe("local");
    expect(detectBackendPrefixFromInput("@ollama hi")).toBe("ollama");
    expect(detectBackendPrefixFromInput("@xllm hi")).toBe("xllm");
    expect(detectBackendPrefixFromInput("@sglang hi")).toBe("xllm");
    expect(detectBackendPrefixFromInput("@gemini hi")).toBe("gemini");
  });

  it("alias를 정규화한다", () => {
    expect(detectBackendPrefixFromInput("@embedded hi")).toBe("local");
    expect(detectBackendPrefixFromInput("@sglang hi")).toBe("xllm");
    expect(detectBackendPrefixFromInput("@cloud hi")).toBe("gemini");
  });

  it("backend prefix가 아니면 null", () => {
    expect(detectBackendPrefixFromInput("plain text")).toBeNull();
    expect(detectBackendPrefixFromInput("@ls why")).toBeNull();
  });
});
