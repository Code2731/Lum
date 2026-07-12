import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import ScriptLibraryPanel, { getScriptLibraryFlowSummary } from "./ScriptLibraryPanel";

describe("ScriptLibraryPanel", () => {
  it("요약 함수는 로딩/생성/빈 상태를 반환한다", () => {
    expect(getScriptLibraryFlowSummary({ loading: true, scriptsCount: 0, creating: false })).toEqual({
      primary: "스크립트 불러오는 중",
      secondary: "목록 갱신",
      detail: "저장된 스크립트 목록을 불러오는 중이며 완료되면 바로 실행 또는 편집할 수 있습니다.",
    });
    expect(getScriptLibraryFlowSummary({ loading: false, scriptsCount: 2, creating: true })).toEqual({
      primary: "새 스크립트 작성 중",
      secondary: "기존 2개",
      detail: "이름과 명령을 정리해 저장하면 라이브러리에 바로 추가할 수 있습니다.",
    });
    expect(getScriptLibraryFlowSummary({ loading: false, scriptsCount: 0, creating: false })).toEqual({
      primary: "첫 스크립트 준비",
      secondary: "저장 없음",
      detail: "반복 작업을 저장해두면 다음에는 목록에서 골라 한 번에 실행할 수 있습니다.",
    });
  });

  it("빈 상태에서 스크립트 라이브러리 흐름 안내를 보여준다", () => {
    render(
      <TooltipProvider>
        <ScriptLibraryPanel
          scripts={[]}
          loading={false}
          onLoad={vi.fn()}
          onRun={vi.fn()}
          onDelete={vi.fn()}
          onSave={vi.fn(async () => undefined)}
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("첫 스크립트 준비")).toBeInTheDocument();
    expect(screen.getByText("저장 없음")).toBeInTheDocument();
    expect(screen.getByText("마지막 실행·저장")).toBeInTheDocument();
    expect(
      screen.getByText("반복 작업을 저장해두면 다음에는 목록에서 골라 한 번에 실행할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("첫 스크립트 추가")).toBeInTheDocument();
    expect(screen.getByText("반복 작업 저장")).toBeInTheDocument();
    expect(screen.getByText("한 번에 실행")).toBeInTheDocument();
  });
});
