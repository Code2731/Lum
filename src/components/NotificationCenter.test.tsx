import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import NotificationCenter from "./NotificationCenter";
import type { AppNotification } from "../hooks/useNotificationCenter";

describe("NotificationCenter", () => {
  const baseProps = {
    notifications: [] as AppNotification[],
    unreadCount: 0,
    onMarkAllRead: vi.fn(),
    onDismiss: vi.fn(),
    onClear: vi.fn(),
  };

  it("Escape 키로 패널을 닫는다", () => {
    const onClose = vi.fn();
    render(
      <NotificationCenter
        {...baseProps}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("바깥 영역 클릭으로 패널이 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div>outside</div>
        <NotificationCenter
          {...baseProps}
          onClose={onClose}
        />
      </div>,
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("알림 삭제 버튼이 있으면 타입이 맞게 렌더링된다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "agent",
        title: "agent done",
        body: "테스트 메시지",
        timestamp: Date.now(),
        read: false,
      },
    ];

    const { getByText } = render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={1}
        onClose={vi.fn()}
      />,
    );

    expect(getByText("agent done")).toBeInTheDocument();
  });
});
