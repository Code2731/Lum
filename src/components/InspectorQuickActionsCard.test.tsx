import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorQuickActionsCard, {
  getInspectorQuickActionsAdvancedFlowSummary,
  getInspectorQuickActionsPrimaryFlowSummary,
  getInspectorQuickActionsRecoverySummary,
} from "./InspectorQuickActionsCard";

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
  it("기본 및 고급 빠른 작업 흐름 요약을 계산한다", () => {
    expect(getInspectorQuickActionsPrimaryFlowSummary(false)).toEqual({
      badges: ["작업공간 복귀", "RAG·보관함 이동", "운영 단계 열기"],
      helper: "복구와 분석이 끝났다면 작업공간 복귀, 코드 맥락 이동, 운영 점검 같은 후속 흐름으로 이어갑니다.",
    });

    expect(getInspectorQuickActionsPrimaryFlowSummary(true)).toEqual({
      badges: ["작업공간 복귀", "RAG·보관함 이동", "운영 단계 닫기"],
      helper: "복구와 분석 이후에 지금은 운영/검토 단계까지 펼쳐진 상태입니다. 필요 없으면 접고 핵심 흐름만 유지할 수 있습니다.",
    });

    expect(getInspectorQuickActionsAdvancedFlowSummary()).toEqual({
      badges: ["변경 검토", "기록 확인", "자동화 연결"],
      helper: "복구가 끝난 뒤 변경과 기록을 확인하고, 반복 작업은 스크립트나 운영 패널로 넘깁니다.",
    });

    expect(getInspectorQuickActionsRecoverySummary()).toEqual({
      badges: ["바로 복구 시작", "실패 분석 연결", "첫 제안 실행"],
      helper: "실패 카드를 열어 원인을 확인하고, 분석 결과의 첫 제안 실행 흐름까지 이어지는 복구 시작점입니다.",
    });
  });

  it("접힌 상태에서는 토글 버튼만 보이고 고급 영역은 렌더링되지 않는다", () => {
    render(<InspectorQuickActionsCard {...createProps()} />);

    expect(screen.getByRole("button", { name: /운영 단계 열기/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("복구 이후 자주 쓰는 작업공간 복귀와 운영 흐름으로 이동합니다.")).toBeInTheDocument();
    expect(screen.getByText("후속 단계")).toBeInTheDocument();
    expect(screen.getByText("작업공간 복귀")).toBeInTheDocument();
    expect(screen.getByText("RAG·보관함 이동")).toBeInTheDocument();
    expect(screen.getAllByText("운영 단계 열기").length).toBeGreaterThan(0);
    expect(screen.getByText("복구와 분석이 끝났다면 작업공간 복귀, 코드 맥락 이동, 운영 점검 같은 후속 흐름으로 이어갑니다.")).toBeInTheDocument();
    expect(screen.getByText("후속")).toBeInTheDocument();
    expect(screen.getByText("변경 검토, 이력 확인, 자동화, 시스템 점검 흐름을 이어서 엽니다.")).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: /운영 단계 닫기/ })).toHaveAttribute("aria-controls", "inspector-quick-actions-advanced");
    expect(toggleRef.current).toBe(screen.getByRole("button", { name: /운영 단계 닫기/ }));
    expect(advancedRef.current).toBe(screen.getByText("기록").closest("[data-inspector-quick-actions-advanced]"));
    expect(screen.getAllByText("운영 단계 닫기").length).toBeGreaterThan(0);
    expect(screen.getByText("복구와 분석 이후에 지금은 운영/검토 단계까지 펼쳐진 상태입니다. 필요 없으면 접고 핵심 흐름만 유지할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("변경 검토").length).toBeGreaterThan(0);
    expect(screen.getByText("기록 확인")).toBeInTheDocument();
    expect(screen.getByText("자동화 연결")).toBeInTheDocument();
    expect(screen.getByText("복구가 끝난 뒤 변경과 기록을 확인하고, 반복 작업은 스크립트나 운영 패널로 넘깁니다.")).toBeInTheDocument();
    expect(screen.getByText("바로 복구 시작")).toBeInTheDocument();
    expect(screen.getByText("실패 분석 연결")).toBeInTheDocument();
    expect(screen.getByText("첫 제안 실행")).toBeInTheDocument();
    expect(screen.getByText("실패 카드를 열어 원인을 확인하고, 분석 결과의 첫 제안 실행 흐름까지 이어지는 복구 시작점입니다.")).toBeInTheDocument();
    expect(screen.getByText("복구 이후")).toBeInTheDocument();
    expect(screen.getByText("다음 검토")).toBeInTheDocument();
    expect(screen.getByText("이력 확인")).toBeInTheDocument();
    expect(screen.getByText("반복 자동화")).toBeInTheDocument();
    expect(screen.getByText("복구가 끝난 뒤 변경과 기록을 확인하고, 마지막에 반복 작업과 시스템 점검으로 넘깁니다.")).toBeInTheDocument();
    expect(screen.getByText("운영/검토 흐름을 접고 핵심 작업으로 돌아갑니다.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /프로젝트 보관함/ }));
    fireEvent.click(screen.getByRole("button", { name: /^작업공간/ }));
    fireEvent.click(screen.getByRole("button", { name: /^RAG/ }));

    expect(onToggleProjectBin).toHaveBeenCalledTimes(1);
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    expect(onTabSelect).toHaveBeenCalledWith("rag");
  });

  it("빠른 액션은 설명과 배지를 함께 노출한다", () => {
    render(<InspectorQuickActionsCard {...createProps({ quickActionsExpanded: true })} />);

    expect(screen.getByText("최근 세션과 복귀 지점을 빠르게 이어갑니다.")).toBeInTheDocument();
    expect(screen.getByText("코드 맥락 검색으로 바로 분석 흐름을 시작합니다.")).toBeInTheDocument();
    expect(screen.getByText("추천")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("복귀")).toBeInTheDocument();
    expect(screen.getAllByText("시작점").length).toBeGreaterThan(0);
    expect(screen.getByText("다음")).toBeInTheDocument();
    expect(screen.getAllByText("복구").length).toBeGreaterThan(0);
    expect(screen.getByText("우선")).toBeInTheDocument();
    expect(screen.getAllByText("시작점").length).toBeGreaterThan(0);
    expect(screen.getByText("반복")).toBeInTheDocument();
    expect(screen.getByText("이력")).toBeInTheDocument();
    expect(screen.getByText("확인")).toBeInTheDocument();
    expect(screen.getByText("점검")).toBeInTheDocument();
    expect(screen.getByText("실패 블록과 복구 단서를 우선으로 확인합니다.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /운영 단계 열기/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: /운영 단계 열기/ }), { key: "ArrowDown" });

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

    fireEvent.click(screen.getByText("기록"));
    fireEvent.click(screen.getByText("변경내역"));
    fireEvent.click(screen.getByText("실패"));
    fireEvent.click(screen.getByText("스크립트"));
    fireEvent.click(screen.getByText("시스템"));
    fireEvent.keyDown(screen.getByText("기록").closest("[data-inspector-quick-actions-advanced]")!, {
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
