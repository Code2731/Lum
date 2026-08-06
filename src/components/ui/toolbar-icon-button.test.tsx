import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  getToolbarIconButtonAccessibleMeta,
  ToolbarIconButton,
} from "./toolbar-icon-button";

describe("ToolbarIconButton", () => {
  it("라벨, 배지, 단축키 기반 접근성 메타를 계산한다", () => {
    expect(
      getToolbarIconButtonAccessibleMeta({
        label: "사이드바 열기",
        shortcut: "⌘1",
      }),
    ).toEqual({
      ariaLabel: "사이드바 열기",
      title: "사이드바 열기",
      ariaKeyshortcuts: "Meta+1",
    });

    expect(
      getToolbarIconButtonAccessibleMeta({
        label: "알림 열기",
        badge: true,
        badgeLabel: "새 항목",
        title: "알림 패널",
      }),
    ).toEqual({
      ariaLabel: "알림 열기 (새 항목)",
      title: "알림 패널",
      ariaKeyshortcuts: undefined,
    });
  });

  it("title, 설명, 기본 비활성 스타일을 함께 노출한다", () => {
    render(
      <ToolbarIconButton
        label="사이드바 열기"
        description="현재 탭과 연결된 패널을 빠르게 엽니다."
        shortcut="⌘1"
        disabled
      />
    );

    const button = screen.getByRole("button", { name: "사이드바 열기" });
    expect(button).toHaveAttribute("title", "사이드바 열기");
    expect(button.className).toContain("disabled:pointer-events-none");
    expect(button.className).toContain("disabled:opacity-40");
  });

  it("shortcut을 aria-keyshortcuts 형식으로 변환해 노출한다", () => {
    render(
      <>
        <ToolbarIconButton label="테스트 버튼" shortcut="⌘B" />
        <ToolbarIconButton label="고급 버튼" shortcut="⌘⇧R" />
        <ToolbarIconButton label="제어 버튼" shortcut="⌃⇧M" />
        <ToolbarIconButton label="옵션 버튼" shortcut="⌥O" />
        <ToolbarIconButton label="텍스트 버튼" shortcut="Cmd+Shift+P" />
        <ToolbarIconButton label="소문자 버튼" shortcut="ctrl+alt+O" />
        <ToolbarIconButton label="문자키 버튼" shortcut="cmd+enter" />
        <ToolbarIconButton label="특수키 버튼" shortcut="Ctrl+Esc" />
        <ToolbarIconButton label="화살표 버튼" shortcut="Alt+up" />
        <ToolbarIconButton label="함수키 버튼" shortcut="Cmd+f5" />
        <ToolbarIconButton label="함수키 버튼 2" shortcut="Alt+F12" />
        <ToolbarIconButton label="일반 버튼" />
      </>
    );

    expect(screen.getByRole("button", { name: "테스트 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+B"
    );
    expect(screen.getByRole("button", { name: "고급 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+Shift+R"
    );
    expect(screen.getByRole("button", { name: "제어 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+Shift+M"
    );
    expect(screen.getByRole("button", { name: "옵션 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+O"
    );
    expect(screen.getByRole("button", { name: "텍스트 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+Shift+P"
    );
    expect(screen.getByRole("button", { name: "소문자 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+Alt+O"
    );
    expect(screen.getByRole("button", { name: "문자키 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+Enter"
    );
    expect(screen.getByRole("button", { name: "특수키 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+Escape"
    );
    expect(screen.getByRole("button", { name: "화살표 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+ArrowUp"
    );
    expect(screen.getByRole("button", { name: "함수키 버튼" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+F5"
    );
    expect(screen.getByRole("button", { name: "함수키 버튼 2" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+F12"
    );
    expect(screen.getByRole("button", { name: "일반 버튼" })).not.toHaveAttribute(
      "aria-keyshortcuts"
    );
  });
});
