import { describe, it, expect } from "vitest";
import { parseEditBlocks, hasEditBlocks } from "./editBlockParser";

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
