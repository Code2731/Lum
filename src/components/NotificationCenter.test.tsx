import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
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

  it("Escape 키는 상위 keydown으로 전파되지 않는다", () => {
    const onClose = vi.fn();
    const parentKeyDown = vi.fn();
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") parentKeyDown();
    };

    document.addEventListener("keydown", onWindowKeyDown);
    try {
      render(
        <NotificationCenter
          {...baseProps}
          onClose={onClose}
        />,
      );

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(parentKeyDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onWindowKeyDown);
    }
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

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("포인터 다운으로도 바깥 영역 탭 시 패널이 닫힌다", () => {
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

    fireEvent.pointerDown(document.body);
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

  it("알림 센터에서 화살표 키로 포커스가 순환 이동한다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "agent",
        title: "agent done",
        body: "첫 번째 메시지",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "2",
        type: "command",
        title: "command done",
        body: "두 번째 메시지",
        timestamp: Date.now(),
        read: true,
      },
    ];

    const { container } = render(
      <NotificationCenter
        notifications={notifications}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const focusables = Array.from(container.querySelectorAll("button")).filter((el) => !el.hasAttribute("disabled"));
    expect(focusables.length).toBeGreaterThanOrEqual(4);
    focusables[0]?.focus();
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(focusables[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(focusables[1]);

    fireEvent.keyDown(focusables[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(focusables[2]);

    fireEvent.keyDown(focusables[2], { key: "ArrowUp" });
    expect(document.activeElement).toBe(focusables[1]);

    fireEvent.keyDown(focusables[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(focusables[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it("알림 센터에서 Home/End 키로 시작/끝으로 이동한다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "agent",
        title: "agent done",
        body: "첫 번째 메시지",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "2",
        type: "command",
        title: "command done",
        body: "두 번째 메시지",
        timestamp: Date.now(),
        read: true,
      },
    ];

    const { container } = render(
      <NotificationCenter
        notifications={notifications}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const focusables = Array.from(container.querySelectorAll("button")).filter((el) => !el.hasAttribute("disabled"));
    expect(focusables.length).toBeGreaterThanOrEqual(4);

    focusables[2]?.focus();
    expect(document.activeElement).toBe(focusables[2]);

    fireEvent.keyDown(focusables[2], { key: "Home" });
    expect(document.activeElement).toBe(focusables[0]);

    focusables[focusables.length - 1]?.focus();
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);

    fireEvent.keyDown(focusables[focusables.length - 1], { key: "End" });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it("포커스는 Tab 키로도 순환 이동한다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "agent",
        title: "agent done",
        body: "첫 번째 메시지",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "2",
        type: "command",
        title: "command done",
        body: "두 번째 메시지",
        timestamp: Date.now(),
        read: true,
      },
    ];

    const { container } = render(
      <NotificationCenter
        notifications={notifications}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const focusables = Array.from(container.querySelectorAll("button")).filter((el) => !el.hasAttribute("disabled"));
    expect(focusables.length).toBeGreaterThan(2);

    focusables[0]?.focus();
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(focusables[0], { key: "Tab" });
    expect(document.activeElement).toBe(focusables[1]);

    focusables[1]?.focus();
    fireEvent.keyDown(focusables[1], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusables[0]);

    focusables[focusables.length - 1]?.focus();
    fireEvent.keyDown(focusables[focusables.length - 1], { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
  });

  it("알림이 없을 때 Home/End는 첫/끝 포커스로 이동 요청이 있어도 안전하게 처리된다", () => {
    const { container } = render(
      <NotificationCenter
        notifications={[]}
        unreadCount={0}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const focusables = Array.from(container.querySelectorAll("button")).filter((el) => !el.hasAttribute("disabled"));
    expect(focusables.length).toBeGreaterThan(0);

    focusables[0]?.focus();
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(focusables[0], { key: "Home", code: "Home" });
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(focusables[0], { key: "End", code: "End" });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it("알림 삭제 버튼에 접근성 라벨이 있다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "command",
        title: "cmd",
        body: "삭제 테스트",
        timestamp: Date.now(),
        read: false,
      },
    ];

    const { getByLabelText } = render(
      <NotificationCenter
        notifications={notifications}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(getByLabelText("cmd 알림 닫기")).toBeInTheDocument();
  });

  it("패널이 열리면 첫 포커스 가능한 요소가 포커스를 받는다", async () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "command",
        title: "cmd",
        body: "삭제 테스트",
        timestamp: Date.now(),
        read: false,
      },
    ];

    const { getByLabelText } = render(
      <NotificationCenter
        notifications={notifications}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const initialFocusTarget = getByLabelText("모든 알림 읽음 처리");
    await waitFor(() => {
      expect(initialFocusTarget).toHaveFocus();
    });
  });

  it("최대 높이 prop이 전달되면 스타일에 반영된다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "command",
        title: "cmd",
        body: "테스트 메시지",
        timestamp: Date.now(),
        read: false,
      },
    ];

    const { container } = render(
      <NotificationCenter
        notifications={notifications}
        unreadCount={1}
        maxHeight={180}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(container.firstChild).toHaveStyle({ maxHeight: "180px" });
  });
});
