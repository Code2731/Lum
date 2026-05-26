import React, { useRef, useEffect } from "react";
import { Bell, Terminal, Bot, Wrench, Layers, X, CheckCheck, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { AppNotification, NotifType } from "../hooks/useNotificationCenter";

interface Props {
  notifications: AppNotification[];
  unreadCount: number;
  panelId?: string;
  maxHeight?: number;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  closeOnDocument?: boolean;
}

const TYPE_ICON: Record<NotifType, React.ReactNode> = {
  command: <Terminal size={11} />,
  agent: <Bot size={11} />,
  healing: <Wrench size={11} />,
  env: <Layers size={11} />,
};

const TYPE_COLOR: Record<NotifType, string> = {
  command: "text-blue-400",
  agent: "text-accent",
  healing: "text-yellow-400",
  env: "text-green-400",
};
const popupFocusables = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

const NotificationCenter: React.FC<Props> = ({
  notifications,
  unreadCount,
  panelId,
  maxHeight,
  onMarkAllRead,
  onDismiss,
  onClear,
  onClose,
  closeOnDocument = true,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const getPopupElements = () => {
    if (!panelRef.current) return [];
    return Array.from(panelRef.current.querySelectorAll<HTMLElement>(popupFocusables));
  };

  const handlePopupTabTrap = (e: React.KeyboardEvent): boolean => {
    if (e.key !== "Tab") return false;

    const focusables = getPopupElements();
    if (focusables.length === 0) return false;

    const active = document.activeElement;
    const currentIndex = focusables.indexOf(active as HTMLElement);
    const nextIndex = (() => {
      if (currentIndex < 0) {
        return 0;
      }
      if (e.shiftKey) {
        return (currentIndex - 1 + focusables.length) % focusables.length;
      }
      return (currentIndex + 1) % focusables.length;
    })();

    e.preventDefault();
    focusables[nextIndex]?.focus();
    return true;
  };

  const handlePopupArrowNav = (e: React.KeyboardEvent): boolean => {
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) return false;

    const focusables = getPopupElements();
    if (focusables.length === 0) return false;

    const active = document.activeElement;
    const currentIndex = focusables.indexOf(active as HTMLElement);
    const nextIndex = (() => {
      if (currentIndex < 0) {
        return 0;
      }
      if (e.key === "ArrowDown") {
        return (currentIndex + 1) % focusables.length;
      }
      if (e.key === "Home") {
        return 0;
      }
      if (e.key === "End") {
        return focusables.length - 1;
      }
      return (currentIndex - 1 + focusables.length) % focusables.length;
    })();

    e.preventDefault();
    focusables[nextIndex]?.focus();
    return true;
  };

  useEffect(() => {
    if (!closeOnDocument) return;

    const handleOutsidePointer = (target: EventTarget | null) => {
      if (panelRef.current && !panelRef.current.contains(target as Node)) {
        onCloseRef.current();
      }
    };
    const mouseHandler = (e: MouseEvent) => {
      handleOutsidePointer(e.target);
    };
    const touchHandler = (e: TouchEvent) => {
      const touchTarget = e.touches[0]?.target ?? e.target;
      handleOutsidePointer(touchTarget);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", mouseHandler);
    document.addEventListener("touchstart", touchHandler);
    document.addEventListener("keydown", keyHandler, { capture: true });
    return () => {
      document.removeEventListener("mousedown", mouseHandler);
      document.removeEventListener("touchstart", touchHandler);
      document.removeEventListener("keydown", keyHandler, { capture: true });
    };
  }, [closeOnDocument]); // 리스너는 한 번만 등록, 최신 onClose는 ref를 통해 참조

  useEffect(() => {
    const focusables = getPopupElements();
    if (focusables.length === 0) return;
    requestAnimationFrame(() => {
      focusables[0]?.focus();
    });
  }, []);

  const popupPositionClass = "";

  return (
    <div
      id={panelId}
      role="dialog"
      aria-label="알림 센터"
      ref={panelRef}
      className={`${popupPositionClass} w-80 flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl z-[1400] overflow-hidden`}
      style={{
        maxHeight: typeof maxHeight === "number" && maxHeight > 0
          ? `${maxHeight}px`
          : "min(440px,calc(100vh-3.5rem))",
      }}
      onKeyDown={(e) => {
        const handled = handlePopupTabTrap(e) || handlePopupArrowNav(e);
        if (handled) {
          e.stopPropagation();
        }
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <Bell size={12} className="text-accent shrink-0" />
        <span className="text-sm font-semibold text-white/80 flex-1">알림 센터</span>
        {unreadCount > 0 && (
          <IconButton tooltip="모두 읽음" onClick={onMarkAllRead}
            aria-label="모든 알림 읽음 처리"
            className="text-white/30 hover:text-accent transition-colors p-0.5 rounded">
            <CheckCheck size={11} />
          </IconButton>
        )}
        {notifications.length > 0 && (
          <IconButton
            tooltip="전체 삭제"
            confirm={{
              title: "알림 전체 삭제",
              description: `${notifications.length}개 알림이 모두 삭제됩니다.`,
            }}
            onClick={onClear}
            aria-label="알림 전체 삭제"
            className="text-white/30 hover:text-red-400 transition-colors p-0.5 rounded"
          >
            <Trash2 size={11} />
          </IconButton>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="알림 센터 닫기"
          className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X size={11} />
        </button>
      </div>

      {/* 알림 목록 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/20">
            <Bell size={24} />
            <p className="text-sm">알림이 없습니다</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                  n.read ? "bg-transparent border-white/3" : "bg-white/3 border-white/8"
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${TYPE_COLOR[n.type]}`}>
                  {TYPE_ICON[n.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${n.read ? "text-white/45" : "text-white/75"}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-white/35 mt-0.5 break-words leading-relaxed">{n.body}</p>
                  <p className="text-xs text-white/20 mt-1">{timeAgo(n.timestamp)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(n.id)}
                  aria-label={`${n.title} 알림 닫기`}
                  className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 text-white/20 hover:text-white/50 transition-all p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
