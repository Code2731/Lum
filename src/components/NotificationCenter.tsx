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
  onOpenRecoveryFlow?: () => void;
  highlightRecovery?: boolean;
  autoFocusRecoveryAction?: boolean;
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

const TYPE_BADGE_CLASS: Record<NotifType, string> = {
  command: "border-sky-300/22 bg-sky-400/[0.1] text-sky-100/82",
  agent: "border-cyan-300/22 bg-cyan-400/[0.1] text-cyan-100/82",
  healing: "border-amber-300/22 bg-amber-400/[0.1] text-amber-100/82",
  env: "border-emerald-300/22 bg-emerald-400/[0.1] text-emerald-100/82",
};

const TYPE_META_HINT: Record<NotifType, string> = {
  command: "실행 흐름",
  agent: "에이전트 흐름",
  healing: "복구 흐름",
  env: "환경 흐름",
};

const TYPE_CARD_CLASS: Record<NotifType, string> = {
  command: "border-sky-300/20 bg-sky-400/[0.07]",
  agent: "border-cyan-300/20 bg-cyan-400/[0.08]",
  healing: "border-amber-300/24 bg-amber-400/[0.09]",
  env: "border-emerald-300/20 bg-emerald-400/[0.08]",
};

export interface NotificationTypeMeta {
  label: string;
  colorClass: string;
  badgeClass: string;
  hint: string;
  cardClass: string;
}

export function getNotificationTypeMeta(type: NotifType): NotificationTypeMeta {
  return {
    label: TYPE_LABEL[type],
    colorClass: TYPE_COLOR[type],
    badgeClass: TYPE_BADGE_CLASS[type],
    hint: TYPE_META_HINT[type],
    cardClass: TYPE_CARD_CLASS[type],
  };
}

export interface NotificationResultMeta {
  flowLabel: string;
  scopeLabel: string;
  description: string;
}

export function getNotificationResultMeta(hasSearchQuery: boolean, hasScopedFilter: boolean): NotificationResultMeta {
  return {
    flowLabel: hasSearchQuery ? "검색 반영" : "전체 흐름",
    scopeLabel: hasScopedFilter ? "필터 적용" : "최신 우선",
    description: hasSearchQuery
      ? "검색 결과를 먼저 보고, 아래에서 종류를 좁히거나 현재 보기만 정리합니다."
      : "최신 알림 흐름을 먼저 보고, 필요하면 종류별로 좁혀서 정리합니다.",
  };
}

export interface NotificationEmptyStateMeta {
  badges: [string, string, string];
  title: string;
  description: string;
}

export function getNotificationEmptyStateMeta(input: {
  hasSearchQuery: boolean;
  showUnreadOnly: boolean;
}): NotificationEmptyStateMeta {
  if (input.hasSearchQuery) {
    return {
      badges: ["검색 조정", "기록 재적용", "필터 확인"],
      title: "검색 조건에 맞는 알림이 없습니다",
      description: "검색어를 줄이거나 최근 검색 기록을 다시 적용해 보세요.",
    };
  }

  if (input.showUnreadOnly) {
    return {
      badges: ["전체 보기", "지난 흐름", "다시 확인"],
      title: "미확인 알림이 없습니다",
      description: "전체 보기로 전환하면 지난 알림 흐름을 다시 확인할 수 있습니다.",
    };
  }

  return {
    badges: ["다음 알림", "실행 흐름", "자동 복구"],
    title: "알림이 없습니다",
    description: "명령 실행, 에이전트 작업, 자동 복구 흐름이 생기면 여기에서 이어집니다.",
  };
}

export interface NotificationRecoveryMeta {
  badges: [string, string, string];
  helper: string;
  tone: "amber" | "cyan";
}

export function getNotificationRecoveryMeta(notifications: AppNotification[]): NotificationRecoveryMeta | null {
  const healingNotifications = notifications.filter((notification) => notification.type === "healing");
  if (healingNotifications.length === 0) {
    return null;
  }

  const unreadHealingCount = healingNotifications.filter((notification) => !notification.read).length;
  const hasUnreadHealing = unreadHealingCount > 0;

  return {
    badges: [
      hasUnreadHealing ? `복구 ${unreadHealingCount}건` : `복구 기록 ${healingNotifications.length}건`,
      hasUnreadHealing ? "먼저 확인" : "기록 확인",
      "인스펙터 연계",
    ],
    helper: hasUnreadHealing
      ? "자동 복구 알림이 도착했습니다. 먼저 최근 복구 흐름을 확인한 뒤 인스펙터에서 실패 분석과 제안 커맨드 실행으로 이어가면 됩니다."
      : "최근 복구 기록이 남아 있습니다. 필요하면 인스펙터에서 같은 흐름을 다시 열어 복구 단서를 이어서 확인할 수 있습니다.",
    tone: hasUnreadHealing ? "amber" : "cyan",
  };
}

export function getNotificationCardRecoveryHint(notification: AppNotification): string | null {
  if (notification.type !== "healing") {
    return null;
  }

  return notification.read
    ? "복구 기록입니다. 필요하면 인스펙터에서 같은 실패 흐름을 다시 열어 제안 커맨드를 이어서 확인하세요."
    : "새 복구 알림입니다. 먼저 복구 시작을 눌러 인스펙터에서 실패 분석과 첫 제안 실행 흐름으로 바로 이어가세요.";
}

export interface NotificationCardRecoveryPresentation {
  badges: [string, string, string];
  tone: "amber" | "cyan";
}

export function getNotificationCardRecoveryPresentation(
  notification: AppNotification,
): NotificationCardRecoveryPresentation | null {
  if (notification.type !== "healing") {
    return null;
  }

  if (notification.read) {
    return {
      badges: ["복구 기록", "다시 확인", "인스펙터 열기"],
      tone: "cyan",
    };
  }

  return {
    badges: ["먼저 복구", "분석 확인", "첫 제안 실행"],
    tone: "amber",
  };
}

type FilterType = "all" | NotifType;
const FILTER_LABELS: Record<FilterType, string> = {
  all: "전체",
  command: "커맨드",
  agent: "에이전트",
  healing: "치유",
  env: "환경",
};
const FILTER_TYPES: FilterType[] = ["all", "command", "agent", "healing", "env"];
const FILTER_ACTIVE_CLASS: Record<FilterType, string> = {
  all: "bg-cyan-400/16 border-cyan-300/40 text-cyan-100",
  command: "bg-sky-400/16 border-sky-300/40 text-sky-100",
  agent: "bg-cyan-400/16 border-cyan-300/40 text-cyan-100",
  healing: "bg-amber-400/16 border-amber-300/40 text-amber-100",
  env: "bg-emerald-400/16 border-emerald-300/40 text-emerald-100",
};
const FILTER_IDLE_CLASS: Record<FilterType, string> = {
  all: "bg-white/[0.03] border-white/10 text-white/58 hover:text-white hover:bg-white/[0.06]",
  command: "bg-sky-400/[0.04] border-sky-300/12 text-sky-100/60 hover:text-sky-100 hover:bg-sky-400/[0.08]",
  agent: "bg-cyan-400/[0.04] border-cyan-300/12 text-cyan-100/60 hover:text-cyan-100 hover:bg-cyan-400/[0.08]",
  healing: "bg-amber-400/[0.04] border-amber-300/12 text-amber-100/60 hover:text-amber-100 hover:bg-amber-400/[0.08]",
  env: "bg-emerald-400/[0.04] border-emerald-300/12 text-emerald-100/60 hover:text-emerald-100 hover:bg-emerald-400/[0.08]",
};
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

type SearchHistoryItem = {
  mode: SearchMode;
  query: string;
  ts: number;
};

const SEARCH_HISTORY_KEY = "lum_notification_search_history_v1";
const SEARCH_HISTORY_MAX_ITEMS = 5;

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
  onOpenRecoveryFlow,
  highlightRecovery = false,
  autoFocusRecoveryAction = false,
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
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(-1);

  const saveSearchHistory = (mode: SearchMode, query: string) => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      return;
    }
    const next: SearchHistoryItem = {
      mode,
      query: nextQuery,
      ts: Date.now(),
    };

    setSearchHistory((prev) => {
      const deduped = prev.filter((item) => !(item.mode === mode && item.query === nextQuery));
      return [next, ...deduped].slice(0, SEARCH_HISTORY_MAX_ITEMS);
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    setShowSearchHistory(false);
    setActiveHistoryIndex(-1);
  };

  const focusRecoveryAction = () => {
    const recoveryButton = panelRef.current?.querySelector<HTMLButtonElement>("[data-notification-recovery-action]");
    recoveryButton?.focus();
  };

  const applySearchHistoryItem = (item: SearchHistoryItem) => {
    setSearchMode(item.mode);
    setSearchQuery(item.query);
    setShowSearchHistory(false);
    setActiveHistoryIndex(-1);
    searchInputRef.current?.focus();
  };

  const removeSearchHistoryItem = (item: SearchHistoryItem) => {
    setSearchHistory((prev) => prev.filter((historyItem) => !(
      historyItem.mode === item.mode
      && historyItem.query === item.query
      && historyItem.ts === item.ts
    )));
    setActiveHistoryIndex(-1);
  };

  const sortedSearchHistory = useMemo(
    () => [...searchHistory].sort((left, right) => right.ts - left.ts),
    [searchHistory],
  );

  const moveHistoryIndex = (nextDelta: number) => {
    if (sortedSearchHistory.length === 0) {
      setActiveHistoryIndex(-1);
      return;
    }

    const maxIndex = sortedSearchHistory.length - 1;
    const base = activeHistoryIndex;
    const next = (base + nextDelta + maxIndex + 1) % (maxIndex + 1);
    setActiveHistoryIndex(next);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      const normalized = parsed.filter((item): item is SearchHistoryItem => (
        item
        && typeof item === "object"
        && (item.mode === "token" || item.mode === "regex")
        && typeof item.query === "string"
        && item.query.trim() !== ""
        && typeof item.ts === "number"
      ));
      setSearchHistory(
        [...normalized]
          .sort((left, right) => right.ts - left.ts)
          .slice(0, SEARCH_HISTORY_MAX_ITEMS),
      );
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch {
      // ignore storage quota errors
    }
  }, [searchHistory]);

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

    if (!highlightRecovery) {
      return {
        displayedNotifications: matched,
        matchedTitleCount: titleMatchCount,
        matchedBodyCount: bodyMatchCount,
      };
    }

    const recoveryPrioritized = [...matched].sort((left, right) => {
      const leftHealingScore = left.type === "healing" ? (left.read ? 1 : 2) : 0;
      const rightHealingScore = right.type === "healing" ? (right.read ? 1 : 2) : 0;
      if (rightHealingScore !== leftHealingScore) {
        return rightHealingScore - leftHealingScore;
      }
      return 0;
    });

    return {
      displayedNotifications: recoveryPrioritized,
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
    highlightRecovery,
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

  useEffect(() => {
    if (!autoFocusRecoveryAction) return;

    const timer = requestAnimationFrame(() => {
      const recoveryButton = panelRef.current?.querySelector<HTMLButtonElement>("[data-notification-recovery-action]");
      recoveryButton?.focus();
    });

    return () => cancelAnimationFrame(timer);
  }, [autoFocusRecoveryAction, displayedNotifications]);

  const popupPositionClass = "";
  const resultMeta = getNotificationResultMeta(
    Boolean(normalizedSearchQuery),
    showUnreadOnly || typeFilter !== "all",
  );
  const recoveryMeta = getNotificationRecoveryMeta(displayedNotifications);
  const emptyStateMeta = getNotificationEmptyStateMeta({
    hasSearchQuery: Boolean(searchQuery),
    showUnreadOnly,
  });

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
          <IconButton tooltip="모두 읽음"
            description="현재 보이는 알림 흐름을 모두 읽음 상태로 바꿔, 새로 확인할 항목만 다시 남깁니다."
            onClick={onMarkAllRead}
            aria-label="모든 알림 읽음 처리"
            className="rounded border border-emerald-300/18 bg-emerald-400/[0.08] p-1 text-emerald-100/76 transition-colors hover:bg-emerald-400/[0.16] hover:text-emerald-50">
            <CheckCheck size={11} />
          </IconButton>
        )}
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => setShowUnreadOnly((prev) => !prev)}
            aria-pressed={showUnreadOnly}
            aria-label={showUnreadOnly ? "전체 알림 보기" : "미확인 알림만 보기"}
            className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
              showUnreadOnly
                ? "border-emerald-300/35 bg-emerald-400/14 text-emerald-100 hover:bg-emerald-400/22"
                : "border-white/12 bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/[0.1]"
            }`}
          >
            <Filter size={11} />
            <span>{showUnreadOnly ? "전체 보기" : `미확인 ${unreadCount}개`}</span>
          </button>
        )}
        {notifications.length > 0 && (
          <IconButton
            tooltip="전체 삭제"
            description="알림 센터에 쌓인 항목을 한 번에 비웁니다. 필요한 내용은 삭제 전에 복사해 두는 편이 안전합니다."
            confirm={{
              title: "알림 전체 삭제",
              description: `${notifications.length}개 알림이 모두 삭제됩니다.`,
            }}
            onClick={onClear}
            aria-label="알림 전체 삭제"
            className="rounded border border-rose-300/18 bg-rose-400/[0.08] p-1 text-rose-100/72 transition-colors hover:bg-rose-400/[0.16] hover:text-rose-50"
          >
            <Trash2 size={11} />
          </IconButton>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="알림 센터 닫기"
          className="rounded border border-white/12 bg-white/[0.03] p-1 text-white/38 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white/72 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X size={11} />
        </button>
      </div>

      {/* 알림 목록 */}
      {notifications.length > 0 && (
        <div className="border-b border-white/5 px-2 py-1.5 flex items-start gap-1.5 bg-[#12171e]">
          <div className="w-full">
            {recoveryMeta && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                  recoveryMeta.tone === "amber"
                    ? "border-amber-300/24 bg-amber-400/10 text-amber-100"
                    : "border-cyan-300/22 bg-cyan-400/10 text-cyan-100/90"
                }`}>
                  {recoveryMeta.badges[0]}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                  {recoveryMeta.badges[1]}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                  {recoveryMeta.badges[2]}
                </span>
                <span className="text-[10px] text-white/34">{recoveryMeta.helper}</span>
                <button
                  type="button"
                  onClick={focusRecoveryAction}
                  className={`ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                    recoveryMeta.tone === "amber"
                      ? "border-amber-300/28 bg-amber-400/14 text-amber-100 hover:bg-amber-400/22"
                      : "border-cyan-300/28 bg-cyan-400/14 text-cyan-100 hover:bg-cyan-400/22"
                  }`}
                >
                  복구 카드 보기
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded border border-white/12 bg-white/[0.05] text-[10px]">
              <button
                type="button"
                onClick={() => setSearchMode("token")}
                aria-pressed={searchMode === "token"}
                aria-label="검색 모드: 토큰(1)"
                className={`px-2 py-1 border-r border-white/12 ${searchMode === "token"
                  ? "bg-cyan-400/16 text-cyan-100"
                  : "text-white/65 hover:text-cyan-100 hover:bg-cyan-400/[0.08]"
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
                  ? "bg-amber-400/16 text-amber-100"
                  : "text-white/65 hover:text-amber-100 hover:bg-amber-400/[0.08]"
                }`}
              >
                정규식(2)
              </button>
              </div>
              <label htmlFor="notification-search" className="sr-only">
                알림 검색
              </label>
              <div className="relative flex-1">
                <Search size={11} className="absolute left-2 top-2 text-white/52" />
                <input
                  id="notification-search"
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setActiveHistoryIndex(-1);
                  }}
                  onFocus={() => {
                    setShowSearchHistory(true);
                    setActiveHistoryIndex(-1);
                  }}
                  onBlur={() => {
                    setShowSearchHistory(false);
                    setActiveHistoryIndex(-1);
                    if (searchQuery.trim()) {
                      saveSearchHistory(searchMode, searchQuery);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (showSearchHistory && !searchQuery && sortedSearchHistory.length > 0) {
                      if (e.key === "ArrowDown") {
                        moveHistoryIndex(1);
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        moveHistoryIndex(-1);
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }

                      if ((e.key === "Delete" || e.key === "Backspace") && activeHistoryIndex >= 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        const target = sortedSearchHistory[activeHistoryIndex];
                        if (target) {
                          removeSearchHistoryItem(target);
                        }
                        return;
                      }

                      if (e.key === "Enter" && activeHistoryIndex >= 0) {
                        applySearchHistoryItem(sortedSearchHistory[activeHistoryIndex]!);
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                    }

                    if (e.key === "Escape") {
                      setShowSearchHistory(false);
                      setActiveHistoryIndex(-1);
                    }
                    if (e.key === "Enter") {
                      saveSearchHistory(searchMode, searchQuery);
                      setShowSearchHistory(false);
                      setActiveHistoryIndex(-1);
                    }
                  }}
                  placeholder={searchMode === "regex"
                    ? "정규식 검색 (/error|warn/i, /error/gi)"
                    : "알림 제목/본문 검색"}
                  className="w-full rounded border border-white/14 bg-white/[0.07] pl-6 pr-7 py-1.5 text-xs text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-white/34 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    className="absolute right-1.5 top-1.5 rounded border border-white/10 bg-white/[0.05] p-0.5 text-white/54 hover:border-white/16 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => {
                      setSearchQuery("");
                      setShowSearchHistory(true);
                      setActiveHistoryIndex(-1);
                      searchInputRef.current?.focus();
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
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
            {searchHistory.length > 0 && showSearchHistory && !searchQuery && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-white/15 bg-white/[0.05] text-[10px] text-white/55">
                최근 검색어 {`(${searchHistory.length}개 / 최대 ${SEARCH_HISTORY_MAX_ITEMS}개)`}
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
          {showSearchHistory && searchHistory.length > 0 && !searchQuery && (
            <div className="px-2 pb-1.5 pt-0 flex flex-wrap gap-1.5">
              {sortedSearchHistory.map((item, index) => (
                <div
                  key={`${item.mode}-${item.query}-${item.ts}`}
                  className="inline-flex items-center max-w-[45%] text-[10px] rounded-lg border border-white/12 px-1.5 py-1 bg-white/[0.05] text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  style={activeHistoryIndex === index ? {
                    background: "rgba(34,211,238,0.14)",
                    borderColor: "rgba(34,211,238,0.3)",
                  } : undefined}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        applySearchHistoryItem(item);
                      }
                    }}
                    onClick={() => applySearchHistoryItem(item)}
                    className="inline-flex flex-1 min-w-0 items-center text-left hover:border-white/25 hover:text-white"
                    aria-label={`최근 검색어 ${item.query} 적용`}
                  >
                    <span className="mr-1 text-[9px] text-white/52">{item.mode === "regex" ? "R" : "T"}:</span>
                    <span className="truncate">{item.query}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`최근 검색어 ${item.query} 삭제`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Delete" || event.key === "Backspace" || event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        removeSearchHistoryItem(item);
                      }
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeSearchHistoryItem(item);
                    }}
                    className="ml-1 rounded-md border border-white/10 bg-white/[0.05] px-1 text-white/56 hover:border-white/18 hover:bg-white/[0.1] hover:text-white/88"
                  >
                    ×
                  </button>
                </div>
                ))}
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearSearchHistory}
                className="inline-flex items-center rounded-lg border border-rose-300/20 bg-rose-400/[0.08] px-2 py-1 text-[10px] font-medium text-rose-100/74 transition-colors hover:border-rose-300/34 hover:bg-rose-400/[0.14] hover:text-rose-50"
                aria-label="검색 기록 전체 삭제"
              >
                기록 전체 삭제
              </button>
              <div className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/55">
                  먼저 기록
                </span>
                <span className="inline-flex items-center rounded-full border border-cyan-300/22 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100/90">
                  다음 적용
                </span>
                <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/55">
                  마지막 정리
                </span>
                <span className="text-[10px] text-white/34">
                  최근 검색어를 고르고 다시 적용한 뒤 필요 없는 기록을 정리합니다.
                </span>
              </div>
            </div>
          )}
          <div className="px-2 pb-1.5 pt-0 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-emerald-300/24 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100">
              먼저 검색
            </span>
            <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
              다음 필터
            </span>
            <span className="inline-flex items-center rounded-full border border-cyan-300/22 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100/90">
              마지막 정리
            </span>
            <span className="text-[10px] text-white/34">
              먼저 찾고, 다음으로 좁히고, 마지막에 현재 보기를 정리합니다.
            </span>
          </div>
          <div className="px-2 pb-1.5 pt-0">
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
              <span className="inline-flex items-center rounded-full border border-cyan-300/22 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100/90">
                현재 결과
              </span>
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                {resultMeta.flowLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                {resultMeta.scopeLabel}
              </span>
              <span className="text-[10px] text-white/34">{resultMeta.description}</span>
            </div>
            <div className="shrink-0 py-1.5 text-[10px] text-white/42">
              <span className="font-medium text-white/62">{displayedNotifications.length}건</span>
              {normalizedSearchQuery
                ? ` · ${searchMode === "regex" ? (parsedRegex?.display ?? `/${normalizedSearchQuery}/`) : `"${normalizedSearchQuery}"`} · 제목: ${matchedTitleCount}건, 본문: ${matchedBodyCount}건`
                : ""}
            </div>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="inline-flex shrink-0 items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/55">
              다음 필터
            </span>
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
                      ? FILTER_ACTIVE_CLASS[filterType]
                      : FILTER_IDLE_CLASS[filterType]
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
              <span className="inline-flex shrink-0 items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/55">
                마지막 정리
              </span>
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
                <span>현재 보기 삭제</span>
                <span className="sr-only">모두 삭제</span>
                <span className="ml-1 text-[10px] text-white/70">[D]</span>
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0">
        {displayedNotifications.length === 0 ? (
          <div className="mx-2 my-3 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-white/20">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <Bell size={20} />
            </div>
            {searchQuery ? (
              <>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="inline-flex items-center rounded-full border border-amber-300/24 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-100">
                    {emptyStateMeta.badges[0]}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                    {emptyStateMeta.badges[1]}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                    {emptyStateMeta.badges[2]}
                  </span>
                </div>
                <p className="text-sm text-white/72">{emptyStateMeta.title}</p>
                <p className="text-[11px] text-white/34">{emptyStateMeta.description}</p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="inline-flex items-center rounded-full border border-cyan-300/22 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100/90">
                    {emptyStateMeta.badges[0]}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                    {emptyStateMeta.badges[1]}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                    {emptyStateMeta.badges[2]}
                  </span>
                </div>
                <p className="text-sm text-white/72">{emptyStateMeta.title}</p>
                <p className="text-[11px] text-white/34">{emptyStateMeta.description}</p>
              </>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {displayedNotifications.map((n) => (
              <div
                key={n.id}
                role="alert"
                className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                  n.read
                    ? "bg-transparent border-white/3"
                    : `${getNotificationTypeMeta(n.type).cardClass} shadow-[0_8px_24px_rgba(0,0,0,0.14)]`
                }`}
              >
                {(() => {
                  const recoveryHint = getNotificationCardRecoveryHint(n);
                  const recoveryPresentation = getNotificationCardRecoveryPresentation(n);

                  return (
                    <>
                <span className={`mt-0.5 shrink-0 ${getNotificationTypeMeta(n.type).colorClass}`}>
                  {TYPE_ICON[n.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <p className={`text-sm font-medium ${n.read ? "text-white/45" : "text-white/75"}`}>
                      {searchMode === "regex"
                        ? renderHighlightedTextByRegex(n.title, regexSearch)
                        : renderHighlightedText(n.title, normalizedSearchQueries)}
                    </p>
                    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${getNotificationTypeMeta(n.type).badgeClass}`}>
                      {getNotificationTypeMeta(n.type).label}
                    </span>
                    {!n.read && (
                      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-400/12 text-emerald-100 border border-emerald-300/25">
                        미확인
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-white/42">
                      {timeAgo(n.timestamp)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-white/50">
                      {getNotificationTypeMeta(n.type).hint}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${
                        n.read
                          ? "border-white/10 bg-white/[0.04] text-white/40"
                          : "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                      }`}
                    >
                      {n.read ? "읽음" : "지금 확인"}
                    </span>
                  </div>
                  <p className="text-xs text-white/35 mt-0.5 break-words leading-relaxed">
                    {searchMode === "regex"
                      ? renderHighlightedTextByRegex(n.body, regexSearch)
                      : renderHighlightedText(n.body, normalizedSearchQueries)}
                  </p>
                  {recoveryHint && recoveryPresentation && (
                    <div className={`mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
                      recoveryPresentation.tone === "amber"
                        ? "border-amber-300/18 bg-amber-400/[0.08]"
                        : "border-cyan-300/18 bg-cyan-400/[0.08]"
                    }`}>
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                        recoveryPresentation.tone === "amber"
                          ? "border-amber-300/24 bg-amber-400/10 text-amber-100"
                          : "border-cyan-300/22 bg-cyan-400/10 text-cyan-100/90"
                      }`}>
                        바로 복구 보기
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                        recoveryPresentation.tone === "amber"
                          ? "border-white/12 bg-white/[0.05] text-white/62"
                          : "border-white/12 bg-white/[0.05] text-white/62"
                      }`}>
                        {recoveryPresentation.badges[0]}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                        {recoveryPresentation.badges[1]}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
                        {recoveryPresentation.badges[2]}
                      </span>
                      <span className={`text-[10px] leading-relaxed ${
                        recoveryPresentation.tone === "amber" ? "text-amber-100/78" : "text-cyan-100/76"
                      }`}>
                        {recoveryHint}
                      </span>
                      {onOpenRecoveryFlow && (
                        <button
                          type="button"
                          data-notification-recovery-action
                          onClick={() => {
                            onMarkByIds?.([n.id]);
                            onOpenRecoveryFlow();
                          }}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                            recoveryPresentation.tone === "amber"
                              ? "border-amber-300/28 bg-amber-400/14 text-amber-100 hover:bg-amber-400/22"
                              : "border-cyan-300/28 bg-cyan-400/14 text-cyan-100 hover:bg-cyan-400/22"
                          }`}
                        >
                          복구 시작
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1">
                  <IconButton
                    tooltip="알림 텍스트 복사"
                    description="제목과 본문을 함께 복사해 이슈 공유나 후속 작업 메모로 바로 가져갈 수 있습니다."
                    aria-label={`${n.title} 알림 복사`}
                    onClick={() => navigator.clipboard.writeText(`${n.title}\n${n.body}`).catch(() => {})}
                    className={`rounded-md border p-1 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      n.read
                        ? "border-white/8 bg-white/[0.03] text-white/24 opacity-55 hover:border-white/14 hover:bg-white/[0.08] hover:text-white/58"
                        : "border-white/10 bg-white/[0.05] text-white/38 opacity-80 hover:border-white/18 hover:bg-white/[0.1] hover:text-white/78"
                    }`}
                  >
                    <Copy size={10} />
                  </IconButton>
                  <button
                    type="button"
                    onClick={() => onDismiss(n.id)}
                    aria-label={`${n.title} 알림 닫기`}
                    className={`rounded-md border p-1 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      n.read
                        ? "border-white/8 bg-white/[0.03] text-white/24 opacity-55 hover:border-white/14 hover:bg-white/[0.08] hover:text-white/58"
                        : "border-white/10 bg-white/[0.05] text-white/38 opacity-80 hover:border-white/18 hover:bg-white/[0.1] hover:text-white/78"
                    }`}
                  >
                    <X size={10} />
                  </button>
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
