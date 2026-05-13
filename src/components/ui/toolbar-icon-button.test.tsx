import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ToolbarIconButton } from "./toolbar-icon-button";

describe("ToolbarIconButton", () => {
  it("shortcut을 aria-keyshortcuts 형식으로 변환해 노출한다", () => {
    render(
      <>
        <ToolbarIconButton label="테스트 버튼" shortcut="⌘B" />
        <ToolbarIconButton label="고급 버튼" shortcut="⌘⇧R" />
        <ToolbarIconButton label="제어 버튼" shortcut="⌃⇧M" />
        <ToolbarIconButton label="옵션 버튼" shortcut="⌥O" />
        <ToolbarIconButton label="텍스트 버튼" shortcut="Cmd+Shift+P" />
        <ToolbarIconButton label="소문자 버튼" shortcut="ctrl+alt+O" />
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
    expect(screen.getByRole("button", { name: "일반 버튼" })).not.toHaveAttribute(
      "aria-keyshortcuts"
    );
  });
});
