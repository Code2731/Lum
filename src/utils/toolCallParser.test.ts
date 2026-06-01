import { describe, it, expect } from "vitest";
import { parseToolCalls, hasToolCalls } from "./toolCallParser";

describe("parseToolCalls", () => {
  it("단일 self-closing 태그", () => {
    const raw = `여기 실행: <tool_use server="playwright" name="screenshot" args='{"url":"http://localhost:3000"}' />`;
    const calls = parseToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      server: "playwright",
      name: "screenshot",
      args: { url: "http://localhost:3000" },
      index: 0,
    });
  });

  it("여러 태그 순서 유지", () => {
    const raw = [
      `<tool_use server="fs" name="read" args='{"path":"a.txt"}' />`,
      `<tool_use server="fs" name="read" args='{"path":"b.txt"}' />`,
    ].join("\n");
    const calls = parseToolCalls(raw);
    expect(calls).toHaveLength(2);
    expect(calls[0].args).toEqual({ path: "a.txt" });
    expect(calls[1].args).toEqual({ path: "b.txt" });
    expect(calls[1].index).toBe(1);
  });

  it("args 생략 시 기본 {}", () => {
    const raw = `<tool_use server="git" name="status" />`;
    const calls = parseToolCalls(raw);
    expect(calls[0].args).toEqual({});
  });

  it("자기 닫기 없이 </tool_use>도 허용", () => {
    const raw = `<tool_use server="x" name="y" args='{"a":1}'></tool_use>`;
    const calls = parseToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({ a: 1 });
  });

  it("큰따옴표 args도 허용", () => {
    const raw = `<tool_use server="x" name="y" args="{&quot;a&quot;:1}" />`;
    const calls = parseToolCalls(raw);
    expect(calls[0].args).toEqual({ a: 1 });
  });

  it("server/name 속성의 HTML 엔티티도 디코드한다", () => {
    const raw = `<tool_use server="a&amp;b" name="open&amp;run" args='{}' />`;
    const calls = parseToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].server).toBe("a&b");
    expect(calls[0].name).toBe("open&run");
  });

  it("이중 인코딩된 엔티티(&amp;quot;)도 args JSON으로 파싱한다", () => {
    const raw = `<tool_use server="x" name="y" args="{&amp;quot;a&amp;quot;:1}" />`;
    const calls = parseToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({ a: 1 });
  });

  it("태그/속성 대소문자가 섞여도 파싱한다", () => {
    const raw = `<TOOL_USE SERVER="x" NAME="y" ARGS='{"ok":true}' />`;
    const calls = parseToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      server: "x",
      name: "y",
      args: { ok: true },
    });
  });

  it("server/name 없으면 무시", () => {
    expect(parseToolCalls(`<tool_use name="x" />`)).toHaveLength(0);
    expect(parseToolCalls(`<tool_use server="x" />`)).toHaveLength(0);
  });

  it("손상된 JSON은 _parse_error 마크로 유지", () => {
    const raw = `<tool_use server="x" name="y" args='{not json}' />`;
    const calls = parseToolCalls(raw);
    expect(calls[0].args).toHaveProperty("_parse_error", true);
  });

  it("일반 텍스트 섞여 있어도 태그만 추출", () => {
    const raw = `먼저 스크린샷 찍어보겠습니다.\n\n<tool_use server="pw" name="snap" args='{}' />\n\n결과를 보고 분석하겠습니다.`;
    expect(parseToolCalls(raw)).toHaveLength(1);
  });
});

describe("hasToolCalls", () => {
  it("태그 있으면 true", () => {
    expect(hasToolCalls(`blah <tool_use server="x" name="y" /> blah`)).toBe(true);
    expect(hasToolCalls(`blah <TOOL_USE SERVER="x" NAME="y" /> blah`)).toBe(true);
  });
  it("태그 없으면 false", () => {
    expect(hasToolCalls("plain text")).toBe(false);
    expect(hasToolCalls("<tool_use server=\"x\">")).toBe(false); // 자기 닫기 안 한 태그는 불완전
  });
});
