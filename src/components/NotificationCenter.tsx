import React, { useRef, useEffect } from "react";
import { Bell, Terminal, Bot, Wrench, Layers, X, CheckCheck, Trash2 } from "lucide-react";
import type { AppNotification, NotifType } from "../hooks/useNotificationCenter";

interface Props {
  notifications: AppNotification[];
  unreadCount: number;
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

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

const NotificationCenter: React.FC<Props> = ({
  notifications, unreadCount, onMarkAllRead, onDismiss, onClear, onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-1 w-80 max-h-[480px] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <Bell size={12} className="text-accent shrink-0" />
        <span className="text-[11px] font-semibold text-white/80 flex-1">알림 센터</span>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="text-white/30 hover:text-accent transition-colors p-0.5 rounded"
            title="모두 읽음"
          >
            <CheckCheck size={11} />
          </button>
        )}
        {notifications.length > 0 && (
          <button
            onClick={onClear}
            className="text-white/30 hover:text-red-400 transition-colors p-0.5 rounded"
            title="전체 삭제"
          >
            <Trash2 size={11} />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded"
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
                  onClick={() => onDismiss(n.id)}
                  className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-white/20 hover:text-white/50 transition-all p-0.5"
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
