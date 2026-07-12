import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SmartPasteModal from "./SmartPasteModal";

const baseProps = {
  lines: ["git status", "npm run build"],
  rawText: "git status\nnpm run build",
  onRunAll: vi.fn(),
  onPasteText: vi.fn(),
  onClose: vi.fn(),
  writeLine: vi.fn(),
};

describe("SmartPasteModal", () => {
  it("초기 상태에서 멀티라인 붙여넣기 흐름 안내를 보여준다", () => {
    render(<SmartPasteModal {...baseProps} />);

    expect(screen.getByText("2개 명령 감지")).toBeInTheDocument();
    expect(screen.getByText("git status")).toBeInTheDocument();
    expect(screen.getByText("마지막 붙여넣기 결정")).toBeInTheDocument();
    expect(
      screen.getByText(/여러 줄 명령으로 인식되어 순서대로 검토하거나 실행할 수 있습니다/),
    ).toBeInTheDocument();
  });

  it("단계별 실행 상태에서 현재 명령 흐름 안내를 보여준다", () => {
    render(<SmartPasteModal {...baseProps} />);

    fireEvent.click(screen.getByText("단계별 실행"));

    expect(screen.getByText("현재 명령 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 명령 미리보기")).toBeInTheDocument();
    expect(screen.getByText("마지막 실행·건너뛰기")).toBeInTheDocument();
  });
});
