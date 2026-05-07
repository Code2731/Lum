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

  it("Δ Timeline 검색창 ESC로 검색어 초기화", () => {
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
    const input = screen.getByPlaceholderText("타임라인 검색 (command/preview)");
    fireEvent.change(input, { target: { value: "lint" } });
    expect(screen.getByText("$ pnpm lint")).toBeInTheDocument();
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
  });

  it("Δ Timeline 검색창 포커스 단축키(Alt+F)", () => {
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
    const input = screen.getByPlaceholderText("타임라인 검색 (command/preview)");
    fireEvent.keyDown(window, { key: "f", altKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("Δ Timeline 검색창 포커스 단축키(Ctrl+F)", () => {
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
    const input = screen.getByPlaceholderText("타임라인 검색 (command/preview)");
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("Δ Timeline 필터 리셋 버튼", () => {
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
            preview: "dangerous remove",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    const search = screen.getByPlaceholderText("타임라인 검색 (command/preview)");
    fireEvent.change(search, { target: { value: "rm -rf" } });
    fireEvent.click(screen.getByRole("button", { name: "High 1" }));
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "필터 리셋" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
  });

  it("Δ Timeline 필터 리셋 단축키(Alt+R)", () => {
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
            preview: "dangerous remove",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    const search = screen.getByPlaceholderText("타임라인 검색 (command/preview)");
    fireEvent.change(search, { target: { value: "rm -rf" } });
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "r", altKey: true });
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
  });

  it("Δ Timeline 상태 요약 배지 표시 및 개별 해제", () => {
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
            preview: "dangerous remove",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    const search = screen.getByPlaceholderText("타임라인 검색 (command/preview)");
    fireEvent.change(search, { target: { value: "rm -rf" } });
    fireEvent.click(screen.getByRole("button", { name: "High 1" }));
    fireEvent.click(screen.getByRole("button", { name: "정렬: 최근순" }));

    expect(screen.getByRole("button", { name: "상태 검색: rm -rf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상태 Risk: High" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상태 정렬: 변화량순" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "상태 Risk: High" }));
    expect(screen.queryByRole("button", { name: "상태 Risk: High" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "상태 검색: rm -rf" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByText("$ npm test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "상태 정렬: 변화량순" }));
    expect(screen.getByRole("button", { name: "정렬: 최근순" })).toBeInTheDocument();
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

  it("Δ Timeline 리스크 필터 단축키(Alt+1/2/3/0)", () => {
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

    fireEvent.keyDown(window, { key: "1", altKey: true });
    expect(screen.getByText("$ rm -rf ./dist")).toBeInTheDocument();
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();
    expect(screen.queryByText("$ npm install")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "2", altKey: true });
    expect(screen.getByText("$ npm install")).toBeInTheDocument();
    expect(screen.queryByText("$ rm -rf ./dist")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "3", altKey: true });
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
    expect(screen.queryByText("$ rm -rf ./dist")).not.toBeInTheDocument();
    expect(screen.queryByText("$ npm install")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "0", altKey: true });
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
    expect(screen.getByText("$ rm -rf ./dist")).toBeInTheDocument();
    expect(screen.getByText("$ npm install")).toBeInTheDocument();
  });

  it("Δ Timeline 정렬 토글(최근순/변화량순) + Alt+S", () => {
    render(
      <WarpListView
        blocks={[
          ...blocks,
          {
            id: "b3",
            command: "npm install",
            output: "done",
            exitCode: 0,
            startedAt: now - 2000,
            endedAt: now - 1000,
          },
          {
            id: "b4",
            command: "pnpm lint",
            output: "done",
            exitCode: 0,
            startedAt: now - 4000,
            endedAt: now - 3000,
          },
        ]}
        compareResultByBlock={{
          b2: {
            added: 1,
            removed: 0,
            preview: "",
            addedLines: ["a"],
            removedLines: [],
            comparedAt: now,
          },
          b3: {
            added: 4,
            removed: 3,
            preview: "",
            addedLines: ["a"],
            removedLines: ["b"],
            comparedAt: now - 2000,
          },
          b4: {
            added: 2,
            removed: 0,
            preview: "",
            addedLines: ["a"],
            removedLines: [],
            comparedAt: now - 1000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (3)" }));
    const recentOrder = screen.getAllByRole("checkbox").map((el) => el.getAttribute("aria-label"));
    expect(recentOrder).toEqual(["npm test 선택", "pnpm lint 선택", "npm install 선택"]);

    fireEvent.click(screen.getByRole("button", { name: "정렬: 최근순" }));
    const deltaOrder = screen.getAllByRole("checkbox").map((el) => el.getAttribute("aria-label"));
    expect(deltaOrder).toEqual(["npm install 선택", "pnpm lint 선택", "npm test 선택"]);
    expect(screen.getByRole("button", { name: "정렬: 변화량순" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "s", altKey: true });
    expect(screen.getByRole("button", { name: "정렬: 최근순" })).toBeInTheDocument();
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

  it("Retry+Compare 큐 변경 되돌리기 버튼", () => {
    const onUndoRetryCompareQueueChange = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        canUndoRetryCompareQueueChange
        onUndoRetryCompareQueueChange={onUndoRetryCompareQueueChange}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "큐 변경 되돌리기" }));
    expect(onUndoRetryCompareQueueChange).toHaveBeenCalledTimes(1);
  });

  it("Retry+Compare 큐 변경 되돌리기 단축키(Alt+Z)", () => {
    const onUndoRetryCompareQueueChange = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        canUndoRetryCompareQueueChange
        onUndoRetryCompareQueueChange={onUndoRetryCompareQueueChange}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.keyDown(window, { key: "z", altKey: true });
    expect(onUndoRetryCompareQueueChange).toHaveBeenCalledTimes(1);
  });

  it("Retry+Compare 큐 변경 되돌리기 단축키(Ctrl+Z)", () => {
    const onUndoRetryCompareQueueChange = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        canUndoRetryCompareQueueChange
        onUndoRetryCompareQueueChange={onUndoRetryCompareQueueChange}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(onUndoRetryCompareQueueChange).toHaveBeenCalledTimes(1);
  });

  it("Retry+Compare 큐 변경 다시실행 버튼", () => {
    const onRedoRetryCompareQueueChange = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        canRedoRetryCompareQueueChange
        onRedoRetryCompareQueueChange={onRedoRetryCompareQueueChange}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "큐 변경 다시실행" }));
    expect(onRedoRetryCompareQueueChange).toHaveBeenCalledTimes(1);
  });

  it("Retry+Compare 큐 변경 다시실행 단축키(Alt+Shift+Z)", () => {
    const onUndoRetryCompareQueueChange = vi.fn();
    const onRedoRetryCompareQueueChange = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        canUndoRetryCompareQueueChange
        canRedoRetryCompareQueueChange
        onUndoRetryCompareQueueChange={onUndoRetryCompareQueueChange}
        onRedoRetryCompareQueueChange={onRedoRetryCompareQueueChange}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.keyDown(window, { key: "Z", altKey: true, shiftKey: true });
    expect(onRedoRetryCompareQueueChange).toHaveBeenCalledTimes(1);
    expect(onUndoRetryCompareQueueChange).toHaveBeenCalledTimes(0);
  });

  it("Retry+Compare 큐 변경 다시실행 단축키(Ctrl+Shift+Z)", () => {
    const onUndoRetryCompareQueueChange = vi.fn();
    const onRedoRetryCompareQueueChange = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        canUndoRetryCompareQueueChange
        canRedoRetryCompareQueueChange
        onUndoRetryCompareQueueChange={onUndoRetryCompareQueueChange}
        onRedoRetryCompareQueueChange={onRedoRetryCompareQueueChange}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(onRedoRetryCompareQueueChange).toHaveBeenCalledTimes(1);
    expect(onUndoRetryCompareQueueChange).toHaveBeenCalledTimes(0);
  });

  it("Retry+Compare 큐 일시정지/재개 토글", () => {
    const onToggleRetryCompareQueuePaused = vi.fn();
    const view = render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        retryCompareQueuePaused={false}
        onToggleRetryCompareQueuePaused={onToggleRetryCompareQueuePaused}
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
    fireEvent.click(screen.getByRole("button", { name: "큐 일시정지" }));
    expect(onToggleRetryCompareQueuePaused).toHaveBeenCalledTimes(1);

    view.unmount();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        retryCompareQueuePaused
        onToggleRetryCompareQueuePaused={onToggleRetryCompareQueuePaused}
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
    expect(screen.getByRole("button", { name: "큐 재개" })).toBeInTheDocument();
  });

  it("Δ Timeline 단축키 도움말 토글", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    expect(screen.getByText("타임라인 열기/닫기")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    expect(screen.queryByText("타임라인 열기/닫기")).not.toBeInTheDocument();
  });

  it("Δ Timeline 단축키 도움말 토글 단축키(Alt+/)", () => {
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
    fireEvent.keyDown(window, { key: "/", altKey: true });
    expect(screen.getByText("타임라인 열기/닫기")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "/", altKey: true });
    expect(screen.queryByText("타임라인 열기/닫기")).not.toBeInTheDocument();
  });

  it("Retry+Compare 큐 일시정지 단축키(Alt+P)", () => {
    const onToggleRetryCompareQueuePaused = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        onToggleRetryCompareQueuePaused={onToggleRetryCompareQueuePaused}
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
    fireEvent.keyDown(window, { key: "p", altKey: true });
    expect(onToggleRetryCompareQueuePaused).toHaveBeenCalledTimes(1);
  });

  it("Retry+Compare 큐 상세 목록/개별 제거", () => {
    const onRemoveRetryCompareQueueItem = vi.fn();
    const onPromoteRetryCompareQueueItem = vi.fn();
    const onDemoteRetryCompareQueueItem = vi.fn();
    const onMoveUpRetryCompareQueueItem = vi.fn();
    const onMoveDownRetryCompareQueueItem = vi.fn();
    const onPrioritizeRetryCompareQueueItem = vi.fn();
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
        onDemoteRetryCompareQueueItem={onDemoteRetryCompareQueueItem}
        onMoveUpRetryCompareQueueItem={onMoveUpRetryCompareQueueItem}
        onMoveDownRetryCompareQueueItem={onMoveDownRetryCompareQueueItem}
        onPrioritizeRetryCompareQueueItem={onPrioritizeRetryCompareQueueItem}
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
    fireEvent.click(screen.getByRole("button", { name: "queue-next-2" }));
    expect(onPrioritizeRetryCompareQueueItem).toHaveBeenCalledWith("q2");
    fireEvent.click(screen.getByRole("button", { name: "queue-up-2" }));
    expect(onMoveUpRetryCompareQueueItem).toHaveBeenCalledWith("q2");
    fireEvent.click(screen.getByRole("button", { name: "queue-down-2" }));
    expect(onMoveDownRetryCompareQueueItem).toHaveBeenCalledWith("q2");
    fireEvent.click(screen.getByRole("button", { name: "queue-demote-2" }));
    expect(onDemoteRetryCompareQueueItem).toHaveBeenCalledWith("q2");
    fireEvent.click(screen.getByRole("button", { name: "queue-remove-2" }));
    expect(onRemoveRetryCompareQueueItem).toHaveBeenCalledWith("q2");
  });

  it("Retry+Compare 큐 검색/지우기", () => {
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
    fireEvent.change(screen.getByPlaceholderText("큐 검색 (command)"), { target: { value: "lint" } });
    expect(screen.getByText("pnpm lint")).toBeInTheDocument();
    expect(screen.queryByText("npm run build")).not.toBeInTheDocument();
    expect(screen.getByText("표시 1/3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(screen.getByText("표시 3/3")).toBeInTheDocument();
  });

  it("Retry+Compare 큐 검색 결과 필터 제거", () => {
    const onRemoveFilteredRetryCompareQueueItems = vi.fn();
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
        onRemoveFilteredRetryCompareQueueItems={onRemoveFilteredRetryCompareQueueItems}
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
    fireEvent.change(screen.getByPlaceholderText("큐 검색 (command)"), { target: { value: "run build" } });
    fireEvent.click(screen.getByRole("button", { name: "필터 제거" }));
    expect(onRemoveFilteredRetryCompareQueueItems).toHaveBeenCalledTimes(1);
    expect(onRemoveFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q3"]);
  });

  it("Retry+Compare 큐 검색 결과 필터 맨앞/맨뒤", () => {
    const onPromoteFilteredRetryCompareQueueItems = vi.fn();
    const onDemoteFilteredRetryCompareQueueItems = vi.fn();
    const onPrioritizeFilteredRetryCompareQueueItems = vi.fn();
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
        onPrioritizeFilteredRetryCompareQueueItems={onPrioritizeFilteredRetryCompareQueueItems}
        onPromoteFilteredRetryCompareQueueItems={onPromoteFilteredRetryCompareQueueItems}
        onDemoteFilteredRetryCompareQueueItems={onDemoteFilteredRetryCompareQueueItems}
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
    fireEvent.change(screen.getByPlaceholderText("큐 검색 (command)"), { target: { value: "npm" } });
    fireEvent.click(screen.getByRole("button", { name: "필터 다음실행" }));
    expect(onPrioritizeFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q1", "q2", "q3"]);
    fireEvent.click(screen.getByRole("button", { name: "필터 맨앞" }));
    expect(onPromoteFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q1", "q2", "q3"]);
    fireEvent.click(screen.getByRole("button", { name: "필터 맨뒤" }));
    expect(onDemoteFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q1", "q2", "q3"]);
  });

  it("Retry+Compare 큐 필터 액션 단축키", () => {
    const onPrioritizeFilteredRetryCompareQueueItems = vi.fn();
    const onPromoteFilteredRetryCompareQueueItems = vi.fn();
    const onDemoteFilteredRetryCompareQueueItems = vi.fn();
    const onRemoveFilteredRetryCompareQueueItems = vi.fn();
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
        onPrioritizeFilteredRetryCompareQueueItems={onPrioritizeFilteredRetryCompareQueueItems}
        onPromoteFilteredRetryCompareQueueItems={onPromoteFilteredRetryCompareQueueItems}
        onDemoteFilteredRetryCompareQueueItems={onDemoteFilteredRetryCompareQueueItems}
        onRemoveFilteredRetryCompareQueueItems={onRemoveFilteredRetryCompareQueueItems}
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
    fireEvent.change(screen.getByPlaceholderText("큐 검색 (command)"), { target: { value: "run build" } });
    expect(screen.getByText("표시 1/3")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Enter", altKey: true, shiftKey: true });
    expect(onPrioritizeFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q3"]);

    fireEvent.keyDown(window, { key: "ArrowUp", altKey: true, shiftKey: true });
    expect(onPromoteFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q3"]);

    fireEvent.keyDown(window, { key: "ArrowDown", altKey: true, shiftKey: true });
    expect(onDemoteFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q3"]);

    fireEvent.keyDown(window, { key: "Delete", altKey: true });
    expect(onRemoveFilteredRetryCompareQueueItems).toHaveBeenCalledWith(["q3"]);
  });

  it("Retry+Compare 큐 검색 포커스 단축키(Alt+Q)", () => {
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    const input = screen.getByPlaceholderText("큐 검색 (command)");
    fireEvent.keyDown(window, { key: "q", altKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("Retry+Compare 큐 검색창 ESC로 검색어 초기화", () => {
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    const input = screen.getByPlaceholderText("큐 검색 (command)");
    fireEvent.change(input, { target: { value: "lint" } });
    expect(screen.getByText("표시 1/2")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText("표시 2/2")).toBeInTheDocument();
  });

  it("Retry+Compare 큐 패널 접기/펼치기 버튼", () => {
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    expect(screen.getByPlaceholderText("큐 검색 (command)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(screen.queryByPlaceholderText("큐 검색 (command)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "펼치기" }));
    expect(screen.getByPlaceholderText("큐 검색 (command)")).toBeInTheDocument();
  });

  it("Retry+Compare 큐 패널 토글 단축키(Alt+K)", () => {
    render(
      <WarpListView
        blocks={blocks}
        retryCompareQueueDepth={2}
        retryCompareQueueWaiting={2}
        retryCompareQueueItems={[
          { id: "q1", command: "npm test" },
          { id: "q2", command: "pnpm lint" },
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (1)" }));
    expect(screen.getByPlaceholderText("큐 검색 (command)")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", altKey: true });
    expect(screen.queryByPlaceholderText("큐 검색 (command)")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", altKey: true });
    expect(screen.getByPlaceholderText("큐 검색 (command)")).toBeInTheDocument();
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

  it("Retry+Compare 완료 카운트 리셋 액션", () => {
    const onResetRetryCompareCompletedCount = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareCompletedCount={5}
        onResetRetryCompareCompletedCount={onResetRetryCompareCompletedCount}
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
    fireEvent.click(screen.getByRole("button", { name: "done 5" }));
    expect(onResetRetryCompareCompletedCount).toHaveBeenCalledTimes(1);
  });

  it("Retry+Compare 완료 카운트 리셋 단축키(Alt+D)", () => {
    const onResetRetryCompareCompletedCount = vi.fn();
    render(
      <WarpListView
        blocks={blocks}
        retryCompareCompletedCount={5}
        onResetRetryCompareCompletedCount={onResetRetryCompareCompletedCount}
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
    fireEvent.keyDown(window, { key: "d", altKey: true });
    expect(onResetRetryCompareCompletedCount).toHaveBeenCalledTimes(1);
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

  it("Δ Timeline 선택 항목 복사 단축키(Alt+C)", () => {
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
    fireEvent.keyDown(window, { key: "c", altKey: true });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0]?.[0] ?? "");
    expect(copied).toContain("pnpm lint");
    expect(copied).not.toContain("npm test");
  });

  it("Δ Timeline 전체 복사 단축키(Alt+Shift+C)", () => {
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
    fireEvent.keyDown(window, { key: "C", altKey: true, shiftKey: true });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0]?.[0] ?? "");
    expect(copied).toContain("pnpm lint");
    expect(copied).toContain("npm test");
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

  it("Δ Timeline 선택 반전 버튼", () => {
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
    expect(screen.getByText("선택 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "선택 반전" }));
    expect(screen.getByText("선택 1")).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "pnpm lint 선택" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Δ Timeline 선택 반전 단축키(Alt+I)", () => {
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
    fireEvent.keyDown(window, { key: "i", altKey: true });
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "pnpm lint 선택" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Δ Timeline 선택 전체 단축키(Alt+A)", () => {
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
    fireEvent.keyDown(window, { key: "a", altKey: true });
    expect(screen.getByText("선택 2")).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "pnpm lint 선택" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Δ Timeline 선택 전체 단축키(Ctrl+A)", () => {
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
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getByText("선택 2")).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "pnpm lint 선택" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Δ Timeline 선택 해제 단축키(Alt+Shift+A)", () => {
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
    fireEvent.keyDown(window, { key: "a", altKey: true });
    expect(screen.getByText("선택 2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "A", altKey: true, shiftKey: true });
    expect(screen.getByText("선택 0")).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "pnpm lint 선택" }) as HTMLInputElement).checked).toBe(false);
  });

  it("Δ Timeline 선택 해제 단축키(Ctrl+Shift+A)", () => {
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
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getByText("선택 2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "A", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("선택 0")).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "pnpm lint 선택" }) as HTMLInputElement).checked).toBe(false);
  });

  it("Δ Timeline 고위험 선택 버튼", () => {
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
            preview: "dangerous remove",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "고위험 선택" }));
    expect(screen.getByText("선택 1")).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: "rm -rf ./dist 선택" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(false);
  });

  it("Δ Timeline 고위험 선택 단축키(Alt+H)", () => {
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
            preview: "dangerous remove",
            addedLines: ["a", "b"],
            removedLines: [],
            comparedAt: now - 3000,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Δ Timeline (2)" }));
    fireEvent.keyDown(window, { key: "h", altKey: true });
    expect(screen.getByText("선택 1")).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: "rm -rf ./dist 선택" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "npm test 선택" }) as HTMLInputElement).checked).toBe(false);
  });

  it("Δ Timeline 선택만 보기 버튼", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "선택만" }));
    expect(screen.getByText("$ pnpm lint")).toBeInTheDocument();
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "선택만" }));
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
  });

  it("Δ Timeline 선택만 보기 단축키(Alt+O)", () => {
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
    expect(screen.getByText("선택 1")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "o", code: "KeyO", altKey: true });
    expect(screen.getByText("$ pnpm lint")).toBeInTheDocument();
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();
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

  it("Δ Timeline 핀 전체 해제 버튼", () => {
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
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "핀 전체 해제" }));
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
    expect(screen.queryAllByText("PIN")).toHaveLength(0);
  });

  it("Δ Timeline 핀 전체 해제 단축키(Alt+Shift+U)", () => {
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
    expect(screen.queryByText("$ npm test")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "u", altKey: true, shiftKey: true });
    expect(screen.getByText("$ npm test")).toBeInTheDocument();
    expect(screen.queryAllByText("PIN")).toHaveLength(0);
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
