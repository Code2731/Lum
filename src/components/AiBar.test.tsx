import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AiBar, { getAiBarFlowSummary } from "./AiBar";

const baseProps = {
  value: "",
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  onClose: vi.fn(),
  disabled: false,
  processing: false,
  inputRef: { current: null },
};

describe("AiBar", () => {
  it("요약 함수는 기본/입력완료/처리중 상태를 반환한다", () => {
    expect(getAiBarFlowSummary({ processing: false, disabled: false, value: "" })).toEqual({
      primary: "질문 준비",
      secondary: "입력 대기",
      detail: "질문을 먼저 입력하고 Enter로 보내며, 필요하면 Esc나 단축키로 즉시 닫습니다.",
    });
    expect(getAiBarFlowSummary({ processing: false, disabled: false, value: "hello" })).toEqual({
      primary: "질문 준비 완료",
      secondary: "Enter 전송",
      detail: "작성한 질문을 Enter로 보내고 필요하면 Esc나 단축키로 즉시 닫을 수 있습니다.",
    });
    expect(getAiBarFlowSummary({ processing: true, disabled: false, value: "" })).toEqual({
      primary: "응답 생성 중",
      secondary: "중단 가능",
      detail: "응답이 길어지면 중단하고, 결과를 확인한 뒤 다음 질문으로 바로 이어갈 수 있습니다.",
    });
  });

  it("기본 상태에서 질문 흐름 안내를 보여준다", () => {
    render(<AiBar {...baseProps} />);

    expect(screen.getByText("질문 준비")).toBeInTheDocument();
    expect(screen.getByText("입력 대기")).toBeInTheDocument();
    expect(screen.getByText("마지막 닫기")).toBeInTheDocument();
    expect(
      screen.getByText("질문을 먼저 입력하고 Enter로 보내며, 필요하면 Esc나 단축키로 즉시 닫습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter 전송 · Esc 또는 Cmd/Ctrl+Shift+K 로 닫기"),
    ).toBeInTheDocument();
  });

  it("처리 중 상태에서 응답 흐름 안내를 보여준다", () => {
    render(<AiBar {...baseProps} processing />);

    expect(screen.getByText("응답 생성 중")).toBeInTheDocument();
    expect(screen.getByText("중단 가능")).toBeInTheDocument();
    expect(screen.getByText("마지막 닫기")).toBeInTheDocument();
  });
});
