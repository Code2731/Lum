import { describe, expect, it } from "vitest";
import { getSkillsMeta, type Skill } from "./useSkills";

describe("useSkills helpers", () => {
  it("로딩 중에는 스킬 라이브러리 준비 메타를 반환한다", () => {
    expect(getSkillsMeta([], true)).toEqual({
      title: "스킬 라이브러리 불러오는 중",
      badges: ["먼저 저장 스킬", "다음 트리거 연결", "마지막 ReAct 재사용"],
      helper: "저장된 절차 스킬과 트리거 매칭 정보를 불러오고 있습니다.",
    });
  });

  it("스킬 수와 트리거 수를 함께 요약한다", () => {
    const skills: Skill[] = [
      {
        id: "1",
        name: "Rebase 충돌 정리",
        description: "충돌을 정리한다",
        triggers: ["rebase", "conflict"],
        procedure: "1. git status",
        created_ms: 1,
        success_count: 2,
      },
      {
        id: "2",
        name: "배포 점검",
        description: "릴리스 전 체크",
        triggers: ["deploy"],
        procedure: "1. smoke test",
        created_ms: 2,
        success_count: 1,
      },
    ];

    expect(getSkillsMeta(skills, false)).toEqual({
      title: "스킬 2개 준비됨",
      badges: ["스킬 2개", "트리거 3개", "즉시 재사용 가능"],
      helper: "저장된 절차와 트리거를 기반으로 다음 ReAct 흐름에서 바로 재사용할 수 있습니다.",
    });
  });

  it("스킬이 없으면 새 절차 저장 흐름을 안내한다", () => {
    expect(getSkillsMeta([], false)).toEqual({
      title: "저장된 스킬이 없습니다",
      badges: ["스킬 0개", "트리거 0개", "새 절차 저장"],
      helper: "반복 작업 절차를 스킬로 저장해두면 다음부터는 자연어 goal과 자동으로 연결할 수 있습니다.",
    });
  });
});
