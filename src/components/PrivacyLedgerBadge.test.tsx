import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactElement } from "react";
import { isPointerOutsideTargets } from "../utils/pointerGuard";
import PrivacyLedgerBadge, {
  getPrivacyLedgerSummaryBadges,
  getPrivacyLedgerToneMeta,
} from "./PrivacyLedgerBadge";
import type { LedgerState } from "../hooks/usePrivacyLedger";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

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

  it("톤 메타와 요약 배지를 상태에 따라 계산한다", () => {
    expect(getPrivacyLedgerToneMeta(defaultState, true)).toEqual({
      tone: "neutral",
      label: "호출 대기",
      tooltip: "이번 세션에 AI 호출이 아직 없습니다 — 호출이 시작되면 로컬/클라우드 흐름을 추적합니다",
    });

    expect(getPrivacyLedgerSummaryBadges(defaultState, true)).toEqual([
      {
        label: "호출 대기",
        className: "border-white/12 bg-white/[0.05] text-white/58",
      },
      {
        label: "로컬 우선",
        className: "border-emerald-300/24 bg-emerald-400/10 text-emerald-100",
      },
    ]);
  });

  it("팝오버 외부 클릭 판정은 ref가 null이어도 안전하게 동작한다", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    expect(isPointerOutsideTargets(target, [null, null])).toBe(true);
    expect(isPointerOutsideTargets(null, [null, null])).toBe(false);
  });

  it("팝오버 외부 클릭 판정은 트리거/팝오버 내부 클릭을 제외한다", () => {
    const trigger = document.createElement("button");
    const popover = document.createElement("div");
    const triggerChild = document.createElement("span");
    const popoverChild = document.createElement("button");
    const outside = document.createElement("div");
    trigger.appendChild(triggerChild);
    popover.appendChild(popoverChild);
    document.body.appendChild(trigger);
    document.body.appendChild(popover);
    document.body.appendChild(outside);

    expect(isPointerOutsideTargets(triggerChild, [trigger, popover])).toBe(false);
    expect(isPointerOutsideTargets(popoverChild, [trigger, popover])).toBe(false);
    expect(isPointerOutsideTargets(outside, [trigger, popover])).toBe(true);
  });

  it("버튼을 눌러 배지를 열고 Escape로 닫을 수 있다", () => {
    const onReset = vi.fn();
    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const button = screen.getByRole("button", { name: /개인정보 원장/ });
    fireEvent.click(button);
    expect(screen.getByText("전체 AI 호출")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveFocus();
  });

  it("트리거 버튼은 온디바이스 상태와 호출 수를 함께 보여준다", () => {
    const state: LedgerState = {
      ...defaultState,
      total: 2,
      onlineCalls: 0,
      perBackend: {
        ...defaultState.perBackend,
        embedded: {
          count: 2,
          totalPromptChars: 80,
          totalLatencyMs: 320,
          lastTs: Date.now(),
        },
      },
      last: {
        backend: "embedded",
        online: false,
        model: "local-test",
        prompt_chars: 40,
        latency_ms: 160,
        ts_ms: Date.now(),
      },
    };

    renderWithProvider(
      <PrivacyLedgerBadge
        state={state}
        isAllOnDevice
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "개인정보 원장 — 온디바이스 100%" })).toBeInTheDocument();
    expect(screen.getByText("온디바이스")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("호출이 없으면 호출 대기 상태를 보여준다", () => {
    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "개인정보 원장 — 호출 대기" })).toBeInTheDocument();
    expect(screen.getByText("대기")).toBeInTheDocument();
  });

  it("클라우드 호출이 섞이면 트리거에서 클라우드 건수를 바로 보여준다", () => {
    const state: LedgerState = {
      ...defaultState,
      total: 3,
      onlineCalls: 1,
      perBackend: {
        ...defaultState.perBackend,
        embedded: {
          count: 2,
          totalPromptChars: 120,
          totalLatencyMs: 360,
          lastTs: Date.now(),
        },
        gemini: {
          count: 1,
          totalPromptChars: 40,
          totalLatencyMs: 220,
          lastTs: Date.now(),
        },
      },
      last: {
        backend: "gemini",
        online: true,
        model: "cloud-test",
        prompt_chars: 40,
        latency_ms: 220,
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

    expect(screen.getByRole("button", { name: "개인정보 원장 — 클라우드 33%" })).toBeInTheDocument();
    expect(screen.getByText("혼합")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
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
    const button = screen.getByRole("button", { name: /개인정보 원장/ });
    fireEvent.click(button);

    const reset = screen.getByText("초기화");
    expect(reset).toBeInTheDocument();
    expect(screen.getByText("클라우드 혼합")).toBeInTheDocument();
    expect(screen.getByText("라우팅 점검")).toBeInTheDocument();
    expect(screen.getByText("세션의 AI 라우팅 흐름을 한눈에 요약합니다.")).toBeInTheDocument();
    expect(screen.getByText("마지막 라우팅")).toBeInTheDocument();
    expect(screen.getByText("마지막 요청이 어떤 경로로 처리됐는지 바로 확인합니다.")).toBeInTheDocument();
  });

  it("온디바이스 세션은 로컬 중심 요약 배지를 노출한다", () => {
    const state: LedgerState = {
      ...defaultState,
      total: 2,
      onlineCalls: 0,
      perBackend: {
        ...defaultState.perBackend,
        embedded: {
          count: 2,
          totalPromptChars: 80,
          totalLatencyMs: 340,
          lastTs: Date.now(),
        },
      },
      last: {
        backend: "embedded",
        online: false,
        model: "local-test",
        prompt_chars: 40,
        latency_ms: 170,
        ts_ms: Date.now(),
      },
    };

    renderWithProvider(
      <PrivacyLedgerBadge
        state={state}
        isAllOnDevice
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /개인정보 원장/ }));
    expect(screen.getByText("온디바이스 유지")).toBeInTheDocument();
    expect(screen.getByText("네트워크 없음")).toBeInTheDocument();
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

    const trigger = screen.getByRole("button", { name: /개인정보 원장/ });
    fireEvent.click(trigger);

    const buttons = screen.getAllByRole("button").filter((btn) => btn !== trigger);
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    const closeButton = screen.getByRole("button", { name: "개인정보 원장 상세 닫기" });
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

    const trigger = screen.getByRole("button", { name: /개인정보 원장/ });
    fireEvent.click(trigger);

    const buttons = screen.getAllByRole("button").filter((btn) => btn !== trigger);
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    const closeButton = screen.getByRole("button", { name: "개인정보 원장 상세 닫기" });
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

    const trigger = screen.getByRole("button", { name: /개인정보 원장/ });
    trigger.focus();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);

    const reset = screen.getByRole("button", { name: "세션 카운터 초기화" });
    expect(reset).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(trigger).toHaveFocus();
  });

  it("팝오버 내부 포인터 다운은 바깥 클릭으로 처리되지 않는다", () => {
    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /개인정보 원장/ });
    fireEvent.click(trigger);

    const popover = screen.getByRole("dialog", { name: "개인정보 원장 상세" });
    fireEvent.pointerDown(popover);

    expect(screen.getByRole("dialog", { name: "개인정보 원장 상세" })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-pressed", "true");
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

    const trigger = screen.getByRole("button", { name: /개인정보 원장/ });
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

    const popover = screen.getByRole("dialog", { name: "개인정보 원장 상세" });
    const maxHeight = Number.parseFloat(popover.style.maxHeight || "0");
    expect(maxHeight).toBeGreaterThan(0);
    expect(maxHeight).toBeLessThanOrEqual(164);

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("위아래 공간이 모두 작은 경우 뷰포트 기준 높이로 확장해 잘림을 완화한다", () => {
    const onReset = vi.fn();
    const originalInnerHeight = window.innerHeight;

    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const trigger = screen.getByRole("button", { name: /개인정보 원장/ });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 140,
    });
    Object.defineProperty(trigger, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 620,
        y: 60,
        top: 60,
        left: 620,
        right: 650,
        bottom: 88,
        width: 30,
        height: 28,
        toJSON: () => ({}),
      } as DOMRect),
    });

    fireEvent.click(trigger);

    const popover = screen.getByRole("dialog", { name: "개인정보 원장 상세" });
    const maxHeight = Number.parseFloat(popover.style.maxHeight || "0");
    expect(maxHeight).toBe(124);
    expect(popover.style.top).toBe("8px");

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("visualViewport 높이가 0이어도 innerHeight를 폴백으로 사용한다", () => {
    const onReset = vi.fn();
    const originalInnerHeight = window.innerHeight;
    const originalVisualViewport = window.visualViewport;

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        width: 0,
        height: 0,
        offsetLeft: 0,
        offsetTop: 0,
      },
    });

    renderWithProvider(
      <PrivacyLedgerBadge
        state={defaultState}
        isAllOnDevice
        onReset={onReset}
      />,
    );

    const trigger = screen.getByRole("button", { name: /개인정보 원장/ });
    Object.defineProperty(trigger, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 620,
        y: 8,
        top: 8,
        left: 620,
        right: 650,
        bottom: 36,
        width: 30,
        height: 28,
        toJSON: () => ({}),
      } as DOMRect),
    });

    fireEvent.click(trigger);
    const popover = screen.getByRole("dialog", { name: "개인정보 원장 상세" });
    const maxHeight = Number.parseFloat(popover.style.maxHeight || "0");
    expect(maxHeight).toBeGreaterThan(300);

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
  });
});
