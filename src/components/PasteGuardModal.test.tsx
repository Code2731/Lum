import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PasteGuardModal, { getPasteGuardFlowSummary } from "./PasteGuardModal";

describe("PasteGuardModal", () => {
  it("위험도에 따라 붙여넣기 흐름 요약을 계산한다", () => {
    expect(
      getPasteGuardFlowSummary({
        level: "danger",
        reason: "rm -rf 패턴이 감지되었습니다.",
        pattern: "rm -rf /important/path",
      }),
    ).toEqual({
      badges: ["단일 명령 감지", "위험 명령 포함", "마지막 실행 여부 재확인"],
      helper: "첫 명령 하나만 바로 실행 후보로 사용할 수 있습니다. 탐지된 이유를 읽고 정말 실행할지 한 번 더 확인합니다.",
    });
  });

  it("붙여넣기 경고 흐름 안내를 보여준다", () => {
    render(
      <PasteGuardModal
        match={{
          level: "danger",
          reason: "rm -rf 패턴이 감지되었습니다.",
          pattern: "rm -rf /important/path",
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("단일 명령 감지")).toBeInTheDocument();
    expect(screen.getByText("rm -rf /important/path")).toBeInTheDocument();
    expect(screen.getByText("마지막 실행 여부 재확인")).toBeInTheDocument();
    expect(
      screen.getByText(/첫 명령 하나만 바로 실행 후보로 사용할 수 있습니다\./),
    ).toBeInTheDocument();
    expect(screen.getByText("rm -rf 패턴이 감지되었습니다.")).toBeInTheDocument();
  });
});
