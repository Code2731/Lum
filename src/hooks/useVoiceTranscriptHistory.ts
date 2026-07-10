import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "lum.voiceTranscriptHistory.v2";
const MAX_RECENT_VOICE_TRANSCRIPTS = 3;
const MAX_RECENT_VOICE_HISTORY_ITEMS = 10;
const MAX_PINNED_VOICE_TRANSCRIPTS = 6;
const DEFAULT_SCOPE_KEY = "__global__";

export type VoiceTranscriptHistoryItem = {
  id: string;
  text: string;
  createdAt: number;
};

type VoiceTranscriptStore = {
  lastAccessedAt: number;
  pinnedVoiceTranscriptLabels: Record<string, string>;
  pinnedVoiceTranscripts: string[];
  recentVoiceTranscripts: string[];
  voiceTranscriptHistory: VoiceTranscriptHistoryItem[];
  showVoiceTranscriptHistory: boolean;
};

type VoiceTranscriptStoreCollection = Record<string, VoiceTranscriptStore>;
type VoiceTranscriptScopeSummary = {
  scopeKey: string;
  lastAccessedAt: number;
  pinnedCount: number;
  recentCount: number;
  historyCount: number;
};

const DEFAULT_STORE: VoiceTranscriptStore = {
  lastAccessedAt: 0,
  pinnedVoiceTranscriptLabels: {},
  pinnedVoiceTranscripts: [],
  recentVoiceTranscripts: [],
  voiceTranscriptHistory: [],
  showVoiceTranscriptHistory: false,
};

const listeners = new Set<() => void>();

const canUseBrowserStore = () => typeof window !== "undefined";

const normalizeVoiceTranscript = (text: string) => text.replace(/\s+/g, " ").trim();
const normalizeScopeKey = (scope?: string | null) => {
  const normalized = (scope ?? "").trim().replace(/\\/g, "/");
  return normalized || DEFAULT_SCOPE_KEY;
};

const sanitizeScopedStore = (value: unknown): VoiceTranscriptStore => {
  if (!value || typeof value !== "object") {
    return DEFAULT_STORE;
  }

  const candidate = value as Partial<VoiceTranscriptStore>;
  const lastAccessedAt =
    typeof candidate.lastAccessedAt === "number" && Number.isFinite(candidate.lastAccessedAt)
      ? candidate.lastAccessedAt
      : 0;
  const pinnedVoiceTranscriptLabels = candidate.pinnedVoiceTranscriptLabels
    && typeof candidate.pinnedVoiceTranscriptLabels === "object"
    && !Array.isArray(candidate.pinnedVoiceTranscriptLabels)
      ? Object.fromEntries(
          Object.entries(candidate.pinnedVoiceTranscriptLabels)
            .filter(([key, value]) => typeof key === "string" && typeof value === "string")
            .map(([key, value]) => [normalizeVoiceTranscript(key), normalizeVoiceTranscript(value)])
            .filter(([key, value]) => key.length > 0 && value.length > 0),
        )
      : {};
  const pinnedVoiceTranscripts = Array.isArray(candidate.pinnedVoiceTranscripts)
    ? candidate.pinnedVoiceTranscripts
        .filter((item): item is string => typeof item === "string")
        .map(normalizeVoiceTranscript)
        .filter(Boolean)
        .slice(0, MAX_PINNED_VOICE_TRANSCRIPTS)
    : [];
  const recentVoiceTranscripts = Array.isArray(candidate.recentVoiceTranscripts)
    ? candidate.recentVoiceTranscripts
        .filter((item): item is string => typeof item === "string")
        .map(normalizeVoiceTranscript)
        .filter(Boolean)
        .slice(0, MAX_RECENT_VOICE_TRANSCRIPTS)
    : [];
  const voiceTranscriptHistory = Array.isArray(candidate.voiceTranscriptHistory)
    ? candidate.voiceTranscriptHistory
        .filter((item): item is VoiceTranscriptHistoryItem =>
          !!item
          && typeof item === "object"
          && typeof item.id === "string"
          && typeof item.text === "string"
          && typeof item.createdAt === "number"
        )
        .map((item) => ({
          id: item.id,
          text: normalizeVoiceTranscript(item.text),
          createdAt: item.createdAt,
        }))
        .filter((item) => item.text.length > 0)
        .slice(0, MAX_RECENT_VOICE_HISTORY_ITEMS)
    : [];

  return {
    lastAccessedAt,
    pinnedVoiceTranscriptLabels,
    pinnedVoiceTranscripts,
    recentVoiceTranscripts,
    voiceTranscriptHistory,
    showVoiceTranscriptHistory:
      voiceTranscriptHistory.length > 0 && candidate.showVoiceTranscriptHistory === true,
  };
};

const sanitizeStoreCollection = (value: unknown): VoiceTranscriptStoreCollection => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  if (
    "pinnedVoiceTranscripts" in candidate
    || "recentVoiceTranscripts" in candidate
    || "voiceTranscriptHistory" in candidate
  ) {
    return {
      [DEFAULT_SCOPE_KEY]: sanitizeScopedStore(candidate),
    };
  }

  return Object.fromEntries(
    Object.entries(candidate).map(([scopeKey, scopedValue]) => [
      normalizeScopeKey(scopeKey),
      sanitizeScopedStore(scopedValue),
    ]),
  );
};

const loadStores = (): VoiceTranscriptStoreCollection => {
  if (!canUseBrowserStore()) {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return sanitizeStoreCollection(JSON.parse(raw));
  } catch {
    return {};
  }
};

let voiceTranscriptStores = loadStores();

const persistStore = () => {
  if (!canUseBrowserStore()) {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(voiceTranscriptStores));
  } catch {}
};

const emitStore = () => {
  listeners.forEach((listener) => listener());
};

const getStoreForScope = (scopeKey: string) => voiceTranscriptStores[scopeKey] ?? DEFAULT_STORE;

const updateStore = (scopeKey: string, updater: (prev: VoiceTranscriptStore) => VoiceTranscriptStore) => {
  const now = Date.now();
  voiceTranscriptStores = {
    ...voiceTranscriptStores,
    [scopeKey]: sanitizeScopedStore({
      ...updater(getStoreForScope(scopeKey)),
      lastAccessedAt: now,
    }),
  };
  persistStore();
  emitStore();
};

export const useVoiceTranscriptHistory = (scope?: string | null) => {
  const scopeKey = useMemo(() => normalizeScopeKey(scope), [scope]);
  const [stores, setStores] = useState<VoiceTranscriptStoreCollection>(() => voiceTranscriptStores);
  const [store, setStore] = useState<VoiceTranscriptStore>(() => getStoreForScope(scopeKey));
  const availableVoiceHistoryScopes = useMemo<VoiceTranscriptScopeSummary[]>(
    () =>
      Object.entries(stores)
        .map(([candidateScopeKey, candidateStore]) => ({
          scopeKey: candidateScopeKey,
          lastAccessedAt: candidateStore.lastAccessedAt,
          pinnedCount: candidateStore.pinnedVoiceTranscripts.length,
          recentCount: candidateStore.recentVoiceTranscripts.length,
          historyCount: candidateStore.voiceTranscriptHistory.length,
        }))
        .filter((item) => item.pinnedCount + item.recentCount + item.historyCount > 0)
        .sort((a, b) => {
          if (a.scopeKey === scopeKey) return -1;
          if (b.scopeKey === scopeKey) return 1;
          if (a.lastAccessedAt !== b.lastAccessedAt) return b.lastAccessedAt - a.lastAccessedAt;
          const aTotal = a.pinnedCount + a.recentCount + a.historyCount;
          const bTotal = b.pinnedCount + b.recentCount + b.historyCount;
          if (aTotal !== bTotal) return bTotal - aTotal;
          return a.scopeKey.localeCompare(b.scopeKey);
        }),
    [scopeKey, stores]
  );

  useEffect(() => {
    const nextStores = loadStores();
    voiceTranscriptStores = nextStores;
    setStores(nextStores);
    setStore(getStoreForScope(scopeKey));

    const listener = () => {
      setStores({ ...voiceTranscriptStores });
      setStore(getStoreForScope(scopeKey));
    };

    listeners.add(listener);
    updateStore(scopeKey, (prev) => prev);
    return () => {
      listeners.delete(listener);
    };
  }, [scopeKey]);

  return {
    activeVoiceHistoryScope: scopeKey,
    availableVoiceHistoryScopes,
    pinnedVoiceTranscriptLabels: store.pinnedVoiceTranscriptLabels,
    pinnedVoiceTranscripts: store.pinnedVoiceTranscripts,
    recentVoiceTranscripts: store.recentVoiceTranscripts,
    voiceTranscriptHistory: store.voiceTranscriptHistory,
    showVoiceTranscriptHistory: store.showVoiceTranscriptHistory,
    pushVoiceTranscript: (text: string) => {
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        return;
      }

      const createdAt = Date.now();
      updateStore(scopeKey, (prev) => ({
        ...prev,
        recentVoiceTranscripts: [
          normalized,
          ...prev.recentVoiceTranscripts.filter((item) => item !== normalized),
        ].slice(0, MAX_RECENT_VOICE_TRANSCRIPTS),
        voiceTranscriptHistory: [
          {
            id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
            text: normalized,
            createdAt,
          },
          ...prev.voiceTranscriptHistory.filter((item) => item.text !== normalized),
        ].slice(0, MAX_RECENT_VOICE_HISTORY_ITEMS),
      }));
    },
    removeVoiceTranscript: (text: string) => {
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        return;
      }

      updateStore(scopeKey, (prev) => {
        const nextHistory = prev.voiceTranscriptHistory.filter((item) => item.text !== normalized);
        return {
          ...prev,
          pinnedVoiceTranscriptLabels: Object.fromEntries(
            Object.entries(prev.pinnedVoiceTranscriptLabels).filter(([key]) => key !== normalized),
          ),
          pinnedVoiceTranscripts: prev.pinnedVoiceTranscripts.filter((item) => item !== normalized),
          recentVoiceTranscripts: prev.recentVoiceTranscripts.filter((item) => item !== normalized),
          voiceTranscriptHistory: nextHistory,
          showVoiceTranscriptHistory: nextHistory.length > 0 ? prev.showVoiceTranscriptHistory : false,
        };
      });
    },
    clearVoiceTranscripts: () => {
      updateStore(scopeKey, () => DEFAULT_STORE);
    },
    toggleVoiceTranscriptHistory: () => {
      updateStore(scopeKey, (prev) =>
        prev.voiceTranscriptHistory.length === 0
          ? prev
          : { ...prev, showVoiceTranscriptHistory: !prev.showVoiceTranscriptHistory }
      );
    },
    togglePinVoiceTranscript: (text: string) => {
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        return;
      }

      updateStore(scopeKey, (prev) => {
        const alreadyPinned = prev.pinnedVoiceTranscripts.includes(normalized);
        return {
          ...prev,
          pinnedVoiceTranscriptLabels: alreadyPinned
            ? Object.fromEntries(
                Object.entries(prev.pinnedVoiceTranscriptLabels).filter(([key]) => key !== normalized),
              )
            : prev.pinnedVoiceTranscriptLabels,
          pinnedVoiceTranscripts: alreadyPinned
            ? prev.pinnedVoiceTranscripts.filter((item) => item !== normalized)
            : [normalized, ...prev.pinnedVoiceTranscripts].slice(0, MAX_PINNED_VOICE_TRANSCRIPTS),
        };
      });
    },
    movePinnedVoiceTranscript: (text: string, direction: -1 | 1) => {
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        return;
      }

      updateStore(scopeKey, (prev) => {
        const currentIndex = prev.pinnedVoiceTranscripts.indexOf(normalized);
        if (currentIndex < 0) {
          return prev;
        }

        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= prev.pinnedVoiceTranscripts.length) {
          return prev;
        }

        const nextPinned = [...prev.pinnedVoiceTranscripts];
        const [target] = nextPinned.splice(currentIndex, 1);
        nextPinned.splice(nextIndex, 0, target);

        return {
          ...prev,
          pinnedVoiceTranscripts: nextPinned,
        };
      });
    },
    movePinnedVoiceTranscriptToEdge: (text: string, edge: "start" | "end") => {
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        return;
      }

      updateStore(scopeKey, (prev) => {
        const currentIndex = prev.pinnedVoiceTranscripts.indexOf(normalized);
        if (currentIndex < 0) {
          return prev;
        }

        const targetIndex = edge === "start" ? 0 : prev.pinnedVoiceTranscripts.length - 1;
        if (currentIndex === targetIndex) {
          return prev;
        }

        const nextPinned = [...prev.pinnedVoiceTranscripts];
        const [target] = nextPinned.splice(currentIndex, 1);
        nextPinned.splice(targetIndex, 0, target);

        return {
          ...prev,
          pinnedVoiceTranscripts: nextPinned,
        };
      });
    },
    setPinnedVoiceTranscriptLabel: (text: string, label: string) => {
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        return;
      }

      const normalizedLabel = normalizeVoiceTranscript(label);
      updateStore(scopeKey, (prev) => ({
        ...prev,
        pinnedVoiceTranscriptLabels: normalizedLabel
          ? {
              ...prev.pinnedVoiceTranscriptLabels,
              [normalized]: normalizedLabel,
            }
          : Object.fromEntries(
              Object.entries(prev.pinnedVoiceTranscriptLabels).filter(([key]) => key !== normalized),
            ),
      }));
    },
    getPinnedVoiceTranscriptLabel: (text: string) => {
      const normalized = normalizeVoiceTranscript(text);
      return normalized ? store.pinnedVoiceTranscriptLabels[normalized] ?? "" : "";
    },
    isVoiceTranscriptPinned: (text: string) => {
      const normalized = normalizeVoiceTranscript(text);
      return normalized.length > 0 && store.pinnedVoiceTranscripts.includes(normalized);
    },
  };
};
