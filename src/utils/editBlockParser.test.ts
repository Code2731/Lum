import { describe, it, expect } from "vitest";
import {
  parseEditBlocks,
  hasEditBlocks,
  getEditBlockParseFlowSummary,
} from "./editBlockParser";

describe("parseEditBlocks", () => {
  it("단일 블록 파싱", () => {
    const raw = [
      "```rust",
      "src/foo.rs",
      "<<<<<<< SEARCH",
      "let x = 1;",
      "=======",
      "let x = 2;",
      ">>>>>>> REPLACE",
      "```",
    ].join("\n");
    const blocks = parseEditBlocks(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      file: "src/foo.rs",
      search: "let x = 1;",
      replace: "let x = 2;",
      index: 0,
    });
  });

  it("펜스 이전에 백틱 경로", () => {
    const raw = [
      "파일 `src/bar.ts` 수정:",
      "```typescript",
      "<<<<<<< SEARCH",
      'const y = "hello";',
      "=======",
      'const y = "world";',
      ">>>>>>> REPLACE",
      "```",
    ].join("\n");
    const blocks = parseEditBlocks(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].file).toBe("src/bar.ts");
    expect(blocks[0].replace).toBe('const y = "world";');
  });

  it("여러 블록 순서 유지", () => {
    const raw = [
      "```rust",
      "src/a.rs",
      "<<<<<<< SEARCH",
      "a1",
      "=======",
      "a2",
      ">>>>>>> REPLACE",
      "```",
      "",
      "```rust",
      "src/b.rs",
      "<<<<<<< SEARCH",
      "b1",
      "=======",
      "b2",
      ">>>>>>> REPLACE",
      "```",
    ].join("\n");
    const blocks = parseEditBlocks(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].file).toBe("src/a.rs");
    expect(blocks[0].index).toBe(0);
    expect(blocks[1].file).toBe("src/b.rs");
    expect(blocks[1].index).toBe(1);
  });

  it("파일 경로 없으면 무시", () => {
    const raw = [
      "```",
      "<<<<<<< SEARCH",
      "foo",
      "=======",
      "bar",
      ">>>>>>> REPLACE",
      "```",
    ].join("\n");
    expect(parseEditBlocks(raw)).toHaveLength(0);
  });

  it("여러 줄 SEARCH/REPLACE", () => {
    const raw = [
      "```ts",
      "src/x.ts",
      "<<<<<<< SEARCH",
      "function old() {",
      "  return 1;",
      "}",
      "=======",
      "function nu() {",
      "  return 2;",
      "}",
      ">>>>>>> REPLACE",
      "```",
    ].join("\n");
    const blocks = parseEditBlocks(raw);
    expect(blocks[0].search).toBe("function old() {\n  return 1;\n}");
    expect(blocks[0].replace).toBe("function nu() {\n  return 2;\n}");
  });

  it("일반 코드블록(SEARCH/REPLACE 없음)은 블록 0개", () => {
    const raw = "```bash\nls -la\n```";
    expect(parseEditBlocks(raw)).toHaveLength(0);
  });
});

describe("hasEditBlocks", () => {
  it("SEARCH/REPLACE 마커 둘 다 있으면 true", () => {
    expect(
      hasEditBlocks("blah <<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE blah"),
    ).toBe(true);
  });
  it("마커 하나만 있으면 false", () => {
    expect(hasEditBlocks("<<<<<<< SEARCH only")).toBe(false);
  });
  it("일반 텍스트 false", () => {
    expect(hasEditBlocks("hello world")).toBe(false);
  });
});

describe("getEditBlockParseFlowSummary", () => {
  it("마커가 없으면 일반 응답 상태를 반환한다", () => {
    expect(getEditBlockParseFlowSummary("hello world")).toEqual({
      primary: "편집 블록 없음",
      secondary: "일반 응답 유지",
      detail: "SEARCH/REPLACE 블록이 없어 편집 제안 없이 텍스트만 표시합니다.",
    });
  });

  it("마커는 있지만 경로가 없으면 확인 필요 상태를 반환한다", () => {
    expect(
      getEditBlockParseFlowSummary(
        ["```", "<<<<<<< SEARCH", "foo", "=======", "bar", ">>>>>>> REPLACE", "```"].join(
          "\n",
        ),
      ),
    ).toEqual({
      primary: "편집 블록 확인 필요",
      secondary: "경로 또는 구문 누락",
      detail: "마커는 있지만 파일 경로 또는 완전한 SEARCH/REPLACE 구문이 없습니다.",
    });
  });

  it("단일 편집 블록은 첫 파일 요약을 반환한다", () => {
    expect(
      getEditBlockParseFlowSummary(
        [
          "```ts",
          "src/foo.ts",
          "<<<<<<< SEARCH",
          "old",
          "=======",
          "new",
          ">>>>>>> REPLACE",
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      primary: "1개 편집 블록 감지",
      secondary: "src/foo.ts",
      detail: "첫 번째 변경안을 바로 검토할 수 있습니다.",
    });
  });

  it("복수 편집 블록은 개수와 첫 파일을 함께 반환한다", () => {
    expect(
      getEditBlockParseFlowSummary(
        [
          "```ts",
          "src/a.ts",
          "<<<<<<< SEARCH",
          "a",
          "=======",
          "b",
          ">>>>>>> REPLACE",
          "```",
          "",
          "```ts",
          "src/b.ts",
          "<<<<<<< SEARCH",
          "c",
          "=======",
          "d",
          ">>>>>>> REPLACE",
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      primary: "2개 편집 블록 감지",
      secondary: "src/a.ts",
      detail: "첫 파일 포함 2개 변경안을 순서대로 검토할 수 있습니다.",
    });
  });
});
