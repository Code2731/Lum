import { describe, expect, it } from "vitest";
import { getScriptLibraryMeta, type Script } from "./useScriptLibrary";

describe("useScriptLibrary helpers", () => {
  it("로딩 중에는 라이브러리 대기 메타를 반환한다", () => {
    expect(getScriptLibraryMeta([], true)).toEqual({
      title: "스크립트 라이브러리 불러오는 중",
      badges: ["먼저 저장 스크립트", "다음 커맨드 묶음", "마지막 현재 터미널 실행"],
      helper: "저장된 자동화 스크립트를 읽고 현재 터미널에서 바로 실행할 준비를 하고 있습니다.",
    });
  });

  it("저장된 스크립트와 총 커맨드 수를 요약한다", () => {
    const scripts: Script[] = [
      {
        id: "1",
        name: "개발 서버 준비",
        description: "install 후 dev 실행",
        commands: ["npm install", "npm run dev"],
        created_at: 1,
      },
      {
        id: "2",
        name: "테스트",
        description: "unit + e2e",
        commands: ["npm test", "npx playwright test", "npm run lint"],
        created_at: 2,
      },
    ];

    expect(getScriptLibraryMeta(scripts, false)).toEqual({
      title: "저장 스크립트 2개",
      badges: ["스크립트 2개", "커맨드 5개", "바로 실행 가능"],
      helper: "반복 커맨드를 묶어 현재 터미널에 바로 흘려보낼 수 있습니다.",
    });
  });

  it("빈 라이브러리는 새 스크립트 작성 흐름을 안내한다", () => {
    expect(getScriptLibraryMeta([], false)).toEqual({
      title: "저장된 스크립트가 없습니다",
      badges: ["스크립트 0개", "커맨드 0개", "새 스크립트 작성"],
      helper: "자주 쓰는 커맨드 흐름을 저장해두면 다음부터는 한 번에 실행할 수 있습니다.",
    });
  });
});
