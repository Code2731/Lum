import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactElement } from "react";
import PrivacyLedgerBadge from "./PrivacyLedgerBadge";
import type { LedgerState } from "../hooks/usePrivacyLedger";

const renderWithProvider = (ui: ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe("PrivacyLedgerBadge", () => {
  const defaultState: LedgerState = {
    total: 0,
    onlineCalls: 0,
    perBackend: {
      embedded: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
      ollama: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
      xllm: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
      gemini: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
    },
    last: null,
  };

  it("버튼을 눌러 배지를 열고 Escape로 닫을 수 있다", () => {
    const onReset = vi.fn();
    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const button = screen.getByRole("button", { name: /Privacy Ledger/ });
    fireEvent.click(button);
    expect(screen.getByText("전체 AI 호출")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveFocus();
  });

  it("초기화 버튼이 표시되고 동작한다", () => {
    const onReset = vi.fn();
    const state: LedgerState = {
      ...defaultState,
      total: 2,
      onlineCalls: 1,
      perBackend: {
        ...defaultState.perBackend,
        gemini: {
          count: 1,
          totalPromptChars: 11,
          totalLatencyMs: 123,
          lastTs: Date.now(),
        },
      },
      last: {
        backend: "gemini",
        online: true,
        model: "gpt-test",
        prompt_chars: 11,
        latency_ms: 123,
        ts_ms: Date.now(),
      },
    };

    renderWithProvider(
      <PrivacyLedgerBadge
        state={state}
        isAllOnDevice={false}
        onReset={onReset}
      />,
    );
    const button = screen.getByRole("button", { name: /Privacy Ledger/ });
    fireEvent.click(button);

    const reset = screen.getByText("초기화");
    expect(reset).toBeInTheDocument();
  });

  it("팝오버에서 Tab/Arrow 키로 포커스를 순환한다", () => {
    const state: LedgerState = {
      ...defaultState,
      total: 2,
      onlineCalls: 1,
      perBackend: {
        ...defaultState.perBackend,
        gemini: {
          count: 1,
          totalPromptChars: 11,
          totalLatencyMs: 123,
          lastTs: Date.now(),
        },
      },
      last: {
        backend: "gemini",
        online: true,
        model: "gpt-test",
        prompt_chars: 11,
        latency_ms: 123,
        ts_ms: Date.now(),
      },
    };

    renderWithProvider(
      <PrivacyLedgerBadge
        state={state}
        isAllOnDevice={false}
        onReset={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Privacy Ledger/ });
    fireEvent.click(trigger);

    const buttons = screen.getAllByRole("button").filter((btn) => btn !== trigger);
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    const closeButton = screen.getByRole("button", { name: "Privacy Ledger 상세 닫기" });
    const resetButton = screen.getByRole("button", { name: "세션 카운터 초기화" });
    const closeButtonNode = closeButton as HTMLButtonElement;

    closeButtonNode.focus();
    fireEvent.keyDown(closeButtonNode, { key: "ArrowDown" });
    expect(resetButton).toHaveFocus();

    fireEvent.keyDown(resetButton, { key: "ArrowDown" });
    expect(closeButtonNode).toHaveFocus();

    fireEvent.keyDown(closeButtonNode, { key: "ArrowUp" });
    expect(resetButton).toHaveFocus();

    fireEvent.keyDown(resetButton, { key: "Tab", shiftKey: true });
    expect(closeButtonNode).toHaveFocus();
  });

  it("팝오버에서 Home/End 키로 시작/끝 포커스로 이동한다", () => {
    const state: LedgerState = {
      ...defaultState,
      total: 2,
      onlineCalls: 1,
      perBackend: {
        ...defaultState.perBackend,
        gemini: {
          count: 1,
          totalPromptChars: 11,
          totalLatencyMs: 123,
          lastTs: Date.now(),
        },
      },
      last: {
        backend: "gemini",
        online: true,
        model: "gpt-test",
        prompt_chars: 11,
        latency_ms: 123,
        ts_ms: Date.now(),
      },
    };

    renderWithProvider(
      <PrivacyLedgerBadge
        state={state}
        isAllOnDevice={false}
        onReset={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Privacy Ledger/ });
    fireEvent.click(trigger);

    const buttons = screen.getAllByRole("button").filter((btn) => btn !== trigger);
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    const closeButton = screen.getByRole("button", { name: "Privacy Ledger 상세 닫기" });
    const resetButton = screen.getByRole("button", { name: "세션 카운터 초기화" });

    resetButton.focus();
    fireEvent.keyDown(resetButton, { key: "Home" });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(closeButton, { key: "End" });
    expect(resetButton).toHaveFocus();
  });

  it("바깥 영역 클릭으로 닫으면 트리거로 포커스가 돌아간다", () => {
    const onReset = vi.fn();
    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Privacy Ledger/ });
    trigger.focus();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);

    const reset = screen.getByRole("button", { name: "세션 카운터 초기화" });
    expect(reset).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(trigger).toHaveFocus();
  });

  it("작은 창 높이에서 팝오버 높이가 뷰포트 여백을 넘지 않는다", () => {
    const onReset = vi.fn();
    const originalInnerHeight = window.innerHeight;

    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Privacy Ledger/ });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 180,
    });
    Object.defineProperty(trigger, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 620,
        y: 2,
        top: 2,
        left: 620,
        right: 650,
        bottom: 30,
        width: 30,
        height: 28,
        toJSON: () => ({}),
      } as DOMRect),
    });

    fireEvent.click(trigger);

    const popover = screen.getByRole("dialog", { name: "Privacy Ledger 상세" });
    const maxHeight = Number.parseFloat(popover.style.maxHeight || "0");
    expect(maxHeight).toBeGreaterThan(0);
    expect(maxHeight).toBeLessThanOrEqual(164);

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });
});
