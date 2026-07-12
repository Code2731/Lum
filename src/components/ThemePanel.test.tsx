import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ThemePanel, { getThemePanelFlowSummary } from "./ThemePanel";

describe("ThemePanel", () => {
  it("요약 함수는 현재 조합을 반환한다", () => {
    expect(
      getThemePanelFlowSummary({
        themeName: "GitHub Dark",
        fontSize: 14,
        fontFamily: "Menlo",
      }),
    ).toEqual({
      primary: "테마 조합 편집",
      secondary: "GitHub Dark · 14px",
      detail: "Menlo 기준으로 색상과 크기를 조정한 뒤 미리보기를 보고 바로 적용할 수 있습니다.",
    });
  });

  it("테마 설정 흐름 안내를 보여준다", () => {
    render(
      <ThemePanel
        appearance={{ themeName: "GitHub Dark", fontSize: 14, fontFamily: "Menlo" }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("테마 조합 편집")).toBeInTheDocument();
    expect(screen.getByText("GitHub Dark · 14px")).toBeInTheDocument();
    expect(screen.getByText("마지막 미리보기 적용")).toBeInTheDocument();
    expect(
      screen.getByText("Menlo 기준으로 색상과 크기를 조정한 뒤 미리보기를 보고 바로 적용할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("현재 조합")).toBeInTheDocument();
    expect(screen.getByText("실시간 미리보기")).toBeInTheDocument();
    expect(screen.getByText("적용 준비")).toBeInTheDocument();
  });
});
