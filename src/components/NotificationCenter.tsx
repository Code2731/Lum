import React, { useRef, useEffect, useMemo, useState } from "react";
import { Bell, Terminal, Bot, Wrench, Layers, X, CheckCheck, Trash2, Copy, Filter, Search } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { AppNotification, NotifType } from "../hooks/useNotificationCenter";
import { getActiveFocusableIndex, isPointerOutsideTargets } from "../utils/pointerGuard";

interface Props {
  notifications: AppNotification[];
  unreadCount: number;
  panelId?: string;
  maxHeight?: number;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  onMarkByIds?: (ids: string[]) => void;
  onDismissByIds?: (ids: string[]) => void;
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

const TYPE_LABEL: Record<NotifType, string> = {
  command: "커맨드",
  agent: "에이전트",
  healing: "치유",
  env: "환경",
};

const TYPE_COLOR: Record<NotifType, string> = {
  command: "text-blue-400",
  agent: "text-accent",
  healing: "text-yellow-400",
  env: "text-green-400",
};

type FilterType = "all" | NotifType;
const FILTER_LABELS: Record<FilterType, string> = {
  all: "전체",
  command: "커맨드",
  agent: "에이전트",
  healing: "치유",
  env: "환경",
};
const FILTER_TYPES: FilterType[] = ["all", "command", "agent", "healing", "env"];
type SearchMode = "token" | "regex";
const popupFocusables = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SearchQueryParseResult = {
  positive: string[];
  negative: string[];
  hasUnclosedQuote: boolean;
};

type SearchQueryToken = {
  term: string;
  excluded: boolean;
};

function parseSearchQueries(query: string): SearchQueryParseResult {
  const tokens: SearchQueryToken[] = [];
  const trimmedQuery = query.trim();
  let hasUnclosedQuote = false;
  let i = 0;

  const pushToken = (rawToken: string, excluded: boolean) => {
    const normalized = rawToken.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    tokens.push({ term: normalized, excluded });
  };

  const isWhitespace = (char: string) => char === " " || char === "\t" || char === "\n" || char === "\r";

  while (i < trimmedQuery.length) {
    while (i < trimmedQuery.length && isWhitespace(trimmedQuery[i])) {
      i += 1;
    }
    if (i >= trimmedQuery.length) {
      break;
    }

    let excluded = false;
    if (trimmedQuery[i] === "-") {
      excluded = true;
      i += 1;
      while (i < trimmedQuery.length && isWhitespace(trimmedQuery[i])) {
        i += 1;
      }
      if (i >= trimmedQuery.length) {
        break;
      }
    }

    if (trimmedQuery[i] === "\"") {
      const close = trimmedQuery.indexOf("\"", i + 1);
      if (close === -1) {
        hasUnclosedQuote = true;
        pushToken(trimmedQuery.slice(i + 1), excluded);
        break;
      }
      pushToken(trimmedQuery.slice(i + 1, close), excluded);
      i = close + 1;
      continue;
    }

    let next = i;
    while (next < trimmedQuery.length && !isWhitespace(trimmedQuery[next])) {
      next += 1;
    }
    pushToken(trimmedQuery.slice(i, next), excluded);
    i = next;
  }

  return tokens.reduce<SearchQueryParseResult>(
    (acc, token) => {
      if (token.excluded) {
        acc.negative.push(token.term);
      } else {
        acc.positive.push(token.term);
      }
      return acc;
    },
    { positive: [], negative: [], hasUnclosedQuote },
  );
}

function renderHighlightedText(text: string, queries: string[]): React.ReactNode {
  if (queries.length === 0) {
    return text;
  }

  const sortedQueries = [...queries].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${sortedQueries.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;
    const isMatch = queries.some((query) => query.toLowerCase() === part.toLowerCase());
    if (!isMatch) {
      return <span key={`${text}-${index}`}>{part}</span>;
    }
    return <mark key={`${text}-${index}`} className="bg-yellow-300/20 text-yellow-100">{part}</mark>;
  });
}

function renderHighlightedTextByRegex(text: string, regex: RegExp | null): React.ReactNode {
  if (!regex) {
    return text;
  }

  const globalRegex = new RegExp(regex.source, `${regex.flags.includes("g") ? "" : "g"}${regex.flags}`);
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let matchCount = 0;
  let match: RegExpExecArray | null;

  while ((match = globalRegex.exec(text)) !== null) {
    if (match[0].length === 0) {
      globalRegex.lastIndex += 1;
      continue;
    }

    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <mark
        key={`${text}-match-${matchCount}`}
        className="bg-yellow-300/20 text-yellow-100"
      >
        {match[0]}
      </mark>,
    );
    matchCount += 1;
    lastIndex = globalRegex.lastIndex;
  }

  if (!matchCount) {
    return text;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

type ParsedRegexInput = {
  errorMessage: string;
  pattern: string;
  flags: string;
  display: string;
};

function parseRegexInput(rawQuery: string): ParsedRegexInput {
  const query = rawQuery.trim();
  if (!query.startsWith("/")) {
    return {
      errorMessage: "",
      pattern: query,
      flags: "i",
      display: `/${query}/`,
    };
  }

  const slashIdx = query.lastIndexOf("/");
  if (slashIdx <= 0) {
    return {
      errorMessage: "정규식 패턴이 닫히지 않았습니다. /패턴/ 또는 /패턴/플래그 형식으로 입력하세요.",
      pattern: query,
      flags: "i",
      display: `/${query}`,
    };
  }

  const extractedPattern = query.slice(1, slashIdx);
  const extractedFlags = query.slice(slashIdx + 1);
  const validFlags = new Set(["i", "g", "m", "s", "u", "y"]);
  const invalidFlags = extractedFlags
    .toLowerCase()
    .split("")
    .filter((flag) => !validFlags.has(flag));
  if (invalidFlags.length > 0) {
    return {
      errorMessage: "정규식 플래그가 유효하지 않습니다.",
      pattern: extractedPattern,
      flags: extractedFlags,
      display: `/${extractedPattern}/${extractedFlags}`,
    };
  }

  const normalizedFlags = extractedFlags
    .toLowerCase()
    .split("")
    .filter((value, index, self) => self.indexOf(value) === index)
    .join("");

  if (extractedFlags && normalizedFlags.length !== extractedFlags.length) {
    return {
      errorMessage: "정규식 플래그가 유효하지 않습니다.",
      pattern: extractedPattern,
      flags: normalizedFlags,
      display: `/${extractedPattern}/${extractedFlags}`,
    };
  }

  return {
    errorMessage: "",
    pattern: extractedPattern,
    flags: normalizedFlags,
    display: `/${extractedPattern}/${extractedFlags}`,
  };
}

function buildRegexFlags(flags: string): string {
  const normalized = new Set(["i", ...flags.toLowerCase().split("")]);
  return Array.from(normalized).join("");
}

const NotificationCenter: React.FC<Props> = ({
  notifications,
  unreadCount,
  panelId,
  maxHeight,
  onMarkAllRead,
  onDismiss,
  onMarkByIds,
  onDismissByIds,
  onClear,
  onClose,
  closeOnDocument = true,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [searchMode, setSearchMode] = useState<SearchMode>("token");
  const [searchQuery, setSearchQuery] = useState("");

  const orderedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      if (a.read !== b.read) {
        return a.read ? 1 : -1;
      }
      return b.timestamp - a.timestamp;
    });
  }, [notifications]);

  useEffect(() => {
    if (unreadCount === 0 && showUnreadOnly) {
      setShowUnreadOnly(false);
    }
  }, [unreadCount, showUnreadOnly]);

  const normalizedSearchQuery = useMemo(() => searchQuery.trim(), [searchQuery]);
  const searchQueryParseResult = useMemo(
    () => (searchMode === "token" ? parseSearchQueries(normalizedSearchQuery) : {
      positive: [],
      negative: [],
      hasUnclosedQuote: false,
    }),
    [normalizedSearchQuery, searchMode],
  );
  const parsedRegex = useMemo(
    () => (searchMode === "regex" ? parseRegexInput(normalizedSearchQuery) : null),
    [normalizedSearchQuery, searchMode],
  );
  const normalizedSearchQueries = useMemo(() => searchQueryParseResult.positive, [searchQueryParseResult]);
  const excludedSearchQueries = useMemo(() => searchQueryParseResult.negative, [searchQueryParseResult]);
  const hasUnclosedQuote = useMemo(() => searchQueryParseResult.hasUnclosedQuote, [searchQueryParseResult]);
  const regexSearchError = useMemo(() => {
    if (searchMode !== "regex" || !normalizedSearchQuery) {
      return "";
    }
    if (parsedRegex?.errorMessage) {
      return parsedRegex.errorMessage;
    }
    try {
      new RegExp(parsedRegex?.pattern ?? "", buildRegexFlags(parsedRegex?.flags ?? ""));
      return "";
    } catch (err) {
      return String((err as Error).message);
    }
  }, [normalizedSearchQuery, parsedRegex, searchMode]);
  const regexSearch = useMemo(() => {
    if (searchMode !== "regex" || !normalizedSearchQuery || regexSearchError) {
      return null;
    }
    return new RegExp(parsedRegex?.pattern ?? "", buildRegexFlags(parsedRegex?.flags ?? ""));
  }, [normalizedSearchQuery, parsedRegex, searchMode, regexSearchError]);

  const { displayedNotifications, matchedTitleCount, matchedBodyCount } = useMemo(() => {
    const hasSearchQuery = searchMode === "token"
      ? normalizedSearchQueries.length + excludedSearchQueries.length > 0
      : Boolean(normalizedSearchQuery);
    const afterUnreadFilter = showUnreadOnly ? orderedNotifications.filter((n) => !n.read) : orderedNotifications;
    const afterTypeFilter = typeFilter === "all"
      ? afterUnreadFilter
      : afterUnreadFilter.filter((n) => n.type === typeFilter);

    if (!hasSearchQuery) {
      return {
        displayedNotifications: afterTypeFilter,
        matchedTitleCount: 0,
        matchedBodyCount: 0,
      };
    }

    let titleMatchCount = 0;
    let bodyMatchCount = 0;
    const isMatch = (text: string, queries: string[]) => queries.some((query) => text.includes(query));
    const matchList: Array<{
      notification: AppNotification;
      score: number;
    }> = [];

    afterTypeFilter.forEach((n) => {
      const normalizedTitle = n.title.toLowerCase();
      const normalizedBody = n.body.toLowerCase();
      const normalizedText = `${normalizedTitle} ${normalizedBody}`;
      if (searchMode === "regex") {
        if (!regexSearch) return;
        if (!regexSearch.test(normalizedText)) return;
        const titleMatched = regexSearch.test(normalizedTitle);
        const bodyMatched = regexSearch.test(normalizedBody);
        if (titleMatched) titleMatchCount += 1;
        if (bodyMatched) bodyMatchCount += 1;
        matchList.push({
          notification: n,
          score: 0,
        });
        return;
      }

      const matchedAllQueries = normalizedSearchQueries.every((query) => normalizedText.includes(query));
      const excludedMatched = excludedSearchQueries.some((query) => normalizedText.includes(query));
      if (!matchedAllQueries || excludedMatched) return;

      const titleMatched = isMatch(normalizedTitle, normalizedSearchQueries);
      const bodyMatched = isMatch(normalizedBody, normalizedSearchQueries);
      const titleAllMatched = normalizedSearchQueries.every((query) => normalizedTitle.includes(query));
      const bodyAllMatched = normalizedSearchQueries.every((query) => normalizedBody.includes(query));
      if (titleMatched) titleMatchCount += 1;
      if (bodyMatched) bodyMatchCount += 1;
      const titleKeywordMatchCount = normalizedSearchQueries.filter((query) => normalizedTitle.includes(query)).length;
      const bodyKeywordMatchCount = normalizedSearchQueries.filter((query) => normalizedBody.includes(query)).length;
      const score = (titleAllMatched ? 80 : 0)
        + (bodyAllMatched ? 60 : 0)
        + (titleKeywordMatchCount * 20)
        + (bodyKeywordMatchCount * 5);
      matchList.push({
        notification: n,
        score,
      });
    });

    const matched = matchList
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.notification.read !== right.notification.read) {
          return left.notification.read ? 1 : -1;
        }
        return right.notification.timestamp - left.notification.timestamp;
      })
      .map((item) => item.notification);

    return {
      displayedNotifications: matched,
      matchedTitleCount: titleMatchCount,
      matchedBodyCount: bodyMatchCount,
    };
  }, [
    orderedNotifications,
    showUnreadOnly,
    typeFilter,
    normalizedSearchQueries,
    excludedSearchQueries,
    searchMode,
    regexSearch,
  ]);

  const displayedNotificationIds = useMemo(
    () => displayedNotifications.map((n) => n.id),
    [displayedNotifications],
  );
  const displayedUnreadIds = useMemo(
    () => displayedNotifications.filter((n) => !n.read).map((n) => n.id),
    [displayedNotifications],
  );

  useEffect(() => {
    if (typeFilter !== "all" && !notifications.some((n) => n.type === typeFilter)) {
      setTypeFilter("all");
    }
  }, [notifications, typeFilter]);

  const getPopupElements = () => {
    if (!panelRef.current) return [];
    return Array.from(panelRef.current.querySelectorAll<HTMLElement>(popupFocusables));
  };

  const focusFirstNotificationCloseButton = (): boolean => {
    if (!panelRef.current) return false;
    const firstAlert = panelRef.current.querySelector<HTMLElement>('[role="alert"]');
    if (!firstAlert) return false;

    const closeButton = firstAlert.querySelector<HTMLButtonElement>(
      "button[aria-label$=\" 알림 닫기\"]",
    );
    if (closeButton) {
      closeButton.focus();
      return true;
    }

    const fallbackButton = firstAlert.querySelector<HTMLButtonElement>("button");
    if (fallbackButton) {
      fallbackButton.focus();
      return true;
    }

    return false;
  };

  const isTextInputFocused = (): boolean => {
    const active = document.activeElement;
    return (
      active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement
    );
  };

  const handlePopupTabTrap = (e: React.KeyboardEvent): boolean => {
    if (isTextInputFocused()) return false;
    if (e.key !== "Tab") return false;

    const focusables = getPopupElements();
    if (focusables.length === 0) return false;

    const active = document.activeElement;
    const currentIndex = getActiveFocusableIndex(focusables, active);
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
    if (isTextInputFocused()) return false;
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) return false;

    const focusables = getPopupElements();
    if (focusables.length === 0) return false;

    const active = document.activeElement;
    const currentIndex = getActiveFocusableIndex(focusables, active);
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

  const handlePopupActionKeys = (e: React.KeyboardEvent): boolean => {
    if (isTextInputFocused()) return false;
    const normalizedKey = e.key.toLowerCase();
    const isClearSearchShortcut = (e.ctrlKey || e.metaKey) && normalizedKey === "c";
    if ((e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) && !isClearSearchShortcut) {
      return false;
    }

    if (normalizedKey === "1") {
      setSearchMode("token");
      e.preventDefault();
      return true;
    }

    if (normalizedKey === "2") {
      setSearchMode("regex");
      e.preventDefault();
      return true;
    }

    if (normalizedKey === "m") {
      if (displayedUnreadIds.length === 0 || !onMarkByIds) {
        return false;
      }
      onMarkByIds(displayedUnreadIds);
      e.preventDefault();
      return true;
    }

    if (normalizedKey === "d") {
      if (displayedNotificationIds.length === 0) {
        return false;
      }
      if (onDismissByIds) {
        onDismissByIds(displayedNotificationIds);
        e.preventDefault();
        return true;
      }
      displayedNotificationIds.forEach((id) => onDismiss(id));
      e.preventDefault();
      return true;
    }

    if (normalizedKey === "r") {
      if (notifications.length === 0) {
        return false;
      }
      onMarkAllRead();
      e.preventDefault();
      return true;
    }

    if (normalizedKey === "f") {
      if (unreadCount === 0) {
        return false;
      }
      setShowUnreadOnly((prev) => !prev);
      e.preventDefault();
      return true;
    }

    if (isClearSearchShortcut) {
      if (!searchQuery) {
        return false;
      }
      setSearchQuery("");
      e.preventDefault();
      return true;
    }

    if (normalizedKey === "enter") {
      const didFocus = focusFirstNotificationCloseButton();
      if (!didFocus) {
        return false;
      }
      e.preventDefault();
      return true;
    }

    if (normalizedKey === "/") {
      searchInputRef.current?.focus();
      e.preventDefault();
      return true;
    }

    return false;
  };

  useEffect(() => {
    if (!closeOnDocument) return;

    const handleOutsidePointer = (target: EventTarget | null) => {
      if (isPointerOutsideTargets(target, [panelRef.current])) {
        onCloseRef.current();
      }
    };
    const pointerHandler = (e: PointerEvent) => {
      handleOutsidePointer(e.target);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("pointerdown", pointerHandler);
    document.addEventListener("keydown", keyHandler, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", pointerHandler);
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
      className={`${popupPositionClass} w-full flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl z-[1400] overflow-hidden`}
      style={{
        maxHeight: typeof maxHeight === "number" && maxHeight > 0
          ? `${maxHeight}px`
          : "min(440px,calc(100vh-3.5rem))",
      }}
      onKeyDown={(e) => {
        const handled = handlePopupTabTrap(e) || handlePopupArrowNav(e) || handlePopupActionKeys(e);
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
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => setShowUnreadOnly((prev) => !prev)}
            aria-pressed={showUnreadOnly}
            aria-label={showUnreadOnly ? "전체 알림 보기" : "미확인 알림만 보기"}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/12 bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            <Filter size={11} />
            <span>{showUnreadOnly ? "전체 보기" : `미확인 ${unreadCount}개`}</span>
          </button>
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
      {notifications.length > 0 && (
        <div className="border-b border-white/5 px-2 py-1.5 flex items-start gap-1.5 bg-[#12171e]">
          <div className="w-full flex items-center gap-2">
            <div className="inline-flex rounded border border-white/12 bg-white/[0.05] text-[10px]">
              <button
                type="button"
                onClick={() => setSearchMode("token")}
                aria-pressed={searchMode === "token"}
                aria-label="검색 모드: 토큰(1)"
                className={`px-2 py-1 border-r border-white/12 ${searchMode === "token"
                  ? "bg-white/20 text-white"
                  : "text-white/65 hover:text-white/90"
                }`}
              >
                토큰(1)
              </button>
              <button
                type="button"
                onClick={() => setSearchMode("regex")}
                aria-pressed={searchMode === "regex"}
                aria-label="검색 모드: 정규식(2)"
                className={`px-2 py-1 ${searchMode === "regex"
                  ? "bg-white/20 text-white"
                  : "text-white/65 hover:text-white/90"
                }`}
              >
                정규식(2)
              </button>
            </div>
            <label htmlFor="notification-search" className="sr-only">
              알림 검색
            </label>
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-2 text-white/40" />
              <input
                id="notification-search"
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchMode === "regex"
                  ? "정규식 검색 (/error|warn/i, /error/gi)"
                  : "알림 제목/본문 검색"}
                className="w-full pl-6 pr-7 py-1.5 text-xs bg-white/[0.05] border border-white/12 rounded text-white/90 placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  className="absolute right-1.5 top-1.5 rounded text-white/50 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => setSearchQuery("")}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
          <div className="w-full px-2 pb-1.5 pt-0 flex flex-wrap items-center gap-1">
            {searchMode === "token" && (normalizedSearchQueries.length > 0 || excludedSearchQueries.length > 0) && (
              <>
                {normalizedSearchQueries.map((token) => (
                  <span
                    key={`inc-${token}`}
                    className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-[10px] text-emerald-100"
                  >
                    + {token}
                  </span>
                ))}
                {excludedSearchQueries.map((token) => (
                  <span
                    key={`exc-${token}`}
                    className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-rose-400/35 bg-rose-400/10 text-[10px] text-rose-100"
                  >
                    - {token}
                  </span>
                ))}
              </>
            )}
            {searchMode === "regex" && normalizedSearchQuery && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-sky-400/30 bg-sky-400/10 text-[10px] text-sky-100">
                {parsedRegex?.display}
              </span>
            )}
            {searchMode === "regex" && !normalizedSearchQuery && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-white/15 bg-white/[0.05] text-[10px] text-white/55">
                정규식 예시: /error/i, /error|warn/g, /에러/gi
              </span>
            )}
            {searchMode === "regex" && regexSearchError && (
              <span className="text-[10px] text-rose-300/90">
                정규식이 유효하지 않습니다.
              </span>
            )}
            {searchMode === "token" && hasUnclosedQuote && (
              <span className="text-[10px] text-amber-300/90">
                따옴표가 닫히지 않았습니다. 구문 검색은 정확히 닫힌 따옴표만 유효합니다.
              </span>
            )}
          </div>
          <div className="shrink-0 px-2 py-1.5 text-[10px] text-white/45">
            {displayedNotifications.length}건
            {normalizedSearchQuery
              ? ` · ${searchMode === "regex" ? (parsedRegex?.display ?? `/${normalizedSearchQuery}/`) : `"${normalizedSearchQuery}"`} · 제목: ${matchedTitleCount}건, 본문: ${matchedBodyCount}건`
              : ""}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {FILTER_TYPES.map((filterType) => {
              const count = filterType === "all"
                ? displayedNotificationIds.length
                : displayedNotifications.filter((n) => n.type === filterType).length;
              return (
                <button
                  key={filterType}
                  type="button"
                  onClick={() => setTypeFilter(filterType)}
                  aria-pressed={typeFilter === filterType}
                  className={`inline-flex shrink-0 text-[11px] px-2 py-1 rounded border transition-colors ${
                    typeFilter === filterType
                      ? "bg-accent/18 border-accent/45 text-accent"
                      : "bg-white/[0.03] border-white/10 text-white/55 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {FILTER_LABELS[filterType]}
                  <span className="ml-1 text-[10px] text-white/50">({count})</span>
                </button>
              );
            })}
          </div>
          {displayedNotificationIds.length > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {displayedUnreadIds.length > 0 && onMarkByIds && (
                <button
                  type="button"
                  onClick={() => onMarkByIds(displayedUnreadIds)}
                  aria-label="현재 보기 미확인 알림 모두 읽음"
                  className="inline-flex shrink-0 text-[11px] px-2 py-1 rounded border border-emerald-300/35 bg-emerald-400/14 text-emerald-100 hover:bg-emerald-400/22 transition-colors"
                >
                  <span>미확인 {displayedUnreadIds.length}개 읽음</span>
                  <span className="ml-1 text-[10px] text-emerald-100/80">[M]</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (onDismissByIds) {
                    onDismissByIds(displayedNotificationIds);
                    return;
                  }
                  displayedNotificationIds.forEach((id) => onDismiss(id));
                }}
                aria-label="현재 보기 항목 삭제"
                className="inline-flex shrink-0 text-[11px] px-2 py-1 rounded border border-white/15 bg-white/[0.04] text-white/55 hover:text-white hover:bg-white/[0.09] transition-colors"
              >
                <span>모두 삭제</span>
                <span className="ml-1 text-[10px] text-white/70">[D]</span>
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0">
        {displayedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/20">
            <Bell size={24} />
            {searchQuery ? (
              <p className="text-sm">검색 조건에 맞는 알림이 없습니다</p>
            ) : (
              <p className="text-sm">{showUnreadOnly ? "미확인 알림이 없습니다" : "알림이 없습니다"}</p>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {displayedNotifications.map((n) => (
              <div
                key={n.id}
                role="alert"
                className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                  n.read ? "bg-transparent border-white/3" : "bg-white/3 border-white/8"
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${TYPE_COLOR[n.type]}`}>
                  {TYPE_ICON[n.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <p className={`text-sm font-medium ${n.read ? "text-white/45" : "text-white/75"}`}>
                      {searchMode === "regex"
                        ? renderHighlightedTextByRegex(n.title, regexSearch)
                        : renderHighlightedText(n.title, normalizedSearchQueries)}
                    </p>
                    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50 border border-white/12">
                      {TYPE_LABEL[n.type]}
                    </span>
                    {!n.read && (
                      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-400/12 text-emerald-100 border border-emerald-300/25">
                        미확인
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/35 mt-0.5 break-words leading-relaxed">
                    {searchMode === "regex"
                      ? renderHighlightedTextByRegex(n.body, regexSearch)
                      : renderHighlightedText(n.body, normalizedSearchQueries)}
                  </p>
                  <p className="text-xs text-white/20 mt-1">{timeAgo(n.timestamp)}</p>
                </div>
                <IconButton
                  tooltip="알림 텍스트 복사"
                  onClick={() => navigator.clipboard.writeText(`${n.title}\n${n.body}`).catch(() => {})}
                  className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-white/20 hover:text-white/50 transition-all p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Copy size={10} />
                </IconButton>
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
