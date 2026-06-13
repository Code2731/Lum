import { describe, expect, it } from "vitest";
import {
  getRovingMenuNextIndex,
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
});
