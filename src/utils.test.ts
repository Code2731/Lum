import { describe, it, expect } from "vitest";
import { normalizeBlockId, shortPath, cosineSimilarity } from "./utils";

describe("Utility Functions", () => {
  describe("shortPath", () => {
    it("경로의 마지막 부분을 반환해야 함", () => {
      expect(shortPath("/Users/test/project")).toBe("project");
      expect(shortPath("C:\\Windows\\System32")).toBe("System32");
    });

    it("빈 문자열이나 루트 경로는 ~ 또는 적절한 값을 반환해야 함", () => {
      expect(shortPath("")).toBe("~");
      expect(shortPath("/")).toBe("~");
    });
  });

  describe("cosineSimilarity", () => {
    it("동일한 벡터의 유사도는 1이어야 함", () => {
      const v = [1, 0, 0];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1);
    });

    it("직교하는 벡터의 유사도는 0이어야 함", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    });

    it("완전히 반대인 벡터의 유사도는 -1이어야 함", () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it("입력이 잘못된 경우 0을 반환해야 함", () => {
      expect(cosineSimilarity([], [])).toBe(0);
      // @ts-ignore
      expect(cosineSimilarity([1], [1, 2])).toBe(0);
    });
  });

  describe("normalizeBlockId", () => {
    it("빈 문자열·공백·null을 null로 정규화한다", () => {
      expect(normalizeBlockId(null)).toBeNull();
      expect(normalizeBlockId("")).toBeNull();
      expect(normalizeBlockId("   ")).toBeNull();
      expect(normalizeBlockId("\t")).toBeNull();
      expect(normalizeBlockId("\uFEFF")).toBeNull();
    });

    it("개행/탭/BOM을 제거하고 내부 trim 처리한다", () => {
      expect(normalizeBlockId("\nfail-2\n")).toBe("fail-2");
      expect(normalizeBlockId(" fail-2\t")).toBe("fail-2");
      expect(normalizeBlockId("\uFEFFfail-2")).toBe("fail-2");
    });
  });
});
