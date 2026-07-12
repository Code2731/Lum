import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isPointerOutsideTargets } from "../utils/pointerGuard";
import NotificationCenter, {
  getNotificationCardRecoveryHint,
  getNotificationCardRecoveryPresentation,
  getNotificationEmptyStateMeta,
  getNotificationRecoveryMeta,
  getNotificationResultMeta,
  getNotificationTypeMeta,
} from "./NotificationCenter";
import type { AppNotification } from "../hooks/useNotificationCenter";

type WriteSpy = ReturnType<typeof vi.fn>;

type ClipboardState = {
  writeText: WriteSpy;
  restore: () => void;
};

function ensureLocalStorageMock() {
  if (typeof window === "undefined" || window.localStorage) {
    return;
  }

  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
}

ensureLocalStorageMock();

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

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("알림 타입 메타를 일관되게 계산한다", () => {
    expect(getNotificationTypeMeta("agent")).toEqual({
      label: "에이전트",
      colorClass: "text-accent",
      badgeClass: "border-cyan-300/22 bg-cyan-400/[0.1] text-cyan-100/82",
      hint: "에이전트 흐름",
      cardClass: "border-cyan-300/20 bg-cyan-400/[0.08]",
    });
  });

  it("결과 메타와 빈 상태 메타를 상태에 따라 계산한다", () => {
    expect(getNotificationResultMeta(false, false)).toEqual({
      flowLabel: "전체 흐름",
      scopeLabel: "최신 우선",
      description: "최신 알림 흐름을 먼저 보고, 필요하면 종류별로 좁혀서 정리합니다.",
    });

    expect(getNotificationResultMeta(true, true)).toEqual({
      flowLabel: "검색 반영",
      scopeLabel: "필터 적용",
      description: "검색 결과를 먼저 보고, 아래에서 종류를 좁히거나 현재 보기만 정리합니다.",
    });

    expect(getNotificationEmptyStateMeta({ hasSearchQuery: true, showUnreadOnly: false })).toEqual({
      badges: ["검색 조정", "기록 재적용", "필터 확인"],
      title: "검색 조건에 맞는 알림이 없습니다",
      description: "검색어를 줄이거나 최근 검색 기록을 다시 적용해 보세요.",
    });

    expect(getNotificationEmptyStateMeta({ hasSearchQuery: false, showUnreadOnly: true })).toEqual({
      badges: ["전체 보기", "지난 흐름", "다시 확인"],
      title: "미확인 알림이 없습니다",
      description: "전체 보기로 전환하면 지난 알림 흐름을 다시 확인할 수 있습니다.",
    });

    expect(getNotificationRecoveryMeta([
      {
        id: "heal-1",
        type: "healing",
        title: "복구 제안 도착",
        body: "에러 복구 제안이 준비되었습니다.",
        timestamp: 1,
        read: false,
      },
      {
        id: "cmd-1",
        type: "command",
        title: "테스트 완료",
        body: "npm test finished",
        timestamp: 2,
        read: true,
      },
    ])).toEqual({
      badges: ["복구 1건", "먼저 확인", "인스펙터 연계"],
      helper: "자동 복구 알림이 도착했습니다. 먼저 최근 복구 흐름을 확인한 뒤 인스펙터에서 실패 분석과 제안 커맨드 실행으로 이어가면 됩니다.",
      tone: "amber",
    });

    expect(getNotificationCardRecoveryHint({
      id: "heal-2",
      type: "healing",
      title: "복구 제안",
      body: "실패 블록 분석 준비",
      timestamp: 3,
      read: false,
    })).toBe("새 복구 알림입니다. 먼저 복구 시작을 눌러 인스펙터에서 실패 분석과 첫 제안 실행 흐름으로 바로 이어가세요.");
    expect(getNotificationCardRecoveryPresentation({
      id: "heal-2",
      type: "healing",
      title: "복구 제안",
      body: "실패 블록 분석 준비",
      timestamp: 3,
      read: false,
    })).toEqual({
      badges: ["먼저 복구", "분석 확인", "첫 제안 실행"],
      tone: "amber",
    });
  });

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

  it("healing 알림이 있으면 상단에 복구 가능 상태 요약을 노출한다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "healing",
        title: "복구 제안",
        body: "실패 블록 분석이 준비되었습니다.",
        timestamp: Date.now(),
        read: false,
      },
    ];

    render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={1}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("복구 1건")).toBeInTheDocument();
    expect(screen.getByText("먼저 확인")).toBeInTheDocument();
    expect(screen.getByText("인스펙터 연계")).toBeInTheDocument();
    expect(screen.getByText("자동 복구 알림이 도착했습니다. 먼저 최근 복구 흐름을 확인한 뒤 인스펙터에서 실패 분석과 제안 커맨드 실행으로 이어가면 됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "복구 카드 보기" })).toBeInTheDocument();
  });

  it("healing 알림 카드에는 바로 복구 보기 가이드를 노출한다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "healing",
        title: "복구 제안",
        body: "실패 블록 분석이 준비되었습니다.",
        timestamp: Date.now(),
        read: false,
      },
    ];

    render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={1}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("바로 복구 보기")).toBeInTheDocument();
    expect(screen.getByText("먼저 복구")).toBeInTheDocument();
    expect(screen.getByText("분석 확인")).toBeInTheDocument();
    expect(screen.getByText("첫 제안 실행")).toBeInTheDocument();
    expect(screen.getByText("새 복구 알림입니다. 먼저 복구 시작을 눌러 인스펙터에서 실패 분석과 첫 제안 실행 흐름으로 바로 이어가세요.")).toBeInTheDocument();
  });

  it("healing 알림 카드의 인스펙터 열기 버튼은 복구 흐름 콜백을 호출한다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "healing",
        title: "복구 제안",
        body: "실패 블록 분석이 준비되었습니다.",
        timestamp: Date.now(),
        read: false,
      },
    ];
    const onOpenRecoveryFlow = vi.fn();
    const onMarkByIds = vi.fn();

    render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={1}
        onClose={vi.fn()}
        onMarkByIds={onMarkByIds}
        onOpenRecoveryFlow={onOpenRecoveryFlow}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "복구 시작" }));

    expect(onMarkByIds).toHaveBeenCalledWith(["1"]);
    expect(onOpenRecoveryFlow).toHaveBeenCalledTimes(1);
  });

  it("복구 강조 상태에서는 healing 알림을 먼저 보여준다", () => {
    const notifications: AppNotification[] = [
      {
        id: "cmd-1",
        type: "command",
        title: "테스트 완료",
        body: "npm test finished",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "heal-1",
        type: "healing",
        title: "복구 제안",
        body: "실패 블록 분석이 준비되었습니다.",
        timestamp: Date.now() - 1000,
        read: false,
      },
    ];

    const { container } = render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={2}
        onClose={vi.fn()}
        highlightRecovery={true}
      />,
    );

    const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
    expect(alerts[0]?.textContent).toContain("복구 제안");
  });

  it("복구 자동 포커스가 켜지면 healing 액션 버튼으로 포커스가 이동한다", async () => {
    const notifications: AppNotification[] = [
      {
        id: "heal-1",
        type: "healing",
        title: "복구 제안",
        body: "실패 블록 분석이 준비되었습니다.",
        timestamp: Date.now(),
        read: false,
      },
    ];

    render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={1}
        onClose={vi.fn()}
        onOpenRecoveryFlow={vi.fn()}
        highlightRecovery={true}
        autoFocusRecoveryAction={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "복구 시작" })).toHaveFocus();
    });
  });

  it("상단 복구 카드 보기 버튼은 첫 healing 액션으로 포커스를 이동한다", async () => {
    const notifications: AppNotification[] = [
      {
        id: "cmd-1",
        type: "command",
        title: "테스트 완료",
        body: "npm test finished",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "heal-1",
        type: "healing",
        title: "복구 제안",
        body: "실패 블록 분석이 준비되었습니다.",
        timestamp: Date.now() - 1000,
        read: false,
      },
    ];

    render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={2}
        onClose={vi.fn()}
        onOpenRecoveryFlow={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "복구 카드 보기" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "복구 시작" })).toHaveFocus();
    });
  });

  it("알림 카드 헤더의 타입 배지는 종류별 색상 대비를 가진다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "agent",
        title: "agent done",
        body: "테스트 메시지",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "2",
        type: "healing",
        title: "heal done",
        body: "복구 메시지",
        timestamp: Date.now() - 1_000,
        read: false,
      },
    ];

    render(
      <NotificationCenter
        {...baseProps}
        notifications={notifications}
        unreadCount={2}
        onDismissByIds={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("에이전트").className).toContain("bg-cyan-400/[0.1]");
    expect(screen.getByText("치유").className).toContain("bg-amber-400/[0.1]");
  });

  it("알림 카드는 메타 줄에서 흐름과 확인 상태를 함께 보여준다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "healing",
        title: "auto heal",
        body: "복구 제안이 도착했습니다",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "2",
        type: "env",
        title: "env status",
        body: "환경 점검이 완료되었습니다",
        timestamp: Date.now() - 3_000,
        read: true,
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

    expect(screen.getByText("복구 흐름")).toBeInTheDocument();
    expect(screen.getByText("환경 흐름")).toBeInTheDocument();
    expect(screen.getByText("지금 확인")).toBeInTheDocument();
    expect(screen.getByText("읽음")).toBeInTheDocument();
  });

  it("알림 카드 액션 버튼은 복사와 닫기를 기본 노출한다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "agent",
        title: "agent run",
        body: "에이전트 작업이 완료되었습니다",
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

    expect(screen.getByLabelText("agent run 알림 복사")).toBeInTheDocument();
    expect(screen.getByLabelText("agent run 알림 닫기")).toBeInTheDocument();
  });

  it("미확인 알림은 타입별 강조 배경으로 우선순위를 드러낸다", () => {
    const notifications: AppNotification[] = [
      {
        id: "1",
        type: "healing",
        title: "auto heal",
        body: "복구 제안이 도착했습니다",
        timestamp: Date.now(),
        read: false,
      },
      {
        id: "2",
        type: "command",
        title: "build done",
        body: "빌드가 완료되었습니다",
        timestamp: Date.now() - 1_000,
        read: false,
      },
      {
        id: "3",
        type: "env",
        title: "env stable",
        body: "환경 점검이 완료되었습니다",
        timestamp: Date.now() - 2_000,
        read: true,
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

    const alerts = screen.getAllByRole("alert");
    expect(alerts[0]?.className).toContain("bg-amber-400/[0.09]");
    expect(alerts[1]?.className).toContain("bg-sky-400/[0.07]");
    expect(alerts[2]?.className).toContain("bg-transparent");
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

  it("미확인 토글은 활성 상태에서 emerald 톤으로 강조된다", () => {
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
            type: "env",
            title: "환경 점검",
            body: "환경 점검이 완료되었습니다",
            timestamp: 900,
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

    fireEvent.click(screen.getByRole("button", { name: "미확인 알림만 보기" }));

    const unreadToggle = screen.getByRole("button", { name: "전체 알림 보기" });
    expect(unreadToggle).toHaveAttribute("aria-pressed", "true");
    expect(unreadToggle.className).toContain("bg-emerald-400/14");
  });

  it("상단 헤더 액션은 역할별 색상 톤을 유지한다", () => {
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

    expect(screen.getByLabelText("모든 알림 읽음 처리").className).toContain("bg-emerald-400/[0.08]");
    expect(screen.getByLabelText("알림 전체 삭제").className).toContain("bg-rose-400/[0.08]");
    expect(screen.getByLabelText("알림 센터 닫기").className).toContain("bg-white/[0.03]");
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

  it("타입 필터는 선택된 종류를 색상 대비로 더 강하게 보여준다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "healing",
            title: "복구 제안",
            body: "오류를 자동으로 고칠 수 있습니다",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "command",
            title: "빌드 완료",
            body: "커맨드가 성공적으로 끝났습니다",
            timestamp: 900,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /치유/ }));

    const healingFilter = screen.getByRole("button", { name: /치유/ });
    const commandFilter = screen.getByRole("button", { name: /커맨드/ });
    expect(healingFilter).toHaveAttribute("aria-pressed", "true");
    expect(healingFilter.className).toContain("bg-amber-400/16");
    expect(commandFilter.className).toContain("bg-sky-400/[0.04]");
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

  it("검색어 매칭 개수를 제목/본문으로 분리해 표시한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 완료",
            body: "CI 빌드 파이프라인이 끝났습니다",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "에이전트 알림",
            body: "빌드 중 에러가 발생했습니다",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "healing",
            title: "치유 메시지",
            body: "수정이 필요합니다",
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

    fireEvent.change(screen.getByLabelText("알림 검색"), { target: { value: "빌드" } });

    expect(screen.getByText("2건")).toBeInTheDocument();
    expect(screen.getByText(/제목:\s*1건,\s*본문:\s*2건/)).toBeInTheDocument();
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
    expect(screen.getByText("검색 조정")).toBeInTheDocument();
    expect(screen.getByText("기록 재적용")).toBeInTheDocument();
    expect(screen.getByText("검색어를 줄이거나 최근 검색 기록을 다시 적용해 보세요.")).toBeInTheDocument();
  });

  it("알림 검색 상단에 정리 흐름 안내를 보여준다", () => {
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

    expect(screen.getByText("먼저 검색")).toBeInTheDocument();
    expect(screen.getAllByText("다음 필터").length).toBeGreaterThan(0);
    expect(screen.getAllByText("마지막 정리").length).toBeGreaterThan(0);
    expect(screen.getByText("현재 결과")).toBeInTheDocument();
    expect(screen.getByText("검색 반영")).toBeInTheDocument();
    expect(screen.getByText("먼저 찾고, 다음으로 좁히고, 마지막에 현재 보기를 정리합니다.")).toBeInTheDocument();
  });

  it("필터와 일괄 액션 영역도 순서형 라벨을 함께 보여준다", () => {
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

    expect(screen.getAllByText("다음 필터").length).toBeGreaterThan(0);
    expect(screen.getAllByText("마지막 정리").length).toBeGreaterThan(0);
    expect(screen.getByText("현재 보기 삭제")).toBeInTheDocument();
  });

  it("빈 알림 센터는 다음에 쌓일 흐름을 안내한다", () => {
    render(
      <NotificationCenter
        {...baseProps}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("알림이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("다음 알림")).toBeInTheDocument();
    expect(screen.getByText("실행 흐름")).toBeInTheDocument();
    expect(screen.getByText("자동 복구")).toBeInTheDocument();
    expect(screen.getByText("명령 실행, 에이전트 작업, 자동 복구 흐름이 생기면 여기에서 이어집니다.")).toBeInTheDocument();
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

  it("검색어를 공백 기준 다중 키워드로 처리하고 제목/본문 매칭 건수를 분리한다", () => {
    const { container } = render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 실패 알림",
            body: "요약 없이 종료됨",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "에이전트 알림",
            body: "빌드 진행 중 실패가 발생했습니다",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("알림 검색"), { target: { value: "빌드 실패" } });

    expect(screen.getByText(/제목:\s*1건,\s*본문:\s*1건/)).toBeInTheDocument();
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(4);
    expect(marks[0]).toHaveTextContent("빌드");
    expect(marks[1]).toHaveTextContent("실패");
  });

  it("검색어 매칭 결과를 제목 우선 관련성 순서로 정렬한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "데이터 베이스 로그인 실패",
            body: "세션에서 실패 메시지를 받았습니다",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "로그인 성공 알림",
            body: "로그인 실패 케이스를 재현했습니다",
            timestamp: 2_000,
            read: false,
          },
          {
            id: "3",
            type: "healing",
            title: "상태 알림",
            body: "로그인 실패 이후 회복 시도",
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

    fireEvent.change(screen.getByLabelText("알림 검색"), { target: { value: "\"로그인 실패\"" } });

    const rows = screen.getAllByRole("alert");
    expect(rows[0]).toHaveTextContent("데이터 베이스 로그인 실패");
    expect(rows).toHaveLength(3);
  });

  it("부정 키워드(-키워드)로 검색 결과를 제외할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "로그인 실패 알림",
            body: "요약에 원인이 있습니다",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "로그인 실패 데이터",
            body: "로그인 실패 데이터가 포함됩니다",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "\"로그인 실패\" -데이터" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("로그인 실패 알림");
    expect(screen.queryByText("로그인 실패 데이터")).not.toBeInTheDocument();
  });

  it("따옴표로 묶인 검색어를 구문 단위로 처리한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 실패 알림",
            body: "로그에서 실패 원인을 분석합니다",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "성능 알림",
            body: "빌드가 진행 중 실패했습니다",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("알림 검색"), { target: { value: "\"빌드 실패\"" } });

    expect(screen.getByText("빌드 실패 알림")).toBeInTheDocument();
    expect(screen.queryByText("성능 알림")).not.toBeInTheDocument();
    expect(screen.getByText(/제목:\s*1건,\s*본문:\s*0건/)).toBeInTheDocument();
  });

  it("검색어 토큰을 시각적으로 구문/부정 구분해 표시한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "로그인 실패 알림",
            body: "요약에서 실패 원인 확인",
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

    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "\"로그인 실패\" -요약" },
    });

    expect(screen.getByText("+ 로그인 실패")).toBeInTheDocument();
    expect(screen.getByText("- 요약")).toBeInTheDocument();
  });

  it("닫히지 않은 따옴표 입력 시 검색 경고를 표시한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "로그인 실패 알림",
            body: "요약에서 실패 원인 확인",
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

    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "\"로그인 실패" },
    });

    expect(
      screen.getByText(/따옴표가 닫히지 않았습니다\. 구문 검색은 정확히 닫힌 따옴표만 유효합니다\./),
    ).toBeInTheDocument();
  });

  it("검색 모드를 정규식으로 전환해 패턴 검색을 수행할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "알림 처리 완료",
            body: "작업이 정상 동작합니다",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));
    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "에러|완료" },
    });

    expect(screen.getByText("빌드 에러 코드 500")).toBeInTheDocument();
    expect(screen.getByText("알림 처리 완료")).toBeInTheDocument();
  });

  it("정규식 모드에서 유효하지 않은 패턴이면 오류를 표시한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));
    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "[" },
    });

    expect(screen.getByText("정규식이 유효하지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByText("빌드 에러 코드 500")).not.toBeInTheDocument();
  });

  it("정규식 모드에서 매칭 텍스트를 강조 표시한다", () => {
    const { container } = render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "작업 처리 완료",
            body: "모든 메시지 정상",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));
    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "에러|메시지" },
    });

    const highlights = container.querySelectorAll("mark");
    expect(highlights).toHaveLength(3);
    expect(highlights[0]).toHaveTextContent("에러");
    expect(highlights[1]).toHaveTextContent("에러");
    expect(highlights[2]).toHaveTextContent("메시지");
    expect(screen.getByText("/에러|메시지/")).toBeInTheDocument();
  });

  it("정규식 모드에서 /패턴/ 형태를 바로 사용할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "작업 처리 완료",
            body: "모든 메시지 정상",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));
    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "/에러/" },
    });

    expect(screen.getByText("빌드 에러 코드 500")).toBeInTheDocument();
    expect(screen.queryByText("작업 처리 완료")).not.toBeInTheDocument();
    expect(screen.getByText("/에러/")).toBeInTheDocument();
  });

  it("정규식 모드에서 /패턴/flags 입력을 처리할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "작업 처리 완료",
            body: "모든 메시지 정상",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));
    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "/에러|메시지/i" },
    });

    expect(screen.getByText("빌드 에러 코드 500")).toBeInTheDocument();
    expect(screen.getByText("/에러|메시지/i")).toBeInTheDocument();
  });

  it("정규식 모드에서 닫히지 않은 슬래시 패턴은 에러로 처리한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));
    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "/에러" },
    });

    expect(
      screen.getByText("정규식 패턴이 닫히지 않았습니다. /패턴/ 또는 /패턴/플래그 형식으로 입력하세요."),
    ).toBeInTheDocument();
    expect(screen.queryByText("빌드 에러 코드 500")).not.toBeInTheDocument();
  });

  it("정규식 모드에서 잘못된 플래그 입력은 에러로 처리한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));
    fireEvent.change(screen.getByLabelText("알림 검색"), {
      target: { value: "/에러/q" },
    });

    expect(screen.getByText("정규식 플래그가 유효하지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByText("빌드 에러 코드 500")).not.toBeInTheDocument();
  });

  it("정규식 모드에서 입력 힌트를 노출한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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

    expect(screen.queryByText(/정규식 예시:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "검색 모드: 정규식(2)" }));

    expect(screen.getByText(/정규식 예시: /)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("정규식 검색 (/error|warn/i, /error/gi)")).toBeInTheDocument();
  });

  it("검색어 힌트에서 최근 검색어를 저장하고 재적용할 수 있다", () => {
    window.localStorage.clear();
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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

    fireEvent.change(searchInput, { target: { value: "빌드 에러" } });
    fireEvent.keyDown(searchInput, { key: "Enter" });
    fireEvent.click(screen.getByLabelText("검색어 지우기"));

    const historyItem = screen.getByText("T:");
    expect(historyItem).toBeInTheDocument();
    expect(screen.getByText("먼저 기록")).toBeInTheDocument();
    expect(screen.getByText("다음 적용")).toBeInTheDocument();
    expect(screen.getAllByText("마지막 정리").length).toBeGreaterThan(0);
    expect(screen.getByText("최근 검색어를 고르고 다시 적용한 뒤 필요 없는 기록을 정리합니다.")).toBeInTheDocument();

    fireEvent.click(historyItem.closest("button") as HTMLButtonElement);
    expect(searchInput).toHaveValue("빌드 에러");
  });

  it("최근 검색어 적용 시 입력 포커스가 유지된다", () => {
    window.localStorage.setItem(
      "lum_notification_search_history_v1",
      JSON.stringify([
        {
          mode: "token",
          query: "빌드 히스토리",
          ts: 1,
        },
      ]),
    );

    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);

    fireEvent.click(screen.getByLabelText("최근 검색어 빌드 히스토리 적용"));
    expect(searchInput).toHaveValue("빌드 히스토리");
    expect(searchInput).toHaveFocus();
  });

  it("최근 검색어는 최신 5개까지만 노출된다", () => {
    window.localStorage.setItem(
      "lum_notification_search_history_v1",
      JSON.stringify([
        { mode: "token", query: "1", ts: 6 },
        { mode: "token", query: "2", ts: 7 },
        { mode: "token", query: "3", ts: 8 },
        { mode: "token", query: "4", ts: 9 },
        { mode: "token", query: "5", ts: 10 },
        { mode: "token", query: "6", ts: 11 },
      ]),
    );

    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);

    expect(screen.getByLabelText("최근 검색어 6 적용")).toBeInTheDocument();
    expect(screen.getByLabelText("최근 검색어 2 적용")).toBeInTheDocument();
    expect(screen.queryByLabelText("최근 검색어 1 적용")).not.toBeInTheDocument();
  });

  it("검색 기록 전체 삭제 버튼으로 히스토리 스토리지를 비울 수 있다", () => {
    window.localStorage.setItem(
      "lum_notification_search_history_v1",
      JSON.stringify([
        {
          mode: "token",
          query: "임시 검색어 1",
          ts: 1,
        },
        {
          mode: "token",
          query: "임시 검색어 2",
          ts: 2,
        },
      ]),
    );

    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);

    expect(screen.getByText("임시 검색어 1")).toBeInTheDocument();
    expect(screen.getByText("임시 검색어 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "검색 기록 전체 삭제" }));

    expect(screen.queryByText("임시 검색어 1")).not.toBeInTheDocument();
    expect(screen.queryByText("임시 검색어 2")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("lum_notification_search_history_v1")).toBe("[]");
  });

  it("개별 검색 기록은 항목별로 삭제할 수 있다", () => {
    window.localStorage.setItem(
      "lum_notification_search_history_v1",
      JSON.stringify([
        {
          mode: "token",
          query: "임시 검색어 1",
          ts: 1,
        },
        {
          mode: "regex",
          query: "임시 검색어 2",
          ts: 2,
        },
      ]),
    );

    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);

    expect(screen.getByText("임시 검색어 1")).toBeInTheDocument();
    expect(screen.getByText("임시 검색어 2")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("최근 검색어 임시 검색어 1 삭제"));

    expect(screen.queryByText("임시 검색어 1")).not.toBeInTheDocument();
    expect(screen.getByText("임시 검색어 2")).toBeInTheDocument();
  });

  it("검색 모드 토글은 선택된 모드별 색상 대비를 보여준다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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

    const tokenButton = screen.getByRole("button", { name: "검색 모드: 토큰(1)" });
    const regexButton = screen.getByRole("button", { name: "검색 모드: 정규식(2)" });

    expect(tokenButton.className).toContain("bg-cyan-400/16");
    expect(regexButton.className).toContain("hover:bg-amber-400/[0.08]");

    fireEvent.click(regexButton);

    expect(regexButton).toHaveAttribute("aria-pressed", "true");
    expect(regexButton.className).toContain("bg-amber-400/16");
    expect(tokenButton.className).toContain("hover:bg-cyan-400/[0.08]");
  });

  it("히스토리 패널에서 방향키로 검색 기록을 선택하고 Enter로 적용할 수 있다", () => {
    window.localStorage.setItem(
      "lum_notification_search_history_v1",
      JSON.stringify([
        {
          mode: "token",
          query: "구버전 검색",
          ts: 1,
        },
        {
          mode: "token",
          query: "최신 검색",
          ts: 2,
        },
      ]),
    );

    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);

    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    fireEvent.keyDown(searchInput, { key: "Enter" });

    expect(searchInput).toHaveValue("최신 검색");
    expect(searchInput).toHaveFocus();
  });

  it("선택한 검색 기록은 키보드 Delete/Backspace로 삭제할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, { target: { value: "삭제 대상 검색" } });
    fireEvent.blur(searchInput);
    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.focus(searchInput);

    const historyDeleteButton = screen.getByLabelText("최근 검색어 삭제 대상 검색 삭제");
    expect(historyDeleteButton).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    fireEvent.keyDown(searchInput, { key: "Delete" });

    expect(screen.queryByLabelText("최근 검색어 삭제 대상 검색 삭제")).not.toBeInTheDocument();
  });

  it.each(["Enter", " "])("검색 기록 항목 버튼에서 %s 키로 항목을 적용할 수 있다", (activationKey) => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, { target: { value: "엔터 적용 검색" } });
    fireEvent.blur(searchInput);
    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.focus(searchInput);

    const historyItemButton = screen.getByLabelText("최근 검색어 엔터 적용 검색 적용");
    fireEvent.keyDown(historyItemButton, { key: activationKey });
    expect(searchInput).toHaveValue("엔터 적용 검색");
    expect(screen.queryByLabelText("최근 검색어 엔터 적용 검색 삭제")).not.toBeInTheDocument();
  });

  it.each(["Enter", " ", "Delete", "Backspace"])("검색 기록 삭제 버튼에서 %s 키로 항목을 삭제할 수 있다", (activationKey) => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, { target: { value: "엔터 적용 검색" } });
    fireEvent.blur(searchInput);
    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.focus(searchInput);

    const deleteButton = screen.getByLabelText("최근 검색어 엔터 적용 검색 삭제");
    fireEvent.keyDown(deleteButton, { key: activationKey });

    expect(screen.queryByLabelText("최근 검색어 엔터 적용 검색 삭제")).not.toBeInTheDocument();
    expect(searchInput).toHaveValue("");
  });

  it("검색 기록 항목 버튼에서 Backspace/Delete 키로 삭제할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, { target: { value: "삭제 버튼 키보드 삭제" } });
    fireEvent.blur(searchInput);
    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.focus(searchInput);

    const historyDeleteButton = screen.getByLabelText("최근 검색어 삭제 버튼 키보드 삭제 삭제");
    fireEvent.keyDown(historyDeleteButton, { key: "Delete" });

    expect(screen.queryByLabelText("최근 검색어 삭제 버튼 키보드 삭제 삭제")).not.toBeInTheDocument();
  });

  it("단축키 1/2로 검색 모드를 전환할 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "빌드 에러 코드 500",
            body: "에러 메시지 분석",
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

    const dialog = screen.getByRole("dialog", { name: "알림 센터" });

    fireEvent.keyDown(dialog, { key: "2" });
    expect(screen.getByRole("button", { name: "검색 모드: 정규식(2)" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(dialog, { key: "1" });
    expect(screen.getByRole("button", { name: "검색 모드: 토큰(1)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Ctrl/Cmd + C로 검색어를 비울 수 있다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "알림",
            body: "메시지",
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
    fireEvent.change(searchInput, { target: { value: "알림" } });
    expect(searchInput).toHaveValue("알림");

    fireEvent.keyDown(screen.getByRole("dialog", { name: "알림 센터" }), {
      key: "c",
      ctrlKey: true,
    });
    expect(searchInput).toHaveValue("");

    fireEvent.change(searchInput, { target: { value: "메시지" } });
    expect(searchInput).toHaveValue("메시지");

    fireEvent.keyDown(screen.getByRole("dialog", { name: "알림 센터" }), {
      key: "c",
      metaKey: true,
    });
    expect(searchInput).toHaveValue("");
  });

  it("Enter 키로 검색/필터링된 목록의 첫 항목 닫기 버튼으로 포커스 이동한다", () => {
    render(
      <NotificationCenter
        notifications={[
          {
            id: "1",
            type: "command",
            title: "cmd-1",
            body: "첫 번째 알림",
            timestamp: 1_000,
            read: false,
          },
          {
            id: "2",
            type: "agent",
            title: "agent-2",
            body: "두 번째 알림",
            timestamp: 2_000,
            read: false,
          },
        ]}
        unreadCount={2}
        onMarkAllRead={vi.fn()}
        onDismiss={vi.fn()}
        onDismissByIds={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "알림 센터" }), { key: "Enter" });
    expect(screen.getByLabelText("cmd-1 알림 닫기")).toHaveFocus();
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
