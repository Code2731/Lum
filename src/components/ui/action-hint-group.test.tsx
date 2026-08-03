import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ActionHintGroup,
  getActionHintButtonTitle,
  getActionReasonLabel,
} from "./action-hint-group";

describe("ActionHintGroup", () => {
  it("버튼 title과 이유 라벨을 계산한다", () => {
    expect(getActionHintButtonTitle("RAG 열기", "⌘R")).toBe("RAG 열기 (⌘R)");
    expect(getActionHintButtonTitle("복사")).toBe("복사");
    expect(getActionReasonLabel("RAG 열기")).toBe("RAG 열기:");
  });

  it("버튼과 이유를 구조적으로 연결해 렌더링한다", () => {
    render(
      <ActionHintGroup
        primary={{
          label: "RAG 열기",
          onClick: vi.fn(),
          shortcut: "⌘R",
          reason: "코드 맥락을 먼저 확인할 수 있습니다.",
        }}
        secondary={{
          label: "히스토리 보기",
          onClick: vi.fn(),
          shortcut: "⌘H",
          reason: "이전 실행 흐름을 빠르게 되짚습니다.",
        }}
      />,
    );

    expect(screen.getByLabelText("추천 작업")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "실행 가능한 작업" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "작업 이유" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RAG 열기" })).toHaveAttribute("title", "RAG 열기 (⌘R)");
    expect(screen.getByRole("button", { name: "히스토리 보기" })).toHaveAttribute("title", "히스토리 보기 (⌘H)");
    expect(screen.getByText("RAG 열기:")).toBeInTheDocument();
    expect(screen.getByText("코드 맥락을 먼저 확인할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("히스토리 보기:")).toBeInTheDocument();
    expect(screen.getByText("이전 실행 흐름을 빠르게 되짚습니다.")).toBeInTheDocument();
  });

  it("버튼 클릭 시 각 콜백을 호출한다", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <ActionHintGroup
        primary={{
          label: "실행",
          onClick: onPrimary,
          reason: "주요 작업을 시작합니다.",
        }}
        secondary={{
          label: "복사",
          onClick: onSecondary,
          reason: "보조 작업을 이어갑니다.",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    fireEvent.click(screen.getByRole("button", { name: "복사" }));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
