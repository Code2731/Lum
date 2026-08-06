import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandEmpty,
  CommandItem,
  getCommandDialogTitle,
  getCommandInputAccessibleText,
} from "./command";

vi.mock("cmdk", () => {
  const CommandRoot = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => <input ref={ref} {...props} />,
  );
  const List = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  const Group = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
  );
  const Separator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    (props, ref) => <div ref={ref} {...props} />,
  );
  const Item = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} role="option" {...props}>{children}</div>,
  );
  return {
    Command: Object.assign(CommandRoot, {
      Input,
      List,
      Empty,
      Group,
      Separator,
      Item,
    }),
  };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

describe("Command UI primitives", () => {
  it("다이얼로그 제목과 입력 힌트를 계산한다", () => {
    expect(getCommandDialogTitle()).toBe("커맨드 팔레트");
    expect(getCommandDialogTitle("검색 팔레트")).toBe("검색 팔레트");
    expect(
      getCommandInputAccessibleText({
        placeholder: "명령 검색",
      }),
    ).toEqual({
      title: "명령 검색",
    });
    expect(
      getCommandInputAccessibleText({
        title: "명령어 검색 입력",
        placeholder: "명령 검색",
        ariaLabel: "검색 입력",
      }),
    ).toEqual({
      title: "명령어 검색 입력",
    });
  });

  it("CommandDialog는 기본 제목과 래퍼를 렌더링한다", () => {
    render(
      <CommandDialog open>
        <div>내용</div>
      </CommandDialog>,
    );

    expect(screen.getByText("커맨드 팔레트")).toBeInTheDocument();
    expect(screen.getByText("내용")).toBeInTheDocument();
  });

  it("CommandInput은 포커스 래퍼와 busy 상태 클래스를 포함한다", () => {
    render(
      <Command>
        <CommandInput aria-label="검색 입력" aria-busy="true" disabled />
      </Command>,
    );

    const input = screen.getByRole("textbox", { name: "검색 입력" });
    expect(input).toHaveAttribute("title", "검색 입력");
    expect(input.className).toContain("aria-[busy=true]:cursor-progress");
    expect(input.className).toContain("disabled:cursor-not-allowed");
    expect(input.parentElement?.className ?? "").toContain("focus-within:ring-1");
  });

  it("CommandEmpty와 CommandItem은 가독성/포커스 상태 클래스를 포함한다", () => {
    render(
      <Command>
        <CommandEmpty>결과 없음</CommandEmpty>
        <CommandItem>열기</CommandItem>
      </Command>,
    );

    expect(screen.getByText("결과 없음").className).toContain("leading-5");
    const item = screen.getByRole("option", { name: "열기" });
    expect(item.className).toContain("focus-visible:ring-1");
    expect(item.className).toContain("data-[selected=true]:text-white");
  });
});
