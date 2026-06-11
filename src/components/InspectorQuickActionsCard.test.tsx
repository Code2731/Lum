import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorQuickActionsCard from "./InspectorQuickActionsCard";

function createProps(overrides: Partial<React.ComponentProps<typeof InspectorQuickActionsCard>> = {}) {
  return {
    quickActionsExpanded: false,
    inspectorCardRegularClass: "card-regular",
    inspectorQuickGridClass: "grid-layout",
    inspectorQuickActionsToggleRef: { current: null as HTMLButtonElement | null },
    inspectorQuickActionsAdvancedRef: { current: null as HTMLDivElement | null },
    onQuickActionsToggle: vi.fn(),
    onQuickActionsToggleKeyDown: vi.fn(),
    onQuickActionsAdvancedKeyDown: vi.fn(),
    onToggleProjectBin: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenDiffReview: vi.fn(),
    onOpenFailedBlock: vi.fn(),
    onTabSelect: vi.fn(),
    ...overrides,
  };
}

describe("InspectorQuickActionsCard", () => {
  it("접힌 상태에서는 토글 버튼만 보이고 고급 영역은 렌더링되지 않는다", () => {
    render(<InspectorQuickActionsCard {...createProps()} />);

    expect(screen.getByRole("button", { name: "더보기" })).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector("[data-inspector-quick-actions-advanced]")).toBeNull();
  });

  it("펼친 상태에서는 고급 영역과 관련 ref를 노출한다", () => {
    const toggleRef = { current: null as HTMLButtonElement | null };
    const advancedRef = { current: null as HTMLDivElement | null };
    render(
      <InspectorQuickActionsCard
        {...createProps({
          quickActionsExpanded: true,
          inspectorQuickActionsToggleRef: toggleRef,
          inspectorQuickActionsAdvancedRef: advancedRef,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "축소" })).toHaveAttribute("aria-controls", "inspector-quick-actions-advanced");
    expect(toggleRef.current).toBe(screen.getByRole("button", { name: "축소" }));
    expect(advancedRef.current).toBe(screen.getByText("History").closest("[data-inspector-quick-actions-advanced]"));
  });

  it("기본 액션과 탭 이동 액션은 각 콜백을 호출한다", () => {
    const onToggleProjectBin = vi.fn();
    const onOpenWorkspace = vi.fn();
    const onTabSelect = vi.fn();
    render(
      <InspectorQuickActionsCard
        {...createProps({
          onToggleProjectBin,
          onOpenWorkspace,
          onTabSelect,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Project Bin/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Workspace$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^RAG$/ }));

    expect(onToggleProjectBin).toHaveBeenCalledTimes(1);
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("토글 버튼 클릭과 keydown은 각 핸들러를 호출한다", () => {
    const onQuickActionsToggle = vi.fn();
    const onQuickActionsToggleKeyDown = vi.fn();
    render(
      <InspectorQuickActionsCard
        {...createProps({
          onQuickActionsToggle,
          onQuickActionsToggleKeyDown,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "더보기" }), { key: "ArrowDown" });

    expect(onQuickActionsToggle).toHaveBeenCalledTimes(1);
    expect(onQuickActionsToggleKeyDown).toHaveBeenCalledTimes(1);
  });

  it("펼친 상태의 고급 액션 버튼들과 keydown은 각 콜백을 호출한다", () => {
    const onOpenHistory = vi.fn();
    const onOpenDiffReview = vi.fn();
    const onOpenFailedBlock = vi.fn();
    const onTabSelect = vi.fn();
    const onQuickActionsAdvancedKeyDown = vi.fn();
    render(
      <InspectorQuickActionsCard
        {...createProps({
          quickActionsExpanded: true,
          onOpenHistory,
          onOpenDiffReview,
          onOpenFailedBlock,
          onTabSelect,
          onQuickActionsAdvancedKeyDown,
        })}
      />,
    );

    fireEvent.click(screen.getByText("History"));
    fireEvent.click(screen.getByText("Diff"));
    fireEvent.click(screen.getByText("Failed"));
    fireEvent.click(screen.getByText("Scripts"));
    fireEvent.click(screen.getByText("System"));
    fireEvent.keyDown(screen.getByText("History").closest("[data-inspector-quick-actions-advanced]")!, {
      key: "ArrowRight",
    });

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onOpenDiffReview).toHaveBeenCalledTimes(1);
    expect(onOpenFailedBlock).toHaveBeenCalledTimes(1);
    expect(onTabSelect).toHaveBeenNthCalledWith(1, "scripts");
    expect(onTabSelect).toHaveBeenNthCalledWith(2, "sysmon");
    expect(onQuickActionsAdvancedKeyDown).toHaveBeenCalledTimes(1);
  });
});
