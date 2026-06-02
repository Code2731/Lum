import { describe, expect, it } from "vitest";
import {
  applyBackendPrefixToInput,
  clearBackendPrefixFromInput,
  detectBackendPrefixFromInput,
  parseBackendPrefixFromInput,
  isBackendOnlyInput,
} from "./backendPrefix";

describe("applyBackendPrefixToInput", () => {
  it("일반 문장 앞에 backend prefix를 붙인다", () => {
    expect(applyBackendPrefixToInput("로그 요약해줘", "local")).toBe("@local 로그 요약해줘");
  });
  it("선행 공백이 있으면 공백 위치를 보존해 prefix를 붙인다", () => {
    expect(applyBackendPrefixToInput("   로그 요약해줘", "local")).toBe("   @local 로그 요약해줘");
  });

  it("기존 backend prefix를 교체하고 본문은 유지한다", () => {
    expect(applyBackendPrefixToInput("@ollama src/utils.ts 수정", "xllm")).toBe("@xllm src/utils.ts 수정");
  });

  it("backend 뒤 탭/개행 구분자도 본문으로 인식한다", () => {
    expect(applyBackendPrefixToInput("@ollama\tsrc/utils.ts 수정", "xllm")).toBe("@xllm src/utils.ts 수정");
    expect(applyBackendPrefixToInput("@ollama\nsrc/utils.ts 수정", "xllm")).toBe("@xllm src/utils.ts 수정");
  });

  it("backend prefix만 있던 경우 공백 유지", () => {
    expect(applyBackendPrefixToInput("@gemini", "local")).toBe("@local ");
  });

  it("backend와 본문 사이의 공백을 허용한다", () => {
    expect(applyBackendPrefixToInput("@ local", "xllm")).toBe("@xllm ");
    expect(applyBackendPrefixToInput(" \t@ embedded   hi", "gemini")).toBe(" \t@gemini hi");
  });

  it("non-backend @강제AI 입력은 본문으로 취급한다", () => {
    expect(applyBackendPrefixToInput("@ls 왜 에러?", "gemini")).toBe("@gemini ls 왜 에러?");
  });

  it("alias 대소문자 상관없이 백엔드 토큰을 교체한다", () => {
    expect(applyBackendPrefixToInput("@LOCAL hello", "gemini")).toBe("@gemini hello");
  });
});

describe("clearBackendPrefixFromInput", () => {
  it("backend prefix를 제거하고 본문을 반환한다", () => {
    expect(clearBackendPrefixFromInput("@local 로그 요약해줘")).toBe("로그 요약해줘");
  });
  it("선행 공백이 있으면 공백 위치를 보존해 prefix를 제거한다", () => {
    expect(clearBackendPrefixFromInput("   @local 로그 요약해줘")).toBe("   로그 요약해줘");
  });

  it("backend prefix만 있으면 빈 문자열로 된다", () => {
    expect(clearBackendPrefixFromInput("@ollama")).toBe("");
  });

  it("backend 뒤 탭/개행 구분자도 제거한다", () => {
    expect(clearBackendPrefixFromInput("@local\t로그 요약해줘")).toBe("로그 요약해줘");
    expect(clearBackendPrefixFromInput("@local\n로그 요약해줘")).toBe("로그 요약해줘");
  });

  it("backend와 본문 사이 공백만 있어도 backend-only로 정리한다", () => {
    expect(clearBackendPrefixFromInput("@ local")).toBe("");
    expect(clearBackendPrefixFromInput("  @ xllm")).toBe("  ");
  });

  it("backend prefix가 없으면 원본을 유지한다", () => {
    expect(clearBackendPrefixFromInput("@ls 왜 에러?")).toBe("@ls 왜 에러?");
    expect(clearBackendPrefixFromInput("plain text")).toBe("plain text");
  });

  it("backend-only 입력에서 공백만 남는 경우 정규화한 뒤 빈 값이 된다", () => {
    expect(clearBackendPrefixFromInput("@local   ")).toBe("");
    expect(clearBackendPrefixFromInput("  @xllm\t")).toBe("  ");
    expect(clearBackendPrefixFromInput("\n@cloud   ")).toBe("");
  });

  it("개행 앞뒤가 포함된 단독 backend도 공백/빈 문자열 정규화 규칙 유지", () => {
    expect(clearBackendPrefixFromInput("\n\t@embedded\n")).toBe("\n\t");
    expect(clearBackendPrefixFromInput("  @sglang\n\n")).toBe("  ");
  });

  it("alias 대소문자 상관없이 제거된다", () => {
    expect(clearBackendPrefixFromInput("@XLLM hello")).toBe("hello");
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

  it("backend 뒤 탭/개행 구분자도 감지한다", () => {
    expect(detectBackendPrefixFromInput("@local\thi")).toBe("local");
    expect(detectBackendPrefixFromInput("@cloud\nhi")).toBe("gemini");
  });

  it("backend와 본문 사이 공백이 있어도 감지한다", () => {
    expect(detectBackendPrefixFromInput("@ local hi")).toBe("local");
    expect(detectBackendPrefixFromInput("   @ xllm   hi")).toBe("xllm");
  });

  it("backend prefix가 아니면 null", () => {
    expect(detectBackendPrefixFromInput("plain text")).toBeNull();
    expect(detectBackendPrefixFromInput("@ls why")).toBeNull();
  });

  it("선행 공백이 있어도 backend 토큰을 감지한다", () => {
    expect(detectBackendPrefixFromInput("   @local hi")).toBe("local");
    expect(detectBackendPrefixFromInput("\t@xllm hi")).toBe("xllm");
    expect(detectBackendPrefixFromInput("\n@embedded   hi")).toBe("local");
  });

  it("대문자 alias도 감지한다", () => {
    expect(detectBackendPrefixFromInput("@LOCAL hi")).toBe("local");
    expect(detectBackendPrefixFromInput("@CLOUD hi")).toBe("gemini");
  });
});

describe("parseBackendPrefixFromInput", () => {
  it("backend 토큰을 추출해 rest와 함께 반환한다", () => {
    expect(parseBackendPrefixFromInput("@local 테스트")).toEqual({ backend: "local", rest: "테스트" });
    expect(parseBackendPrefixFromInput("   @ xllm\thello")).toEqual({ backend: "xllm", rest: "hello" });
  });

  it("backend가 없으면 null", () => {
    expect(parseBackendPrefixFromInput("@ls 테스트")).toBeNull();
    expect(parseBackendPrefixFromInput("hello")).toBeNull();
  });

  it("backend-only는 rest 빈 문자열", () => {
    expect(parseBackendPrefixFromInput("@cloud   ")).toEqual({ backend: "gemini", rest: "" });
    expect(parseBackendPrefixFromInput("\n\t@xllm\n")).toEqual({ backend: "xllm", rest: "" });
  });

  it("대문자 alias도 정규화된다", () => {
    expect(parseBackendPrefixFromInput("@CLOUD test")).toEqual({ backend: "gemini", rest: "test" });
  });
});

describe("isBackendOnlyInput", () => {
  it("backend-only 입력은 true", () => {
    expect(isBackendOnlyInput("@local")).toBe(true);
    expect(isBackendOnlyInput("   @ xllm\t")).toBe(true);
    expect(isBackendOnlyInput("\n@cloud   ")).toBe(true);
  });

  it("backend+본문은 false", () => {
    expect(isBackendOnlyInput("@local hi")).toBe(false);
    expect(isBackendOnlyInput("  @xllm 작업")).toBe(false);
  });

  it("비 backend @ 접두는 false", () => {
    expect(isBackendOnlyInput("@ls")).toBe(false);
    expect(isBackendOnlyInput("@")).toBe(false);
  });
});
