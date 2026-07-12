import { describe, expect, it } from "vitest";
import {
  getInspectorMenuHotkeyFlowSummary,
  resolveInspectorMenuHotkey,
} from "./inspectorMenuHotkeys";

describe("resolveInspectorMenuHotkey", () => {
  it("R 키는 메뉴 열림 여부와 관계없이 run", () => {
    expect(resolveInspectorMenuHotkey("r", false)).toBe("run");
    expect(resolveInspectorMenuHotkey("R", true)).toBe("run");
  });

  it("C/L 키는 메뉴가 열려 있을 때만 copy/load", () => {
    expect(resolveInspectorMenuHotkey("c", true)).toBe("copy");
    expect(resolveInspectorMenuHotkey("C", true)).toBe("copy");
    expect(resolveInspectorMenuHotkey("l", true)).toBe("load");
    expect(resolveInspectorMenuHotkey("L", true)).toBe("load");
    expect(resolveInspectorMenuHotkey("c", false)).toBeNull();
    expect(resolveInspectorMenuHotkey("l", false)).toBeNull();
  });

  it("기타 키는 null", () => {
    expect(resolveInspectorMenuHotkey("x", true)).toBeNull();
    expect(resolveInspectorMenuHotkey("ArrowRight", true)).toBeNull();
    expect(resolveInspectorMenuHotkey("", true)).toBeNull();
    expect(resolveInspectorMenuHotkey(" ", true)).toBeNull();
  });

  it("단축키 액션별 흐름 요약을 반환한다", () => {
    expect(getInspectorMenuHotkeyFlowSummary("run")).toEqual({
      badges: ["R 단축키", "즉시 실행", "현재 흐름 유지"],
      helper: "추천 커맨드를 바로 실행해 보고 결과를 현재 인스펙터 흐름에서 이어서 확인하는 동작입니다.",
    });
    expect(getInspectorMenuHotkeyFlowSummary("copy")).toEqual({
      badges: ["C 단축키", "명령 복사", "외부 재사용"],
      helper: "추천 커맨드를 클립보드에 복사해 다른 입력창이나 외부 맥락으로 옮겨 쓰는 흐름입니다.",
    });
    expect(getInspectorMenuHotkeyFlowSummary("load")).toEqual({
      badges: ["L 단축키", "AI 바 로드", "수정 후 실행"],
      helper: "추천 커맨드를 AI 입력바로 옮겨 약간 수정한 뒤 실행 흐름으로 넘기기 좋습니다.",
    });
  });
});
