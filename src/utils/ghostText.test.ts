import { describe, it, expect } from "vitest";
import { findCompletion, getGhostTextFlowSummary } from "./ghostText";

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

  describe("흐름 요약", () => {
    it("빈 입력은 대기 상태 요약을 반환한다", () => {
      expect(getGhostTextFlowSummary("", null)).toEqual({
        badges: ["입력 대기", "자동완성 없음", "명령 입력 시작"],
        helper: "아직 입력이 없어 ghost text 제안이 비활성 상태이며 명령이나 서브커맨드를 입력하면 제안이 나타납니다.",
      });
    });

    it("제안이 없으면 수동 입력 상태 요약을 반환한다", () => {
      expect(getGhostTextFlowSummary("git xyz", null)).toEqual({
        badges: ["입력 있음", "제안 없음", "수동 계속 입력"],
        helper: "현재 입력에 맞는 자동완성이 없어 그대로 입력을 이어가거나 다른 명령 패턴으로 전환하면 됩니다.",
      });
    });

    it("제안이 있으면 Tab 적용 흐름 요약을 반환한다", () => {
      const suggestion = findCompletion("git com");
      expect(getGhostTextFlowSummary("git com", suggestion)).toEqual({
        badges: ["입력 있음", "제안 mit", "Tab으로 적용"],
        helper: "현재 입력과 일치하는 자동완성 후보가 있어 Tab으로 바로 적용하고 계속 명령을 확장할 수 있습니다.",
      });
    });
  });
});
