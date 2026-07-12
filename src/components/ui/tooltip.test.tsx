import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { getTooltipAccessibleText, TooltipContent } from "./tooltip";

vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Content: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }>(
    ({ children, sideOffset, ...props }, ref) => (
      <div ref={ref} data-side-offset={sideOffset} {...props}>
        {children}
      </div>
    ),
  ),
}));

describe("TooltipContent", () => {
  it("children/title 기반 title 힌트를 계산한다", () => {
    expect(getTooltipAccessibleText({ children: "도움말" })).toEqual({
      title: "도움말",
    });
    expect(
      getTooltipAccessibleText({
        children: "도움말",
        title: "상세 도움말",
      }),
    ).toEqual({
      title: "상세 도움말",
    });
  });

  it("기본 툴팁 가독성 스타일과 기본 간격을 제공한다", () => {
    render(<TooltipContent>도움말</TooltipContent>);

    const content = screen.getByText("도움말");
    expect(content).toHaveAttribute("data-side-offset", "6");
    expect(content).toHaveAttribute("title", "도움말");
    expect(content.className).toContain("max-w-[240px]");
    expect(content.className).toContain("leading-4");
    expect(content.className).toContain("text-white/88");
    expect(content.className).toContain("[overflow-wrap:anywhere]");
  });

  it("전달한 className과 sideOffset을 유지한다", () => {
    render(
      <TooltipContent sideOffset={10} className="custom-tooltip">
        상세 설명
      </TooltipContent>,
    );

    const content = screen.getByText("상세 설명");
    expect(content).toHaveAttribute("data-side-offset", "10");
    expect(content.className).toContain("custom-tooltip");
  });
});
