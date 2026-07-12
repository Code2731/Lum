import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getIconButtonAccessibleMeta, IconButton } from "./icon-button";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

describe("IconButton", () => {
  it("tooltip/title/aria-label 우선순위 메타를 계산한다", () => {
    expect(
      getIconButtonAccessibleMeta({
        tooltip: "닫기",
      }),
    ).toEqual({
      ariaLabel: "닫기",
      title: "닫기",
    });

    expect(
      getIconButtonAccessibleMeta({
        tooltip: "닫기",
        title: "패널 닫기",
      }),
    ).toEqual({
      ariaLabel: "닫기",
      title: "패널 닫기",
    });

    expect(
      getIconButtonAccessibleMeta({
        tooltip: <span>아이콘 전용</span>,
        ariaLabel: "패널 닫기",
      }),
    ).toEqual({
      ariaLabel: "패널 닫기",
      title: undefined,
    });
  });

  it("문자열 tooltip을 aria-label과 title로 연결하고 단축키 힌트를 렌더링한다", () => {
    render(
      <IconButton tooltip="닫기" shortcut="Esc">
        <span>아이콘</span>
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "닫기" });
    expect(button).toHaveAttribute("title", "닫기");
    expect(button.className).toContain("focus-visible:ring-1");
    expect(button.className).toContain("disabled:opacity-40");
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });

  it("명시적 title이 있으면 tooltip 문자열보다 우선한다", () => {
    render(
      <IconButton tooltip="최소화" title="창 최소화">
        <span>아이콘</span>
      </IconButton>,
    );

    expect(screen.getByRole("button", { name: "최소화" })).toHaveAttribute("title", "창 최소화");
  });

  it("confirm 액션은 확인 버튼에서 onClick을 호출한다", () => {
    const onClick = vi.fn();
    render(
      <IconButton
        tooltip="삭제"
        confirm={{ title: "빠른 액션 삭제", confirmLabel: "삭제 진행" }}
        onClick={onClick}
      >
        <span>아이콘</span>
      </IconButton>,
    );

    fireEvent.click(screen.getByText("삭제 진행"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
