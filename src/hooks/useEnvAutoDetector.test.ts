import { describe, expect, it } from "vitest";
import {
  getEnvSuggestionMeta,
  shouldShowEnvSuggestions,
  type EnvSuggestion,
} from "./useEnvAutoDetector";

describe("useEnvAutoDetector helpers", () => {
  it("제안 노출 여부는 결과 개수로 판단한다", () => {
    expect(shouldShowEnvSuggestions([])).toBe(false);
    expect(
      shouldShowEnvSuggestions([
        { file: "package.json", runtime: "Node", cmd: "npm install", description: "의존성 설치" },
      ]),
    ).toBe(true);
  });

  it("단일 제안은 바로 실행 흐름 중심 메타를 반환한다", () => {
    const suggestions: EnvSuggestion[] = [
      { file: "package.json", runtime: "Node", cmd: "npm install", description: "의존성 설치" },
    ];

    expect(getEnvSuggestionMeta(suggestions)).toEqual({
      title: "Node 실행 환경 제안",
      badges: ["먼저 package.json", "다음 바로 실행", "마지막 현재 터미널 적용"],
      helper: "package.json 기준으로 바로 실행할 명령을 준비했습니다. 현재 터미널 흐름을 끊지 않고 이어서 적용할 수 있습니다.",
    });
  });

  it("복수 제안은 후보 개수를 함께 요약한다", () => {
    const suggestions: EnvSuggestion[] = [
      { file: "requirements.txt", runtime: "Python", cmd: "pip install -r requirements.txt", description: "의존성 설치" },
      { file: "pyproject.toml", runtime: "Python", cmd: "uv sync", description: "uv 동기화" },
      { file: "Pipfile", runtime: "Python", cmd: "pipenv install", description: "pipenv 설치" },
    ];

    expect(getEnvSuggestionMeta(suggestions)).toEqual({
      title: "Python 실행 환경 후보 3개",
      badges: ["먼저 requirements.txt", "다음 후보 2개", "마지막 현재 터미널 적용"],
      helper: "requirements.txt 기준으로 실행 명령 후보를 정리했습니다. 내용을 확인한 뒤 현재 터미널에 바로 적용할 수 있습니다.",
    });
  });
});
