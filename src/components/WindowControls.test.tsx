import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WindowControls, { getWindowControlMeta } from "./WindowControls";

const mockWindow = {
  close: vi.fn().mockResolvedValue(undefined),
  minimize: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => {}),
};

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mockWindow,
}));

vi.mock("@/components/ui/icon-button", () => ({
  IconButton: ({
    children,
    onClick,
    className,
    tooltip,
    description,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    className?: string;
    tooltip?: React.ReactNode;
    description?: React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        aria-label={typeof tooltip === "string" ? tooltip : undefined}
        className={className}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
      {description && <span>{description}</span>}
    </div>
  ),
}));

describe("WindowControls", () => {
  beforeEach(() => {
    mockWindow.close.mockClear();
    mockWindow.minimize.mockClear();
    mockWindow.toggleMaximize.mockClear();
    mockWindow.onResized.mockClear();
    mockWindow.isMaximized.mockReset();
    mockWindow.isMaximized.mockResolvedValue(false);
  });

  it("창 제어 메타를 상태에 따라 계산한다", () => {
    expect(getWindowControlMeta("close")).toEqual({
      ariaLabel: "닫기",
      tooltip: "닫기",
      description: "현재 LUM 창을 즉시 닫습니다. 진행 중인 세션이 있으면 창 종료 흐름으로 이어집니다.",
    });
    expect(getWindowControlMeta("minimize")).toEqual({
      ariaLabel: "최소화",
      tooltip: "최소화",
      description: "현재 창을 독이나 작업 표시줄로 내리고, 실행 중인 작업은 백그라운드에서 유지합니다.",
    });
    expect(getWindowControlMeta("maximize", false)).toEqual({
      ariaLabel: "최대화",
      tooltip: "최대화",
      description: "현재 창을 더 넓게 펼쳐 터미널과 패널을 동시에 보기 쉽게 만듭니다.",
    });
    expect(getWindowControlMeta("maximize", true)).toEqual({
      ariaLabel: "복원",
      tooltip: "복원",
      description: "전체 화면처럼 넓어진 창 크기를 이전 작업 크기로 되돌립니다.",
    });
  });

  it("창 제어 버튼 설명과 기본 라벨을 렌더링한다", async () => {
    render(<WindowControls />);

    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최소화" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "최대화" })).toBeInTheDocument();
    });

    expect(screen.getByText("현재 LUM 창을 즉시 닫습니다. 진행 중인 세션이 있으면 창 종료 흐름으로 이어집니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 창을 독이나 작업 표시줄로 내리고, 실행 중인 작업은 백그라운드에서 유지합니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 창을 더 넓게 펼쳐 터미널과 패널을 동시에 보기 쉽게 만듭니다.")).toBeInTheDocument();
    expect(mockWindow.onResized).toHaveBeenCalledTimes(1);
  });

  it("최대화 상태이면 복원 버튼과 설명을 노출한다", async () => {
    mockWindow.isMaximized.mockResolvedValue(true);
    render(<WindowControls />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "복원" })).toBeInTheDocument();
    });
    expect(screen.getByText("전체 화면처럼 넓어진 창 크기를 이전 작업 크기로 되돌립니다.")).toBeInTheDocument();
  });

  it("각 버튼 클릭은 해당 창 제어 메서드를 호출한다", async () => {
    render(<WindowControls />);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "최소화" }));
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "최대화" }));
    });

    expect(mockWindow.close).toHaveBeenCalledTimes(1);
    expect(mockWindow.minimize).toHaveBeenCalledTimes(1);
    expect(mockWindow.toggleMaximize).toHaveBeenCalledTimes(1);
  });
});
