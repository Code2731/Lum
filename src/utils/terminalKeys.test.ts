import { describe, it, expect } from "vitest";
import {
  classifyTerminalKey,
  getTerminalKeyFlowSummary,
} from "./terminalKeys";

const k = (over: Partial<{ type: string; key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) => ({
  type: "keydown",
  key: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
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

  it("Ctrl+Alt+F/C/V는 passthrough (단축키 충돌 방지)", () => {
    expect(classifyTerminalKey(k({ key: "f", ctrlKey: true, altKey: true }), "")).toEqual({
      kind: "passthrough",
    });
    expect(classifyTerminalKey(k({ key: "c", ctrlKey: true, altKey: true }), "hello")).toEqual({
      kind: "passthrough",
    });
    expect(classifyTerminalKey(k({ key: "v", ctrlKey: true, altKey: true }), "")).toEqual({
      kind: "passthrough",
    });
  });

  it("Meta+Alt+F/C/V는 passthrough (단축키 충돌 방지)", () => {
    expect(classifyTerminalKey(k({ key: "f", metaKey: true, altKey: true }), "")).toEqual({
      kind: "passthrough",
    });
    expect(classifyTerminalKey(k({ key: "c", metaKey: true, altKey: true }), "hello")).toEqual({
      kind: "passthrough",
    });
    expect(classifyTerminalKey(k({ key: "v", metaKey: true, altKey: true }), "")).toEqual({
      kind: "passthrough",
    });
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

  it("키 분기별 흐름 요약을 반환한다", () => {
    expect(getTerminalKeyFlowSummary("copy")).toEqual({
      badges: ["선택 영역 있음", "복사 동작", "터미널 포커스 유지"],
      helper: "선택된 출력이 있을 때만 복사로 전환하고, 그렇지 않으면 기본 Ctrl/Cmd+C 동작을 그대로 유지합니다.",
    });
    expect(getTerminalKeyFlowSummary("paste")).toEqual({
      badges: ["붙여넣기 요청", "입력 전 검사", "PTY 전달"],
      helper: "붙여넣기는 이후 위험도 검사나 Smart Paste 흐름을 거쳐 터미널 입력으로 전달됩니다.",
    });
    expect(getTerminalKeyFlowSummary("search")).toEqual({
      badges: ["검색 열기", "출력 탐색", "현재 세션 유지"],
      helper: "현재 터미널 세션을 그대로 둔 채 출력 검색 UI로 전환하는 흐름입니다.",
    });
    expect(getTerminalKeyFlowSummary("passthrough")).toEqual({
      badges: ["기본 키 처리", "xterm 위임", "터미널 동작 유지"],
      helper: "단축키로 가로채지 않는 입력은 xterm 기본 동작으로 넘겨 기존 터미널 동작을 보존합니다.",
    });
  });
});
