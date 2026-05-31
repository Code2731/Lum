import { describe, expect, it } from "vitest";
import {
  isEventTargetWithinSelector,
  isPointerOutsideTargets,
  isTargetInsideTargets,
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
});
