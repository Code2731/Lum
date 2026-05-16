import { describe, expect, it } from "vitest";
import { resolveInspectorMenuHotkey } from "./inspectorMenuHotkeys";

describe("resolveInspectorMenuHotkey", () => {
  it("R 키는 메뉴 열림 여부와 관계없이 run", () => {
    expect(resolveInspectorMenuHotkey("r", false)).toBe("run");
    expect(resolveInspectorMenuHotkey("R", true)).toBe("run");
  });

  it("C/L 키는 메뉴가 열려 있을 때만 copy/load", () => {
    expect(resolveInspectorMenuHotkey("c", true)).toBe("copy");
    expect(resolveInspectorMenuHotkey("l", true)).toBe("load");
    expect(resolveInspectorMenuHotkey("c", false)).toBeNull();
    expect(resolveInspectorMenuHotkey("l", false)).toBeNull();
  });

  it("기타 키는 null", () => {
    expect(resolveInspectorMenuHotkey("x", true)).toBeNull();
    expect(resolveInspectorMenuHotkey("ArrowRight", true)).toBeNull();
  });
});
