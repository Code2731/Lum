import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WarpListView from "./WarpListView";

const now = Date.now();

describe("WarpListView block search navigation", () => {
  const blocks = [
    {
      id: "b1",
      command: "echo foo",
      output: "foo bar foo baz",
      exitCode: 0,
      startedAt: now - 1000,
      endedAt: now,
    },
  ];

  it("Enter/Shift+Enter로 매치 커서 이동", () => {
    const { container } = render(<WarpListView blocks={blocks} onExecute={vi.fn()} />);
    const header = container.querySelector(".cursor-pointer");
    expect(header).toBeTruthy();
    fireEvent.click(header!);
    const input = screen.getByPlaceholderText("블록 내 검색");
    fireEvent.change(input, { target: { value: "foo" } });
    expect(screen.getByText("1/2")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("2/2")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("F3/Shift+F3로 매치 커서 이동", () => {
    const { container } = render(<WarpListView blocks={blocks} onExecute={vi.fn()} />);
    const header = container.querySelector(".cursor-pointer");
    expect(header).toBeTruthy();
    fireEvent.click(header!);
    const input = screen.getByPlaceholderText("블록 내 검색");
    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.focus(input);
    expect(screen.getByText("1/2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "F3" });
    expect(screen.getByText("2/2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "F3", shiftKey: true });
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });
});
