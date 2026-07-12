import { describe, it, expect } from "vitest";
import { getMcpResultFlowSummary, parseMcpResult } from "./mcpContent";

describe("parseMcpResult", () => {
  it("plain string → 단일 text 블록", () => {
    const r = parseMcpResult("hello");
    expect(r.blocks).toEqual([{ kind: "text", text: "hello" }]);
    expect(r.hasImage).toBe(false);
    expect(r.textSummary).toBe("hello");
  });

  it("content 배열 — text + image 혼합", () => {
    const r = parseMcpResult({
      content: [
        { type: "text", text: "스크린샷입니다" },
        { type: "image", data: "BASE64==", mimeType: "image/png" },
      ],
    });
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[0]).toEqual({ kind: "text", text: "스크린샷입니다" });
    expect(r.blocks[1]).toEqual({
      kind: "image",
      dataUri: "data:image/png;base64,BASE64==",
      mimeType: "image/png",
    });
    expect(r.hasImage).toBe(true);
    expect(r.textSummary).toContain("스크린샷입니다");
    expect(r.textSummary).toContain("(이미지: image/png)");
  });

  it("알 수 없는 type은 json 블록", () => {
    const r = parseMcpResult({
      content: [{ type: "audio", data: "..." }],
    });
    expect(r.blocks[0].kind).toBe("json");
  });

  it("content 없는 객체 전체를 json으로", () => {
    const r = parseMcpResult({ ok: true, files: ["a", "b"] });
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].kind).toBe("json");
  });

  it("null은 json null 블록", () => {
    const r = parseMcpResult(null);
    expect(r.blocks[0].kind).toBe("json");
    expect(r.hasImage).toBe(false);
  });

  it("undefined 입력도 요약 문자열이 비지 않게 보존한다", () => {
    const r = parseMcpResult(undefined);
    expect(r.blocks[0]).toEqual({ kind: "json", value: undefined });
    expect(r.textSummary).toBe("undefined");
  });

  it("이미지만 있으면 hasImage=true, textSummary에 placeholder", () => {
    const r = parseMcpResult({
      content: [{ type: "image", data: "abc", mimeType: "image/jpeg" }],
    });
    expect(r.hasImage).toBe(true);
    expect(r.textSummary).toBe("(이미지: image/jpeg)");
  });

  it("요약 직렬화가 실패해도 파서가 예외 없이 fallback 문자열을 사용한다", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const r = parseMcpResult({ content: [{ type: "unknown", payload: circular }] });
    expect(r.blocks[0].kind).toBe("json");
    expect(r.textSummary).toBe("[직렬화 불가]");
  });

  it("이미지 포함 응답은 비전 중심 흐름 요약을 반환한다", () => {
    const result = parseMcpResult({
      content: [
        { type: "text", text: "스크린샷입니다" },
        { type: "image", data: "BASE64==", mimeType: "image/png" },
      ],
    });

    expect(getMcpResultFlowSummary(result)).toEqual({
      badges: ["블록 2개", "이미지 포함", "텍스트 1개"],
      helper: "이미지 응답이 포함되어 있어 텍스트 요약과 함께 시각 정보까지 같이 확인하는 흐름입니다.",
    });
  });

  it("텍스트+JSON 응답은 구조화 응답 흐름 요약을 반환한다", () => {
    const result = parseMcpResult({
      content: [
        { type: "text", text: "done" },
        { type: "unknown", value: { ok: true } },
      ],
    });

    expect(getMcpResultFlowSummary(result)).toEqual({
      badges: ["블록 2개", "텍스트 1개", "JSON 1개"],
      helper: "텍스트와 구조화 응답을 함께 읽으며 필요한 값을 추려 다음 액션으로 넘기는 흐름입니다.",
    });
  });
});
