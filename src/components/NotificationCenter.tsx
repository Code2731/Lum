import React, { useRef, useEffect } from "react";
import { Bell, Terminal, Bot, Wrench, Layers, X, CheckCheck, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { AppNotification, NotifType } from "../hooks/useNotificationCenter";

interface Props {
  notifications: AppNotification[];
  unreadCount: number;
  panelId?: string;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
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
  notifications, unreadCount, panelId, onMarkAllRead, onDismiss, onClear, onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const getPopupElements = () => {
    if (!panelRef.current) return [];
    return Array.from(panelRef.current.querySelectorAll<HTMLElement>(popupFocusables));
  };

  const handlePopupTabTrap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;

    const focusables = getPopupElements();
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    const isActiveInside = active && panelRef.current?.contains(active as Node);

    if (e.shiftKey) {
      if (!isActiveInside || active === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (isActiveInside && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handlePopupArrowNav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

    const focusables = getPopupElements();
    if (focusables.length === 0) return;

    const active = document.activeElement;
    const currentIndex = focusables.indexOf(active as HTMLElement);
    const nextIndex = (() => {
      if (currentIndex < 0) {
        return 0;
      }
      if (e.key === "ArrowDown") {
        return (currentIndex + 1) % focusables.length;
      }
      return (currentIndex - 1 + focusables.length) % focusables.length;
    })();

    e.preventDefault();
    focusables[nextIndex]?.focus();
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []); // 리스너는 한 번만 등록, 최신 onClose는 ref를 통해 참조

  return (
    <div
      id={panelId}
      role="dialog"
      aria-label="알림 센터"
      ref={panelRef}
      className="absolute top-full right-0 mt-1 w-80 max-h-[480px] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
      onKeyDown={(e) => {
        handlePopupTabTrap(e);
        handlePopupArrowNav(e);
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <Bell size={12} className="text-accent shrink-0" />
        <span className="text-[11px] font-semibold text-white/80 flex-1">알림 센터</span>
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
            <p className="text-[11px]">알림이 없습니다</p>
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
                  <p className={`text-[11px] font-medium ${n.read ? "text-white/45" : "text-white/75"}`}>
                    {n.title}
                  </p>
                  <p className="text-[10px] text-white/35 mt-0.5 break-words leading-relaxed">{n.body}</p>
                  <p className="text-[9px] text-white/20 mt-1">{timeAgo(n.timestamp)}</p>
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
