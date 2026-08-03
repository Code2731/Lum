import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, getButtonAccessibleText } from "./button";

describe("Button", () => {
  it("children/title 기반 title 힌트를 계산한다", () => {
    expect(getButtonAccessibleText({ children: "실행" })).toEqual({
      title: "실행",
    });
    expect(
      getButtonAccessibleText({
        children: "실행",
        title: "작업 실행",
      }),
    ).toEqual({
      title: "작업 실행",
    });
  });

  it("기본 포커스와 비활성 상태 클래스를 포함한다", () => {
    render(<Button disabled>실행</Button>);

    const button = screen.getByRole("button", { name: "실행" });
    expect(button.className).toContain("focus-visible:ring-1");
    expect(button.className).toContain("disabled:cursor-not-allowed");
    expect(button.className).toContain("disabled:opacity-50");
    expect(button).toHaveAttribute("title", "실행");
  });

  it("busy와 loading 상태 피드백 클래스를 제공한다", () => {
    render(
      <>
        <Button aria-busy="true">생성 중</Button>
        <Button data-loading="true">불러오는 중</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "생성 중" }).className).toContain("aria-[busy=true]:cursor-progress");
    expect(screen.getByRole("button", { name: "생성 중" }).className).toContain("aria-[busy=true]:opacity-70");
    expect(screen.getByRole("button", { name: "불러오는 중" }).className).toContain("data-[loading=true]:cursor-progress");
    expect(screen.getByRole("button", { name: "불러오는 중" }).className).toContain("data-[loading=true]:opacity-70");
  });
});
