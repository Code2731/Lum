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

  it("Cmd/Ctrl+Shift+[ ] 단축키로 비교 블록 탐색", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "npm run build",
            output: "another",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now,
          },
        }}
      />,
    );

    fireEvent.keyDown(window, { key: "]", ctrlKey: true, shiftKey: true });
    expect(screen.getByText(/Retry Compare/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "[", ctrlKey: true, shiftKey: true });
    expect(screen.getByText(/Retry Compare/)).toBeInTheDocument();
  });

  it("Δ 팝오버는 바깥 클릭으로 닫힘", () => {
    render(
      <WarpListView
        blocks={blocks}
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
    expect(screen.getByText(/Retry Compare/)).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/Retry Compare/)).not.toBeInTheDocument();
  });

  it("Δ 팝오버는 Escape로 닫힘", () => {
    render(
      <WarpListView
        blocks={blocks}
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
    expect(screen.getByText(/Retry Compare/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/Retry Compare/)).not.toBeInTheDocument();
  });

  it("Δ Timeline에서 Jump로 해당 비교 팝오버를 연다", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "npm run build",
            output: "another",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 5000,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    expect(screen.getByText("최근 비교 히스토리")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Jump" })[0]);
    expect(screen.getByText("Retry Compare · +1 / -1")).toBeInTheDocument();
  });

  it("Δ Timeline은 Escape로 닫힘", () => {
    render(
      <WarpListView
        blocks={blocks}
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

    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    expect(screen.getByText("최근 비교 히스토리")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("최근 비교 히스토리")).not.toBeInTheDocument();
  });

  it("Δ Timeline에서 Retry+Compare 액션이 콜백을 호출", () => {
    const onRetryWithDiff = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        onRetryWithDiff={onRetryWithDiff}
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

    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry+Compare" }));
    expect(onRetryWithDiff).toHaveBeenCalledTimes(1);
    expect(onRetryWithDiff.mock.calls[0]?.[0]?.id).toBe("b2");
  });

  it("Δ Timeline에서 Run 액션이 실행 콜백을 호출", () => {
    const onExecute = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        onExecute={onExecute}
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

    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onExecute).toHaveBeenCalledWith("npm test\r");
  });

  it("Cmd/Ctrl+Shift+C로 compared 필터 토글", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "npm run build",
            output: "another",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
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

    expect(screen.getByText("표시 2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "c", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("표시 1")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "c", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("표시 2")).toBeInTheDocument();
  });

  it("Cmd/Ctrl+Shift+Y로 Δ Timeline 토글", () => {
    render(
      <WarpListView
        blocks={blocks}
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

    fireEvent.keyDown(window, { key: "y", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("최근 비교 히스토리")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true, shiftKey: true });
    expect(screen.queryByText("최근 비교 히스토리")).not.toBeInTheDocument();
  });

  it("Δ Timeline 검색으로 항목 필터링", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "pnpm lint",
            output: "ok",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "lint fixed",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.change(screen.getByPlaceholderText("타임라인 검색 (command/preview)"), { target: { value: "lint" } });
    expect(screen.getByText("$ pnpm lint")).toBeInTheDocument();
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();
  });

  it("Δ Timeline 리스크 배지 표시", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "rm -rf ./dist",
            output: "done",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
          {
            id: "b4",
            command: "npm install",
            output: "done",
            exitCode: 0,
            startedAt: now - 4000,
            endedAt: now - 3000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 1,
            removed: 0,
            preview: "",
            addedLines: ["a"],
            removedLines: [],
            comparedAt: now - 1000,
          },
          b4: {
            added: 1,
            removed: 0,
            preview: "",
            addedLines: ["a"],
            removedLines: [],
            comparedAt: now - 2000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (3)" }));
    expect(screen.getByText("HIGH")).toBeInTheDocument();
    expect(screen.getByText("MED")).toBeInTheDocument();
    expect(screen.getByText("LOW")).toBeInTheDocument();
  });

  it("Δ Timeline 리스크 필터 High", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "rm -rf ./dist",
            output: "done",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
          {
            id: "b4",
            command: "npm install",
            output: "done",
            exitCode: 0,
            startedAt: now - 4000,
            endedAt: now - 3000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 1,
            removed: 0,
            preview: "",
            addedLines: ["a"],
            removedLines: [],
            comparedAt: now - 1000,
          },
          b4: {
            added: 1,
            removed: 0,
            preview: "",
            addedLines: ["a"],
            removedLines: [],
            comparedAt: now - 2000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "High 1" }));
    expect(screen.getByText("$ rm -rf ./dist")).toBeInTheDocument();
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();
    expect(screen.queryByText("$ npm install")).not.toBeInTheDocument();
  });

  it("Retry+Compare 큐 뱃지 표시", () => {
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={3}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );
    expect(screen.getByText("Queue 3")).toBeInTheDocument();
  });

  it("Retry+Compare 큐 상태/비우기 액션", () => {
    const onClearRetryCompareQueue = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={1}
        retryCompareInFlight
        onClearRetryCompareQueue={onClearRetryCompareQueue}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );
    expect(screen.getByText("실행 중 · wait 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "큐 비우기" }));
    expect(onClearRetryCompareQueue).toHaveBeenCalledTimes(1);
  });

  it("Retry+Compare 큐 상세 목록/개별 제거", () => {
    const onRemoveRetryCompareQueueItem = vi.fn();
    const onPromoteRetryCompareQueueItem = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={3}
        retryCompareQueueWaiting={3}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
          { id: "q3", command: "npm run build" },
        ]}
        onPromoteRetryCompareQueueItem={onPromoteRetryCompareQueueItem}
        onRemoveRetryCompareQueueItem={onRemoveRetryCompareQueueItem}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    expect(screen.getByText("Retry+Compare Queue")).toBeInTheDocument();
    expect(screen.getByText("pnpm lint")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "queue-promote-2" }));
    expect(onPromoteRetryCompareQueueItem).toHaveBeenCalledWith("q2");
    fireEvent.click(screen.getByRole("button", { name: "queue-remove-2" }));
    expect(onRemoveRetryCompareQueueItem).toHaveBeenCalledWith("q2");
  });

  it("Retry+Compare 현재 실행 커맨드 표시", () => {
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={1}
        retryCompareQueueWaiting={0}
        retryCompareInFlight
        retryCompareCurrentCommand="npm test --watch=false"
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );
    expect(screen.getByText("npm test --watch=false")).toBeInTheDocument();
  });

  it("Retry+Compare 완료 카운트 표시", () => {
    render(
      <WarpListView
        blocks={blocks}
        retryCompareCompletedCount={5}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );
    expect(screen.getByText("done 5")).toBeInTheDocument();
  });

  it("Δ Timeline 선택 후 Copy Selected가 선택 항목만 복사", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "pnpm lint",
            output: "ok",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "lint fixed",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "pnpm lint 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Selected" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0]?.[0] ?? "");
    expect(copied).toContain("pnpm lint");
    expect(copied).not.toContain("npm test");
  });

  it("Δ Timeline 선택 Retry+Compare가 선택 항목 전달", () => {
    const onRetrySelectedWithDiff = vi.fn();
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "pnpm lint",
            output: "ok",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        onRetrySelectedWithDiff={onRetrySelectedWithDiff}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "lint fixed",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "pnpm lint 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 Retry+Compare" }));
    expect(onRetrySelectedWithDiff).toHaveBeenCalledTimes(1);
    const payload = onRetrySelectedWithDiff.mock.calls[0]?.[0] ?? [];
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.id).toBe("b3");
  });

  it("Δ Timeline 선택 후 AI 선택요약이 선택 항목만 전달", () => {
    const onExplainAllDiffs = vi.fn();
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "pnpm lint",
            output: "ok",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        onExplainAllDiffs={onExplainAllDiffs}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "lint fixed",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "npm test 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "AI 선택요약" }));
    expect(onExplainAllDiffs).toHaveBeenCalledTimes(1);
    const payload = String(onExplainAllDiffs.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain("npm test");
    expect(payload).not.toContain("pnpm lint");
  });

  it("Δ Timeline 선택 항목 Jump/Prev/Next 탐색", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "pnpm lint",
            output: "ok",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "lint fixed",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "npm test 선택" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "pnpm lint 선택" }));

    fireEvent.click(screen.getByRole("button", { name: "Jump Selected" }));
    expect(screen.getByText("Retry Compare · +1 / -1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next Selected" }));
    expect(screen.getByText("Retry Compare · +2 / -0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prev Selected" }));
    expect(screen.getByText("Retry Compare · +1 / -1")).toBeInTheDocument();
  });

  it("Δ Timeline 선택 항목 단축키 탐색(Alt+Enter/↑/↓)", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "pnpm lint",
            output: "ok",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "lint fixed",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "npm test 선택" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "pnpm lint 선택" }));

    fireEvent.keyDown(window, { key: "Enter", altKey: true });
    expect(screen.getByText("Retry Compare · +1 / -1")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowDown", altKey: true });
    expect(screen.getByText("Retry Compare · +2 / -0")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowUp", altKey: true });
    expect(screen.getByText("Retry Compare · +1 / -1")).toBeInTheDocument();
  });

  it("Δ Timeline에서 선택 항목 핀/핀해제", () => {
    render(
      <WarpListView
        blocks={blocks}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "npm test 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "핀 선택" }));
    expect(screen.getByText("PIN")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "핀 해제" }));
    expect(screen.queryByText("PIN")).not.toBeInTheDocument();
  });

  it("Δ Timeline 핀만 보기 필터", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "pnpm lint",
            output: "ok",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "test changed",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "lint fixed",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "pnpm lint 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "핀 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "핀만" }));
    expect(screen.getByText("$ pnpm lint")).toBeInTheDocument();
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();
  });

  it("Δ Timeline Copy All이 전체 diff를 복사", () => {
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
            preview: "",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy All" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0] ?? "")).toContain("## 1. npm test");
  });

  it("Δ Timeline AI 요약이 상위 콜백 호출", () => {
    const onExplainAllDiffs = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        onExplainAllDiffs={onExplainAllDiffs}
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
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "AI 요약" }));
    expect(onExplainAllDiffs).toHaveBeenCalledTimes(1);
    expect(String(onExplainAllDiffs.mock.calls[0]?.[0] ?? "")).toContain("command: npm test");
  });

  it("Δ Timeline 비교 초기화가 상위 콜백 호출", () => {
    const onClearCompareResults = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        onClearCompareResults={onClearCompareResults}
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
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "비교 초기화" }));
    expect(onClearCompareResults).toHaveBeenCalledTimes(1);
  });

  it("비교 누적 요약 Σ +N/-M 표시", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "npm run build",
            output: "another",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 1,
            preview: "",
            addedLines: ["new line"],
            removedLines: ["old line"],
            comparedAt: now,
          },
          b3: {
            added: 2,
            removed: 0,
            preview: "",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 5000,
          },
        }}
      />,
    );
    expect(screen.getByText("Σ +3/-1")).toBeInTheDocument();
  });
});
