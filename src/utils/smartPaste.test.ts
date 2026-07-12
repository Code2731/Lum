import { describe, expect, it } from "vitest";
import {
  getSmartPasteFlowSummary,
  isMultiLineCommand,
  parseCommandLines,
} from "./smartPaste";

describe("parseCommandLines", () => {
  it("프롬프트 접두사를 제거하고 명령만 반환한다", () => {
    expect(parseCommandLines("$ npm run dev")).toEqual(["npm run dev"]);
    expect(parseCommandLines("  > git status")).toEqual(["git status"]);
  });

  it("주석과 빈 줄은 제외한다", () => {
    expect(parseCommandLines(["", "# comment", "pnpm test"].join("\n"))).toEqual([
      "pnpm test",
    ]);
  });
});

describe("isMultiLineCommand", () => {
  it("실행 가능한 명령이 두 줄 이상이면 true", () => {
    expect(isMultiLineCommand(["npm install", "npm run dev"].join("\n"))).toBe(true);
  });

  it("실행 가능한 명령이 한 줄이면 false", () => {
    expect(isMultiLineCommand(["# note", "npm run dev"].join("\n"))).toBe(false);
  });
});

describe("getSmartPasteFlowSummary", () => {
  it("실행할 명령이 없으면 대기 상태를 반환한다", () => {
    expect(getSmartPasteFlowSummary(["", "# note"].join("\n"))).toEqual({
      primary: "붙여넣기 대기",
      secondary: "실행할 명령 없음",
      detail: "주석과 빈 줄만 있어 아직 실행할 명령을 찾지 못했습니다.",
    });
  });

  it("단일 명령은 첫 명령을 요약한다", () => {
    expect(getSmartPasteFlowSummary("$ npm run dev")).toEqual({
      primary: "단일 명령 감지",
      secondary: "npm run dev",
      detail: "첫 명령 하나만 바로 실행 후보로 사용할 수 있습니다.",
    });
  });

  it("여러 줄 명령은 개수와 첫 명령을 함께 반환한다", () => {
    expect(getSmartPasteFlowSummary(["npm install", "npm run dev"].join("\n"))).toEqual({
      primary: "2개 명령 감지",
      secondary: "npm install",
      detail: "여러 줄 명령으로 인식되어 순서대로 검토하거나 실행할 수 있습니다.",
    });
  });
});
