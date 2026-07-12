import { describe, expect, it } from "vitest";
import {
  collapseWhitespace,
  hasVisibleText,
  trimWhitespace,
  trimWhitespaceStart,
} from "./whitespace";

describe("whitespace", () => {
  it("trimWhitespace는 앞뒤 유니코드 공백을 제거한다", () => {
    expect(trimWhitespace(" \t hello \n")).toBe("hello");
    expect(trimWhitespace("\u00a0hello\u00a0")).toBe("hello");
  });

  it("trimWhitespaceStart는 앞쪽 공백만 제거한다", () => {
    expect(trimWhitespaceStart(" \t hello \n")).toBe("hello \n");
  });

  it("collapseWhitespace는 중복 공백을 한 칸으로 접고 앞뒤를 정리한다", () => {
    expect(collapseWhitespace("  hello \n   world \t test  ")).toBe("hello world test");
    expect(collapseWhitespace("\u00a0alpha\u2003beta\u00a0")).toBe("alpha beta");
  });

  it("hasVisibleText는 공백만 있는 입력과 실제 텍스트를 구분한다", () => {
    expect(hasVisibleText(" \n\t ")).toBe(false);
    expect(hasVisibleText("\u00a0\u2003")).toBe(false);
    expect(hasVisibleText(" hello ")).toBe(true);
  });
});
