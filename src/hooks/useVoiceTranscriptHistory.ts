import { useEffect, useState } from "react";

const STORAGE_KEY = "lum.voiceTranscriptHistory.v1";
const MAX_RECENT_VOICE_TRANSCRIPTS = 3;
const MAX_RECENT_VOICE_HISTORY_ITEMS = 10;
const MAX_PINNED_VOICE_TRANSCRIPTS = 6;

export type VoiceTranscriptHistoryItem = {
  id: string;
  text: string;
  createdAt: number;
};

type VoiceTranscriptStore = {
  pinnedVoiceTranscripts: string[];
  recentVoiceTranscripts: string[];
  voiceTranscriptHistory: VoiceTranscriptHistoryItem[];
  showVoiceTranscriptHistory: boolean;
};

const DEFAULT_STORE: VoiceTranscriptStore = {
  pinnedVoiceTranscripts: [],
  recentVoiceTranscripts: [],
  voiceTranscriptHistory: [],
  showVoiceTranscriptHistory: false,
};

const listeners = new Set<(store: VoiceTranscriptStore) => void>();

const canUseBrowserStore = () => typeof window !== "undefined";

const normalizeVoiceTranscript = (text: string) => text.replace(/\s+/g, " ").trim();

const sanitizeStore = (value: unknown): VoiceTranscriptStore => {
  if (!value || typeof value !== "object") {
    return DEFAULT_STORE;
  }

  const candidate = value as Partial<VoiceTranscriptStore>;
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
    pinnedVoiceTranscripts,
    recentVoiceTranscripts,
    voiceTranscriptHistory,
    showVoiceTranscriptHistory:
      voiceTranscriptHistory.length > 0 && candidate.showVoiceTranscriptHistory === true,
  };
};

const loadStore = (): VoiceTranscriptStore => {
  if (!canUseBrowserStore()) {
    return DEFAULT_STORE;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STORE;
    }
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return DEFAULT_STORE;
  }
};

let voiceTranscriptStore = loadStore();

const persistStore = () => {
  if (!canUseBrowserStore()) {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(voiceTranscriptStore));
  } catch {}
};

const emitStore = () => {
  listeners.forEach((listener) => listener(voiceTranscriptStore));
};

const updateStore = (updater: (prev: VoiceTranscriptStore) => VoiceTranscriptStore) => {
  voiceTranscriptStore = sanitizeStore(updater(voiceTranscriptStore));
  persistStore();
  emitStore();
};

export const useVoiceTranscriptHistory = () => {
  const [store, setStore] = useState<VoiceTranscriptStore>(() => voiceTranscriptStore);

  useEffect(() => {
    const nextStore = loadStore();
    voiceTranscriptStore = nextStore;
    setStore(nextStore);

    const listener = (nextValue: VoiceTranscriptStore) => {
      setStore(nextValue);
    };

    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
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
      updateStore((prev) => ({
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

      updateStore((prev) => {
        const nextHistory = prev.voiceTranscriptHistory.filter((item) => item.text !== normalized);
        return {
          ...prev,
          pinnedVoiceTranscripts: prev.pinnedVoiceTranscripts.filter((item) => item !== normalized),
          recentVoiceTranscripts: prev.recentVoiceTranscripts.filter((item) => item !== normalized),
          voiceTranscriptHistory: nextHistory,
          showVoiceTranscriptHistory: nextHistory.length > 0 ? prev.showVoiceTranscriptHistory : false,
        };
      });
    },
    clearVoiceTranscripts: () => {
      updateStore(() => DEFAULT_STORE);
    },
    toggleVoiceTranscriptHistory: () => {
      updateStore((prev) =>
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

      updateStore((prev) => {
        const alreadyPinned = prev.pinnedVoiceTranscripts.includes(normalized);
        return {
          ...prev,
          pinnedVoiceTranscripts: alreadyPinned
            ? prev.pinnedVoiceTranscripts.filter((item) => item !== normalized)
            : [normalized, ...prev.pinnedVoiceTranscripts].slice(0, MAX_PINNED_VOICE_TRANSCRIPTS),
        };
      });
    },
    isVoiceTranscriptPinned: (text: string) => {
      const normalized = normalizeVoiceTranscript(text);
      return normalized.length > 0 && store.pinnedVoiceTranscripts.includes(normalized);
    },
  };
};
