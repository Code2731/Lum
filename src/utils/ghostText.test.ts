import { describe, it, expect } from "vitest";
import { findCompletion } from "./ghostText";

describe("findCompletion", () => {
  describe("서브커맨드 완성", () => {
    it("git com → git commit 완성", () => {
      const r = findCompletion("git com");
      expect(r).not.toBeNull();
      expect(r!.insert).toBe("mit");
    });

    it("git ch → git checkout 완성", () => {
      const r = findCompletion("git ch");
      expect(r).not.toBeNull();
      expect(r!.insert).toBeTruthy();
    });

    it("git commit 정확히 일치 → 완성 없음", () => {
      expect(findCompletion("git commit")).toBeNull();
    });

    it("npm ins → npm install 완성", () => {
      const r = findCompletion("npm ins");
      expect(r).not.toBeNull();
      expect(r!.insert).toBe("tall");
    });
  });

  describe("플래그 완성", () => {
    it("git commit --am → --amend 완성", () => {
      const r = findCompletion("git commit --am");
      expect(r).not.toBeNull();
      expect(r!.insert).toBe("end");
    });

    it("git log --oneli → --oneline 완성", () => {
      const r = findCompletion("git log --oneli");
      expect(r).not.toBeNull();
      expect(r!.insert).toBe("ne");
    });

    it("완전히 일치하는 플래그 → 완성 없음", () => {
      expect(findCompletion("git commit --amend")).toBeNull();
    });
  });

  describe("엣지 케이스", () => {
    it("빈 입력 → null", () => {
      expect(findCompletion("")).toBeNull();
    });

    it("공백만 → null", () => {
      expect(findCompletion("   ")).toBeNull();
    });

    it("알 수 없는 CLI → null", () => {
      expect(findCompletion("unknowntool sub")).toBeNull();
    });

    it("도구 이름만 입력 → null", () => {
      expect(findCompletion("git")).toBeNull();
    });

    it("서브커맨드 없는 매치 → null", () => {
      expect(findCompletion("git xyz")).toBeNull();
    });
  });
});
