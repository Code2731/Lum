import { describe, expect, it } from "vitest";
import {
  getOsc7ParseFlowSummary,
  getTabIconFlowSummary,
  inferTabIcon,
  parseOsc7,
} from "./tabIcon";

describe("inferTabIcon", () => {
  it("경로 패턴으로 아이콘을 추론한다", () => {
    expect(inferTabIcon("/workspace/python/app.py")).toBe("python");
    expect(inferTabIcon("/workspace/rust/Cargo.toml")).toBe("rust");
    expect(inferTabIcon("/workspace/node/index.ts")).toBe("node");
  });

  it("매칭이 없으면 terminal을 반환한다", () => {
    expect(inferTabIcon("/workspace/plain")).toBe("terminal");
  });
});

describe("parseOsc7", () => {
  it("OSC7 시퀀스에서 경로를 추출한다", () => {
    expect(parseOsc7("\u001b]7;file://host/Users/test/project\u0007")).toBe(
      "/Users/test/project",
    );
  });

  it("경로가 없으면 null을 반환한다", () => {
    expect(parseOsc7("plain text")).toBeNull();
  });
});

describe("getTabIconFlowSummary", () => {
  it("추론된 아이콘 상태를 반환한다", () => {
    expect(getTabIconFlowSummary("/workspace/python/app.py")).toEqual({
      primary: "탭 아이콘 추론",
      secondary: "Python 작업공간",
      detail: "/workspace/python/app.py",
    });
  });

  it("빈 경로는 기본 안내를 반환한다", () => {
    expect(getTabIconFlowSummary("")).toEqual({
      primary: "탭 아이콘 추론",
      secondary: "일반 터미널",
      detail: "작업 경로가 없어 기본 터미널 아이콘을 사용합니다.",
    });
  });
});

describe("getOsc7ParseFlowSummary", () => {
  it("OSC7 경로가 있으면 감지 상태를 반환한다", () => {
    expect(getOsc7ParseFlowSummary("\u001b]7;file://host/tmp/work\u0007")).toEqual({
      primary: "OSC7 경로 감지",
      secondary: "/tmp/work",
      detail: "터미널이 보고한 최신 작업 디렉터리 경로를 사용할 수 있습니다.",
    });
  });

  it("OSC7 경로가 없으면 유지 상태를 반환한다", () => {
    expect(getOsc7ParseFlowSummary("plain text")).toEqual({
      primary: "OSC7 경로 없음",
      secondary: "기존 작업 경로 유지",
      detail: "OSC 7 시퀀스에서 해석 가능한 파일 경로를 찾지 못했습니다.",
    });
  });
});
