import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  getAlertDialogTextMeta,
} from "./alert-dialog";

vi.mock("@radix-ui/react-alert-dialog", () => {
  const Overlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    (props, ref) => <div ref={ref} {...props} />,
  );
  const Content = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  const Title = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  const Description = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  const Action = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>,
  );
  const Cancel = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>,
  );
  return {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Trigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Overlay,
    Content,
    Header: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Title,
    Description,
    Action,
    Cancel,
  };
});

describe("AlertDialog primitives", () => {
  it("제목과 설명 메타를 계산한다", () => {
    expect(
      getAlertDialogTextMeta("삭제 확인", "되돌릴 수 없습니다."),
    ).toEqual({
      titleTitle: "삭제 확인",
      descriptionTitle: "되돌릴 수 없습니다.",
    });
  });

  it("오버레이와 컨텐츠의 제품 톤 스타일을 제공한다", () => {
    render(
      <AlertDialog>
        <AlertDialogOverlay data-testid="overlay" />
        <AlertDialogContent>내용</AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByTestId("overlay").className).toContain("bg-black/70");
    const content = screen.getByText("내용");
    expect(content.className).toContain("rounded-xl");
    expect(content.className).toContain("bg-[#11161d]");
    expect(content.className).toContain("text-white");
  });

  it("제목/설명/액션 버튼 가독성 클래스를 제공한다", () => {
    render(
      <AlertDialog>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByText("삭제 확인").className).toContain("text-white/92");
    expect(screen.getByText("삭제 확인")).toHaveAttribute("title", "삭제 확인");
    expect(screen.getByText("되돌릴 수 없습니다.").className).toContain("leading-6");
    expect(screen.getByText("되돌릴 수 없습니다.").className).toContain("text-white/62");
    expect(screen.getByText("되돌릴 수 없습니다.")).toHaveAttribute("title", "되돌릴 수 없습니다.");
    expect(screen.getByRole("button", { name: "취소" }).className).toContain("min-w-[88px]");
    expect(screen.getByRole("button", { name: "삭제" }).className).toContain("min-w-[88px]");
  });
});
