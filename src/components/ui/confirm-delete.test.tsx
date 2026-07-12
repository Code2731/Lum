import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDeleteDialog, getConfirmDeleteFlowSummary } from "./confirm-delete";

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    className?: string;
  }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe("ConfirmDeleteDialog", () => {
  it("삭제 확인 흐름 요약을 계산한다", () => {
    expect(getConfirmDeleteFlowSummary("워크스페이스", "연결된 기록도 함께 제거됩니다.")).toEqual({
      badges: ["워크스페이스 확인", "다음 영향 검토", "마지막 삭제 확정"],
      helper: "이름과 삭제 영향을 먼저 확인하고, 되돌릴 수 없는 작업인지 검토한 뒤 마지막에 삭제를 확정합니다.",
    });

    expect(getConfirmDeleteFlowSummary("항목")).toEqual({
      badges: ["항목 확인", "다음 되돌림 불가 확인", "마지막 삭제 확정"],
      helper: "삭제 대상을 먼저 확인하고, 되돌릴 수 없는 작업임을 다시 확인한 뒤 마지막에 삭제를 확정합니다.",
    });
  });

  it("삭제 확인 흐름과 설명을 렌더링한다", () => {
    render(
      <ConfirmDeleteDialog
        itemName="워크스페이스 A"
        itemType="워크스페이스"
        description="연결된 기록도 함께 제거됩니다."
        onConfirm={vi.fn()}
      >
        <button type="button">열기</button>
      </ConfirmDeleteDialog>,
    );

    expect(screen.getByText("워크스페이스 삭제")).toBeInTheDocument();
    expect(screen.getByText(/"워크스페이스 A"/)).toBeInTheDocument();
    expect(screen.getByText("연결된 기록도 함께 제거됩니다.")).toBeInTheDocument();
    expect(screen.getByText("이 작업은 되돌릴 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("워크스페이스 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 영향 검토")).toBeInTheDocument();
    expect(screen.getByText("마지막 삭제 확정")).toBeInTheDocument();
    expect(screen.getByText("이름과 삭제 영향을 먼저 확인하고, 되돌릴 수 없는 작업인지 검토한 뒤 마지막에 삭제를 확정합니다.")).toBeInTheDocument();
  });

  it("삭제 버튼 클릭 시 확인 콜백을 호출한다", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteDialog itemName="스크립트" onConfirm={onConfirm}>
        <button type="button">열기</button>
      </ConfirmDeleteDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
