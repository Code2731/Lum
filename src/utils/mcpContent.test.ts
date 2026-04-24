import { describe, it, expect } from "vitest";
import { parseMcpResult } from "./mcpContent";

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

  it("이미지만 있으면 hasImage=true, textSummary에 placeholder", () => {
    const r = parseMcpResult({
      content: [{ type: "image", data: "abc", mimeType: "image/jpeg" }],
    });
    expect(r.hasImage).toBe(true);
    expect(r.textSummary).toBe("(이미지: image/jpeg)");
  });
});
