import { describe, it, expect } from "vitest";
import { classifyTerminalKey } from "./terminalKeys";

const k = (over: Partial<{ type: string; key: string; ctrlKey: boolean; metaKey: boolean }>) => ({
  type: "keydown",
  key: "",
  ctrlKey: false,
  metaKey: false,
  ...over,
});

describe("classifyTerminalKey", () => {
  it("Ctrl+C with selection → copy", () => {
    const r = classifyTerminalKey(k({ key: "c", ctrlKey: true }), "hello");
    expect(r).toEqual({ kind: "copy", selection: "hello" });
  });

  it("Cmd+C with selection → copy (mac)", () => {
    const r = classifyTerminalKey(k({ key: "c", metaKey: true }), "hello");
    expect(r).toEqual({ kind: "copy", selection: "hello" });
  });

  it("Ctrl+Shift+C with selection도 copy로 처리한다", () => {
    const r = classifyTerminalKey(k({ key: "C", ctrlKey: true }), "hello");
    expect(r).toEqual({ kind: "copy", selection: "hello" });
  });

  it("Ctrl+C without selection → passthrough (xterm SIGINT 그대로)", () => {
    const r = classifyTerminalKey(k({ key: "c", ctrlKey: true }), "");
    expect(r).toEqual({ kind: "passthrough" });
  });

  it("Ctrl+V → paste (selection 무관)", () => {
    expect(classifyTerminalKey(k({ key: "v", ctrlKey: true }), "")).toEqual({ kind: "paste" });
    expect(classifyTerminalKey(k({ key: "v", ctrlKey: true }), "abc")).toEqual({ kind: "paste" });
  });

  it("Ctrl+Shift+V도 paste로 처리한다", () => {
    expect(classifyTerminalKey(k({ key: "V", ctrlKey: true }), "")).toEqual({ kind: "paste" });
  });

  it("Ctrl+F → search", () => {
    expect(classifyTerminalKey(k({ key: "f", ctrlKey: true }), "")).toEqual({ kind: "search" });
  });

  it("Ctrl+Shift+F도 search로 처리한다", () => {
    expect(classifyTerminalKey(k({ key: "F", ctrlKey: true }), "")).toEqual({ kind: "search" });
  });

  it("modifier 없는 c/v/f → passthrough (일반 입력)", () => {
    expect(classifyTerminalKey(k({ key: "c" }), "sel")).toEqual({ kind: "passthrough" });
    expect(classifyTerminalKey(k({ key: "v" }), "")).toEqual({ kind: "passthrough" });
    expect(classifyTerminalKey(k({ key: "f" }), "")).toEqual({ kind: "passthrough" });
  });

  it("keyup은 무조건 passthrough — keydown만 처리", () => {
    expect(classifyTerminalKey(k({ key: "c", ctrlKey: true, type: "keyup" }), "x")).toEqual({
      kind: "passthrough",
    });
    expect(classifyTerminalKey(k({ key: "v", ctrlKey: true, type: "keyup" }), "")).toEqual({
      kind: "passthrough",
    });
  });

  it("다른 modifier 키는 passthrough — Ctrl+A/X/Z 등 미정의", () => {
    expect(classifyTerminalKey(k({ key: "a", ctrlKey: true }), "sel")).toEqual({
      kind: "passthrough",
    });
    expect(classifyTerminalKey(k({ key: "x", ctrlKey: true }), "")).toEqual({
      kind: "passthrough",
    });
  });
});
