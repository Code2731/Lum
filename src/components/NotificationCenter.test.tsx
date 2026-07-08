import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isPointerOutsideTargets } from "../utils/pointerGuard";
import NotificationCenter from "./NotificationCenter";
import type { AppNotification } from "../hooks/useNotificationCenter";

type WriteSpy = ReturnType<typeof vi.fn>;

type ClipboardState = {
  writeText: WriteSpy;
  restore: () => void;
};

function setupClipboardWriteMock(): ClipboardState {
  const nav = globalThis.navigator as Navigator & {
    clipboard?: { writeText: WriteSpy };
  };
  const originalClipboard = nav.clipboard;
  const writeText = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  return {
    writeText,
    restore: () => {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", {
          configurable: true,
          value: originalClipboard,
        });
      } else {
        delete (globalThis.navigator as Navigator & { clipboard?: { writeText: WriteSpy } }).clipboard;
      }
    },
  };
}

describe("NotificationCenter", () => {
  const baseProps = {
    notifications: [] as AppNotification[],
    unreadCount: 0,
    onMarkAllRead: vi.fn(),
    onDismiss: vi.fn(),
    onClear: vi.fn(),
  };

  it("바깥 클릭 판정은 ref가 null이어도 안전하게 동작한다", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    expect(isPointerOutsideTargets(target, [null])).toBe(true);
    expect(isPointerOutsideTargets(null, [null])).toBe(false);
  });

  it("바깥 클릭 판정은 패널 내부/외부를 구분한다", () => {
    const panel = document.createElement("div");
    const child = document.createElement("button");
    const outside = document.createElement("div");
    panel.appendChild(child);
    document.body.appendChild(panel);
    document.body.appendChild(outside);

    expect(isPointerOutsideTargets(child, [panel])).toBe(false);
    expect(isPointerOutsideTargets(outside, [panel])).toBe(true);
  });

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

  it("패널 내부 포인터 다운은 바깥 클릭으로 처리되지 않는다", () => {
    const onClose = vi.fn();
    render(
      <NotificationCenter
        {...baseProps}
        onClose={onClose}
      />,
    );

    const panel = screen.getByRole("dialog", { name: "알림 센터" });
    fireEvent.pointerDown(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closeOnDocument=false일 때 바깥 포인터 다운으로 닫히지 않는다", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div>outside</div>
        <NotificationCenter
          {...baseProps}
          onClose={onClose}
          closeOnDocument={false}
        />
      </div>,
    );

    fireEvent.pointerDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
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

  it("알림 텍스트를 복사할 수 있다", () => {
    const clipboardMock = setupClipboardWriteMock();
    try {
      const notifications: AppNotification[] = [
        {
          id: "1",
          type: "command",
          title: "cmd",
          body: "실패 알림 메시지",
          timestamp: Date.now(),
          read: false,
        },
      ];

      render(
        <NotificationCenter
          notifications={notifications}
          unreadCount={1}
          onMarkAllRead={vi.fn()}
          onDismiss={vi.fn()}
          onClear={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      fireEvent.mouseOver(screen.getByText("실패 알림 메시지"));
      const copyButton = screen.getByRole("button", { name: "알림 텍스트 복사" });
      fireEvent.click(copyButton);
      expect(clipboardMock.writeText).toHaveBeenCalledWith("cmd\n실패 알림 메시지");
    } finally {
      clipboardMock.restore();
    }
  });

  it("미확인 알림 필터를 토글해 미확인 목록만 볼 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "read",
            body: "이미 확인됨",
            timestamp: 1_000,
            read: true,
          },
          {
            id: "2",
            type: "agent",
            title: "unread",
            body: "확인 필요",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);

    const unreadOnlyButton = screen.getByRole("button", { name: "미확인 알림만 보기" });
    fireEvent.click(unreadOnlyButton);

    const filtered = screen.getAllByRole("alert");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toHaveTextContent("unread");
  });

  it("미확인 알림이 없으면 미확인 필터 버튼이 표시되지 않는다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "read",
            body: "이미 확인됨",
            timestamp: 1_000,
            read: true,
          },
        ]}
        unreadCount={0}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /미확인/ })).not.toBeInTheDocument();
    expect(screen.getByText("read")).toBeInTheDocument();
  });

  it("미확인 필터에서 타입/전체 칩 카운트가 미확인 기준으로 표시된다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-read",
            body: "읽은 커맨드",
            timestamp: 1_000,
            read: true,
          },
          {
            id: "2",
            type: "command",
            title: "cmd-unread",
            body: "미확인 커맨드",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "agent",
            title: "agent-unread",
            body: "미확인 에이전트",
            timestamp: 3_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "미확인 알림만 보기" }));

    expect(screen.getByRole("button", { name: /전체 \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /커맨드 \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /에이전트 \(1\)/ })).toBeInTheDocument();
  });

  it("타입 필터로 알림 종류만 표시할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd1",
            body: "명령 알림",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "agent1",
            body: "에이전트 알림",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "healing",
            title: "heal1",
            body: "치유 알림",
            timestamp: 3_000,
            read: false,
          },
        ]}
        unreadCount={3}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("cmd1")).toBeInTheDocument();
    expect(screen.getByText("agent1")).toBeInTheDocument();
    expect(screen.getByText("heal1")).toBeInTheDocument();

    const filterButtons = screen.getAllByRole("button");
    const commandFilter = filterButtons.find((b) => b.textContent?.includes("커맨드"));
    expect(commandFilter).toBeDefined();
    if (!commandFilter) {
      throw new Error("커맨드 필터 버튼을 찾지 못했습니다.");
    }
    fireEvent.click(commandFilter);

    expect(screen.getByText("cmd1")).toBeInTheDocument();
    expect(screen.queryByText("agent1")).not.toBeInTheDocument();
    expect(screen.queryByText("heal1")).not.toBeInTheDocument();
  });

  it("타입 필터와 미확인 필터는 조합되어 적용된다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-unread",
            body: "읽지 않은 커맨드",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "command",
            title: "cmd-read",
            body: "읽은 커맨드",
            timestamp: 2_000,
            read: true,
          },
          {
            id: "3",
            type: "agent",
            title: "agent-unread",
            body: "읽지 않은 에이전트",
            timestamp: 3_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const unreadOnlyButton = screen.getByRole("button", { name: "미확인 알림만 보기" });
    fireEvent.click(unreadOnlyButton);

    const filterButtons = screen.getAllByRole("button");
    const commandFilter = filterButtons.find((b) => b.textContent?.includes("커맨드"));
    expect(commandFilter).toBeDefined();
    if (!commandFilter) {
      throw new Error("커맨드 필터 버튼을 찾지 못했습니다.");
    }
    fireEvent.click(commandFilter);

    expect(screen.getByText("cmd-unread")).toBeInTheDocument();
    expect(screen.queryByText("cmd-read")).not.toBeInTheDocument();
    expect(screen.queryByText("agent-unread")).not.toBeInTheDocument();
  });

  it("타입 필터에서 미확인 항목만 읽음 처리할 수 있다", () => {
    const onMarkByIds = vi.fn();
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-unread-1",
            body: "커맨드 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "command",
            title: "cmd-read-1",
            body: "커맨드 2",
            timestamp: 2_000,
            read: true,
          },
          {
            id: "3",
            type: "agent",
            title: "agent-unread",
            body: "에이전트 1",
            timestamp: 3_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onMarkByIds={onMarkByIds}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const filterButtons = screen.getAllByRole("button");
    const commandFilter = filterButtons.find((b) => b.textContent?.includes("커맨드"));
    expect(commandFilter).toBeDefined();
    if (!commandFilter) {
      throw new Error("커맨드 필터 버튼을 찾지 못했습니다.");
    }
    fireEvent.click(commandFilter);

    fireEvent.click(screen.getByRole("button", { name: /현재 보기 미확인 알림 모두 읽음/ }));
    expect(onMarkByIds).toHaveBeenCalledWith(["1"]);
  });

  it("타입 필터에서 표시된 항목을 일괄 삭제할 수 있다", () => {
    const onDismissByIds = vi.fn();
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-unread-1",
            body: "커맨드 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "command",
            title: "cmd-unread-2",
            body: "커맨드 2",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "agent",
            title: "agent-unread",
            body: "에이전트 1",
            timestamp: 3_000,
            read: false,
          },
        ]}
        unreadCount={3}
        onMarkAllRead={vi.fn()}
        onMarkByIds={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={onDismissByIds}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const filterButtons = screen.getAllByRole("button");
    const commandFilter = filterButtons.find((b) => b.textContent?.includes("커맨드"));
    expect(commandFilter).toBeDefined();
    if (!commandFilter) {
      throw new Error("커맨드 필터 버튼을 찾지 못했습니다.");
    }
    fireEvent.click(commandFilter);

    fireEvent.click(screen.getByRole("button", { name: /현재 보기 항목 삭제/ }));
    expect(onDismissByIds).toHaveBeenCalledWith(["1", "2"]);
  });

  it("검색어 입력으로 알림 제목/본문을 필터링할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 실패",
            body: "CI 빌드에서 에러가 발생했어요",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "에이전트 완료",
            body: "작업이 정상적으로 끝났습니다",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "healing",
            title: "치유 제안",
            body: "치명적 경로에서 복구를 시도",
            timestamp: 3_000,
            read: false,
          },
        ]}
        unreadCount={3}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const searchInput = screen.getByLabelText("알림 검색");
    fireEvent.change(searchInput, { target: { value: "치유" } });

    expect(screen.getByText("치유 제안")).toBeInTheDocument();
    expect(screen.getByText("치명적 경로에서 복구를 시도")).toBeInTheDocument();
    expect(screen.queryByText("빌드 실패")).not.toBeInTheDocument();
    expect(screen.queryByText("에이전트 완료")).not.toBeInTheDocument();
  });

  it("검색어 입력 시 일치 항목이 없으면 검색 결과 메시지를 표시한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 실패",
            body: "CI 빌드에서 에러가 발생했어요",
            timestamp: 1_000,
            read: false,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("알림 검색"), { target: { value: "찾을 수 없는 텍스트" } });
    expect(screen.getByText("검색 조건에 맞는 알림이 없습니다")).toBeInTheDocument();
  });

  it("슬래시 키로 검색 입력에 포커스할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "알림 1",
            body: "메시지 1",
            timestamp: 1_000,
            read: false,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "알림 센터" }), { key: "/" });
    expect(screen.getByLabelText("알림 검색")).toHaveFocus();
  });

  it("검색어 지우기 버튼이 동작한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "알림 1",
            body: "메시지 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "메시지 2",
            body: "테스트",
            timestamp: 2_000,
            read: true,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const searchInput = screen.getByLabelText("알림 검색");
    fireEvent.change(searchInput, { target: { value: "테스트" } });
    expect(searchInput).toHaveValue("테스트");

    fireEvent.click(screen.getByLabelText("검색어 지우기"));
    expect(searchInput).toHaveValue("");
    expect(screen.getByText("알림 1")).toBeInTheDocument();
    expect(screen.getByText("메시지 2")).toBeInTheDocument();
  });

  it("검색어에 맞는 텍스트를 제목/본문에서 강조 표시한다", () => {
    const { container } = render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 실패",
            body: "CI 빌드에서 에러가 발생했어요",
            timestamp: 1_000,
            read: false,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const searchInput = screen.getByLabelText("알림 검색");
    fireEvent.change(searchInput, { target: { value: "빌드" } });

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent("빌드");
    expect(marks[1]).toHaveTextContent("빌드");
  });

  it("현재 표시된 목록의 미확인 항목만 일괄 읽음 처리할 수 있다", () => {
    const onMarkByIds = vi.fn();
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-1",
            body: "알림 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "agent-1",
            body: "알림 2",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "env",
            title: "env-1",
            body: "알림 3",
            timestamp: 3_000,
            read: true,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onMarkByIds={onMarkByIds}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /현재 보기 미확인 알림 모두 읽음/ }));
    expect(onMarkByIds).toHaveBeenCalledWith(["2", "1"]);
  });

  it("M 키로 현재 표시된 미확인 알림을 일괄 읽음 처리할 수 있다", () => {
    const onMarkByIds = vi.fn();
    const { container } = render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-1",
            body: "알림 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "agent-1",
            body: "알림 2",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "env",
            title: "env-1",
            body: "알림 3",
            timestamp: 3_000,
            read: true,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onMarkByIds={onMarkByIds}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(container.querySelector("[role=\"dialog\"]") as HTMLElement, { key: "m" });
    expect(onMarkByIds).toHaveBeenCalledWith(["2", "1"]);
  });

  it("현재 표시된 목록을 일괄 삭제할 수 있다", () => {
    const onDismissByIds = vi.fn();
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-1",
            body: "알림 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "agent-1",
            body: "알림 2",
            timestamp: 2_000,
            read: true,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onMarkByIds={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={onDismissByIds}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /현재 보기 항목 삭제/ }));
    expect(onDismissByIds).toHaveBeenCalledWith(["2", "1"]);
  });

  it("D 키로 현재 표시된 목록을 일괄 삭제할 수 있다", () => {
    const onDismissByIds = vi.fn();
    const { container } = render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-1",
            body: "알림 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "agent-1",
            body: "알림 2",
            timestamp: 2_000,
            read: true,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onMarkByIds={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={onDismissByIds}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(container.querySelector("[role=\"dialog\"]") as HTMLElement, { key: "d" });
    expect(onDismissByIds).toHaveBeenCalledWith(["2", "1"]);
  });

  it("R 키로 현재 보이는 알림 전체를 읽음 처리할 수 있다", () => {
    const onMarkAllRead = vi.fn();
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-1",
            body: "알림 1",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "agent-1",
            body: "알림 2",
            timestamp: 2_000,
            read: true,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={onMarkAllRead}
        onMarkByIds={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "알림 센터" }), { key: "r" });
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("F 키로 미확인 필터를 토글할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "read",
            body: "이미 확인됨",
            timestamp: 1_000,
            read: true,
          },
          {
            id: "2",
            type: "agent",
            title: "unread",
            body: "확인 필요",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "알림 센터" }), { key: "f" });
    expect(screen.getByRole("button", { name: "전체 보기" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "알림 센터" }), { key: "f" });
    expect(screen.getByRole("button", { name: /미확인 알림만 보기/ })).toBeInTheDocument();
  });

  it("알림이 읽음/미읽음 상태와 시간 기준으로 정렬된다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "command",
        title: "읽은 알림",
        body: "이미 확인",
        timestamp: 1000,
        read: true,
      },
      {
        id: "2",
        type: "agent",
        title: "미확인 오래된 알림",
        body: "뒤늦은 항목",
        timestamp: 2000,
        read: false,
      },
      {
        id: "3",
        type: "env",
        title: "미확인 최신 알림",
        body: "최신 항목",
        timestamp: 3000,
        read: false,
      },
    ];

    render(
      <NotificationCenter
        notifications={notifications}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const items = screen.getAllByRole("alert");
    expect(items[0]).toHaveTextContent("미확인 최신 알림");
    expect(items[1]).toHaveTextContent("미확인 오래된 알림");
    expect(items[2]).toHaveTextContent("읽은 알림");
  });

  it("알림 타입 배지가 표시된다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "agent",
            title: "에이전트 알림",
            body: "타입 배지 확인",
            timestamp: Date.now(),
            read: false,
          },
        ]}
        unreadCount={1}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("에이전트")).toBeInTheDocument();
    expect(screen.getByText("미확인")).toBeInTheDocument();
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
