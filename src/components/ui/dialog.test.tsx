import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  getDialogCloseLabel,
  getDialogTextMeta,
} from "./dialog";

vi.mock("@radix-ui/react-dialog", () => {
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
  const Close = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>,
  );
  return {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Trigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Close,
    Overlay,
    Content,
    Title,
    Description,
  };
});

describe("Dialog primitives", () => {
  it("닫기 라벨과 제목/설명 메타를 계산한다", () => {
    expect(getDialogCloseLabel()).toBe("닫기");
    expect(
      getDialogTextMeta("빠른 액션 편집", "반복 명령을 정리합니다."),
    ).toEqual({
      titleTitle: "빠른 액션 편집",
      descriptionTitle: "반복 명령을 정리합니다.",
    });
  });

  it("오버레이와 컨텐츠의 제품 톤 스타일을 제공한다", () => {
    render(
      <Dialog>
        <DialogOverlay data-testid="overlay" />
        <DialogContent>내용</DialogContent>
      </Dialog>,
    );

    expect(screen.getByTestId("overlay").className).toContain("bg-black/70");
    const content = screen.getByText("내용");
    expect(content.className).toContain("rounded-xl");
    expect(content.className).toContain("bg-[#11161d]");
    expect(content.className).toContain("text-white");
  });

  it("제목과 설명 가독성 클래스를 제공하고 닫기 버튼을 렌더링한다", () => {
    render(
      <Dialog>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>빠른 액션 편집</DialogTitle>
            <DialogDescription>반복 명령을 정리합니다.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByText("빠른 액션 편집").className).toContain("text-white/92");
    expect(screen.getByText("빠른 액션 편집")).toHaveAttribute("title", "빠른 액션 편집");
    expect(screen.getByText("반복 명령을 정리합니다.").className).toContain("leading-6");
    expect(screen.getByText("반복 명령을 정리합니다.").className).toContain("text-white/62");
    expect(screen.getByText("반복 명령을 정리합니다.")).toHaveAttribute("title", "반복 명령을 정리합니다.");
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
  });
});
