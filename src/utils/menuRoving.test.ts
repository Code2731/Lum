import { describe, expect, it } from "vitest";
import {
  getRovingMenuNextIndex,
  getRovingMenuFlowSummary,
  isRovingMenuInputKey,
  normalizeRovingMenuNavKey,
} from "./menuRoving";

describe("getRovingMenuNextIndex", () => {
  it("ArrowRight는 다음 항목으로 이동하고 끝에서 순환한다", () => {
    expect(getRovingMenuNextIndex("ArrowRight", 3, 0)).toBe(1);
    expect(getRovingMenuNextIndex("ArrowRight", 3, 2)).toBe(0);
  });

  it("ArrowLeft는 이전 항목으로 이동하고 처음에서 순환한다", () => {
    expect(getRovingMenuNextIndex("ArrowLeft", 3, 2)).toBe(1);
    expect(getRovingMenuNextIndex("ArrowLeft", 3, 0)).toBe(2);
  });

  it("Home/End는 첫/마지막 항목으로 이동한다", () => {
    expect(getRovingMenuNextIndex("Home", 4, 2)).toBe(0);
    expect(getRovingMenuNextIndex("End", 4, 1)).toBe(3);
  });

  it("현재 인덱스가 비정상이면 0에서 계산한다", () => {
    expect(getRovingMenuNextIndex("ArrowRight", 3, -1)).toBe(1);
    expect(getRovingMenuNextIndex("ArrowLeft", 3, 9)).toBe(2);
  });

  it("항목이 없으면 -1을 반환한다", () => {
    expect(getRovingMenuNextIndex("Home", 0, 0)).toBe(-1);
  });

  it("Roving menu 입력 키 판별이 정확하다", () => {
    expect(isRovingMenuInputKey("Tab")).toBe(true);
    expect(isRovingMenuInputKey("ArrowUp")).toBe(true);
    expect(isRovingMenuInputKey("ArrowDown")).toBe(true);
    expect(isRovingMenuInputKey("Enter")).toBe(false);
  });

  it("Roving menu 입력 키를 이동 방향 키로 정규화한다", () => {
    expect(normalizeRovingMenuNavKey("ArrowDown", false)).toBe("ArrowRight");
    expect(normalizeRovingMenuNavKey("ArrowUp", false)).toBe("ArrowLeft");
    expect(normalizeRovingMenuNavKey("Tab", false)).toBe("ArrowRight");
    expect(normalizeRovingMenuNavKey("Tab", true)).toBe("ArrowLeft");
    expect(normalizeRovingMenuNavKey("Home", false)).toBe("Home");
    expect(normalizeRovingMenuNavKey("End", false)).toBe("End");
  });

  it("Roving menu 키별 흐름 요약을 반환한다", () => {
    expect(getRovingMenuFlowSummary("Tab")).toEqual({
      badges: ["Tab 이동", "다음 항목 순회", "포커스 유지"],
      helper: "Tab 계열 입력도 같은 roving 흐름으로 처리해 메뉴 안에서 포커스를 안정적으로 순환시킵니다.",
    });
    expect(getRovingMenuFlowSummary("Home")).toEqual({
      badges: ["처음 이동", "경계 점프", "빠른 탐색"],
      helper: "Home/End는 메뉴 양 끝으로 즉시 이동해 긴 액션 목록을 빠르게 훑을 때 유용합니다.",
    });
    expect(getRovingMenuFlowSummary("ArrowUp")).toEqual({
      badges: ["방향 이동", "이전 항목", "순환 탐색"],
      helper: "화살표 입력을 같은 roving 규칙으로 정규화해 현재 메뉴 안에서 끊김 없이 이동할 수 있게 합니다.",
    });
  });
});
