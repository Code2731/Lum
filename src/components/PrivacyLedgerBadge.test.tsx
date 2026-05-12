import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import PrivacyLedgerBadge from "./PrivacyLedgerBadge";
import type { LedgerState } from "../hooks/usePrivacyLedger";

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
    const { getByRole, queryByText } = render(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const button = getByRole("button", { name: /Privacy Ledger/ });
    fireEvent.click(button);
    expect(queryByText("전체 AI 호출")).toBeInTheDocument();

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

    const { getByRole, queryByText } = render(
      <PrivacyLedgerBadge
        state={state}
        isAllOnDevice={false}
        onReset={onReset}
      />,
    );
    const button = getByRole("button", { name: /Privacy Ledger/ });
    fireEvent.click(button);

    const reset = queryByText("초기화");
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

    const { getByRole, queryAllByRole } = render(
      <PrivacyLedgerBadge
        state={state}
        isAllOnDevice={false}
        onReset={vi.fn()}
      />,
    );

    const trigger = getByRole("button", { name: /Privacy Ledger/ });
    fireEvent.click(trigger);

    const buttons = queryAllByRole("button").filter((btn) => btn !== trigger);
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    const closeButton = getByRole("button", { name: "Privacy Ledger 상세 닫기" });
    const resetButton = getByRole("button", { name: "세션 카운터 초기화" });
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

  it("바깥 영역 클릭으로 닫으면 트리거로 포커스가 돌아간다", () => {
    const onReset = vi.fn();
    const { getByRole } = render(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const trigger = getByRole("button", { name: /Privacy Ledger/ });
    trigger.focus();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);

    const reset = getByRole("button", { name: "세션 카운터 초기화" });
    expect(reset).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(trigger).toHaveFocus();
  });
});
