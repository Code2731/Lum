import { describe, expect, it } from "vitest";
import {
  isEventTargetWithinSelector,
  isPointerOutsideTargets,
  isTargetInsideTargets,
  getActiveFocusableIndex,
  getPointerContainmentFlowSummary,
  getActiveFocusFlowSummary,
} from "./pointerGuard";

describe("pointerGuard", () => {
  it("isEventTargetWithinSelector는 Element가 아니면 false", () => {
    const textNode = document.createTextNode("x");
    expect(isEventTargetWithinSelector(textNode, "[data-a='1']")).toBe(false);
    expect(isEventTargetWithinSelector(null, "[data-a='1']")).toBe(false);
  });

  it("isEventTargetWithinSelector는 closest 매칭을 판정한다", () => {
    const parent = document.createElement("div");
    parent.setAttribute("data-a", "1");
    const child = document.createElement("button");
    const outside = document.createElement("span");
    parent.appendChild(child);
    document.body.appendChild(parent);
    document.body.appendChild(outside);

    expect(isEventTargetWithinSelector(child, "[data-a='1']")).toBe(true);
    expect(isEventTargetWithinSelector(outside, "[data-a='1']")).toBe(false);
  });

  it("isPointerOutsideTargets는 모든 대상 바깥일 때만 true", () => {
    const panel = document.createElement("div");
    const child = document.createElement("button");
    const outside = document.createElement("span");
    panel.appendChild(child);
    document.body.appendChild(panel);
    document.body.appendChild(outside);

    expect(isPointerOutsideTargets(child, [panel])).toBe(false);
    expect(isPointerOutsideTargets(outside, [panel])).toBe(true);
    expect(isPointerOutsideTargets(outside, [null, undefined])).toBe(true);
    expect(isPointerOutsideTargets(null, [panel])).toBe(false);
  });

  it("isPointerOutsideTargets는 Node가 아닌 EventTarget도 안전하게 처리한다", () => {
    const fakeTarget = new EventTarget();
    const panel = document.createElement("div");
    expect(isPointerOutsideTargets(fakeTarget, [panel])).toBe(false);
  });

  it("isTargetInsideTargets는 대상 내부 여부를 정확히 판정한다", () => {
    const panel = document.createElement("div");
    const child = document.createElement("button");
    const outside = document.createElement("span");
    panel.appendChild(child);
    document.body.appendChild(panel);
    document.body.appendChild(outside);

    expect(isTargetInsideTargets(child, [panel])).toBe(true);
    expect(isTargetInsideTargets(outside, [panel])).toBe(false);
    expect(isTargetInsideTargets(null, [panel])).toBe(false);
    expect(isTargetInsideTargets(new EventTarget(), [panel])).toBe(false);
  });

  it("getActiveFocusableIndex는 active 요소의 인덱스를 반환하고 비HTMLElement는 -1", () => {
    const a = document.createElement("button");
    const b = document.createElement("button");
    const c = document.createElement("button");
    const focusables = [a, b, c];

    expect(getActiveFocusableIndex(focusables, b)).toBe(1);
    expect(getActiveFocusableIndex(focusables, document.createElement("div"))).toBe(-1);
    expect(getActiveFocusableIndex(focusables, null)).toBe(-1);
  });

  it("getPointerContainmentFlowSummary는 대상 없음/내부/외부 상태를 반환한다", () => {
    expect(getPointerContainmentFlowSummary({ inside: false, targetCount: 0 })).toEqual({
      primary: "대상 영역 없음",
      secondary: "포인터 판정 보류",
      detail: "비교할 대상 영역이 없어 내부/외부 여부를 확정할 수 없습니다.",
    });
    expect(getPointerContainmentFlowSummary({ inside: true, targetCount: 2 })).toEqual({
      primary: "대상 내부 클릭",
      secondary: "2개 영역 추적",
      detail: "현재 포인터 이벤트는 추적 중인 영역 안에서 발생했습니다.",
    });
    expect(getPointerContainmentFlowSummary({ inside: false, targetCount: 2 })).toEqual({
      primary: "대상 외부 클릭",
      secondary: "2개 영역 추적",
      detail: "현재 포인터 이벤트는 추적 중인 모든 영역 바깥에서 발생했습니다.",
    });
  });

  it("getActiveFocusFlowSummary는 포커스 상태를 설명한다", () => {
    const a = document.createElement("button");
    const b = document.createElement("button");
    expect(getActiveFocusFlowSummary([], null)).toEqual({
      primary: "포커스 대상 없음",
      secondary: "이동 불가",
      detail: "현재 순환 이동할 수 있는 포커스 가능한 요소가 없습니다.",
    });
    expect(getActiveFocusFlowSummary([a, b], null)).toEqual({
      primary: "포커스 재정렬 필요",
      secondary: "2개 후보",
      detail: "활성 요소가 현재 포커스 목록에 없어 첫 번째 후보로 재정렬이 필요합니다.",
    });
    expect(getActiveFocusFlowSummary([a, b], b)).toEqual({
      primary: "포커스 위치 확인",
      secondary: "2/2",
      detail: "활성 요소가 현재 포커스 가능한 목록 안에 있습니다.",
    });
  });
});
