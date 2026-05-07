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

describe("WarpListView delta actions", () => {
  const blocks = [
    {
      id: "b2",
      command: "npm test",
      output: "old line\nshared",
      exitCode: 1,
      startedAt: now - 3000,
      endedAt: now - 2000,
    },
  ];

  it("Copy Diff가 비교 텍스트를 클립보드에 복사", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(
      <WarpListView
        blocks={blocks}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "+ new line | - old line",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByText("Δ +1/-1"));
    fireEvent.click(screen.getByRole("button", { name: "Copy Diff" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0]?.[0] ?? "");
    expect(copied).toContain("command: npm test");
    expect(copied).toContain("+ new line");
    expect(copied).toContain("- old line");
  });

  it("AI 해석이 diff payload를 상위 콜백으로 전달", () => {
    const onExplainDiff = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        onExplainDiff={onExplainDiff}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByText("Δ +1/-1"));
    fireEvent.click(screen.getByRole("button", { name: "AI 해석" }));

    expect(onExplainDiff).toHaveBeenCalledTimes(1);
    expect(String(onExplainDiff.mock.calls[0]?.[0] ?? "")).toContain("command: npm test");
  });
});
