import { describe, expect, it } from "vitest";
import { getQuickActionsMeta, type QuickAction } from "./useQuickActions";

describe("useQuickActions helpers", () => {
  it("빠른 액션이 비어 있으면 생성 흐름을 안내한다", () => {
    expect(getQuickActionsMeta([])).toEqual({
      title: "빠른 액션이 비어 있습니다",
      badges: ["액션 0개", "단축키 0개", "새 액션 추가"],
      helper: "반복 명령을 빠른 액션으로 저장하면 다음부터는 검색이나 타이핑 없이 바로 실행할 수 있습니다.",
    });
  });

  it("빠른 액션과 단축키 개수를 함께 요약한다", () => {
    const actions: QuickAction[] = [
      { id: "1", label: "Dev", command: "npm run dev", shortcut: 1 },
      { id: "2", label: "Test", command: "npm test" },
      { id: "3", label: "Lint", command: "npm run lint", shortcut: 3 },
    ];

    expect(getQuickActionsMeta(actions)).toEqual({
      title: "빠른 액션 3개 준비됨",
      badges: ["액션 3개", "단축키 2개", "즉시 실행 가능"],
      helper: "자주 쓰는 명령을 저장해 두고 단축키까지 연결하면 현재 터미널에서 바로 실행할 수 있습니다.",
    });
  });
});
