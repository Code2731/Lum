import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EnvSuggestionToast, { getEnvSuggestionFlowSummary } from "./EnvSuggestionToast";

describe("EnvSuggestionToast", () => {
  it("요약 함수는 제안 없음/있음 상태를 반환한다", () => {
    expect(getEnvSuggestionFlowSummary([])).toEqual({
      primary: "환경 제안 없음",
      secondary: "실행 대기",
      detail: "자동 실행할 환경 제안이 아직 없어 현재 설정을 유지합니다.",
    });
    expect(
      getEnvSuggestionFlowSummary([
        {
          file: ".nvmrc",
          runtime: "Node.js",
          description: "Node 버전을 맞춥니다",
          cmd: "nvm use",
        },
      ]),
    ).toEqual({
      primary: "환경 제안 준비",
      secondary: "Node.js · 1개",
      detail: "감지된 런타임과 실행 명령을 확인한 뒤 현재 프로젝트에 맞는 항목만 바로 실행할 수 있습니다.",
    });
  });

  it("환경 제안 흐름 안내를 보여준다", () => {
    render(
      <EnvSuggestionToast
        suggestions={[
          {
            file: ".nvmrc",
            runtime: "Node.js",
            description: "Node 버전을 맞춥니다",
            cmd: "nvm use",
          },
        ]}
        onExecute={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("환경 제안 준비")).toBeInTheDocument();
    expect(screen.getByText("Node.js · 1개")).toBeInTheDocument();
    expect(screen.getByText("마지막 실행")).toBeInTheDocument();
    expect(
      screen.getByText("감지된 런타임과 실행 명령을 확인한 뒤 현재 프로젝트에 맞는 항목만 바로 실행할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("Node 버전을 맞춥니다")).toBeInTheDocument();
  });
});
