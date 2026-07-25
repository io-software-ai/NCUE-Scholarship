/**
 * 本機收藏 / 已讀 / 搜尋歷史（AsyncStorage，不動後端）。
 *
 * 以單一 Provider 持有狀態，避免各畫面各自讀寫造成不同步；
 * 寫入採「先更新記憶體、再非同步落地」，UI 立即回應。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const K_BOOKMARKS = 'ncue.bookmarks.v1';
const K_READ = 'ncue.read.v1';
const K_SEARCHES = 'ncue.searches.v1';

const MAX_READ = 400; // 已讀清單上限（避免無限成長）
const MAX_SEARCHES = 8;

interface Ctx {
  bookmarks: string[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => void;
  read: Set<string>;
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  searches: string[];
  pushSearch: (q: string) => void;
  removeSearch: (q: string) => void;
  clearSearches: () => void;
  ready: boolean;
}

const LocalStoreCtx = createContext<Ctx | null>(null);

export function LocalStoreProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [searches, setSearches] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [b, r, s] = await AsyncStorage.multiGet([K_BOOKMARKS, K_READ, K_SEARCHES]);
        const parse = (v: string | null): string[] => {
          if (!v) return [];
          try {
            const arr = JSON.parse(v);
            return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
          } catch {
            return [];
          }
        };
        setBookmarks(parse(b[1]));
        setRead(new Set(parse(r[1])));
        setSearches(parse(s[1]));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      AsyncStorage.setItem(K_BOOKMARKS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      // 超過上限時裁掉最舊的（Set 保留插入順序）
      const arr = Array.from(next);
      const trimmed = arr.length > MAX_READ ? arr.slice(arr.length - MAX_READ) : arr;
      AsyncStorage.setItem(K_READ, JSON.stringify(trimmed)).catch(() => {});
      return new Set(trimmed);
    });
  }, []);

  const pushSearch = useCallback((q: string) => {
    const term = q.trim();
    if (term.length < 2) return;
    setSearches((prev) => {
      const next = [term, ...prev.filter((x) => x !== term)].slice(0, MAX_SEARCHES);
      AsyncStorage.setItem(K_SEARCHES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeSearch = useCallback((q: string) => {
    setSearches((prev) => {
      const next = prev.filter((x) => x !== q);
      AsyncStorage.setItem(K_SEARCHES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearSearches = useCallback(() => {
    setSearches([]);
    AsyncStorage.removeItem(K_SEARCHES).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      bookmarks,
      isBookmarked: (id: string) => bookmarks.includes(id),
      toggleBookmark,
      read,
      isRead: (id: string) => read.has(id),
      markRead,
      searches,
      pushSearch,
      removeSearch,
      clearSearches,
      ready,
    }),
    [bookmarks, read, searches, ready, toggleBookmark, markRead, pushSearch, removeSearch, clearSearches],
  );

  return <LocalStoreCtx.Provider value={value}>{children}</LocalStoreCtx.Provider>;
}

/** 不在 Provider 內時回傳安全的 no-op，畫面不會崩。 */
const FALLBACK: Ctx = {
  bookmarks: [],
  isBookmarked: () => false,
  toggleBookmark: () => {},
  read: new Set(),
  isRead: () => false,
  markRead: () => {},
  searches: [],
  pushSearch: () => {},
  removeSearch: () => {},
  clearSearches: () => {},
  ready: false,
};

export function useLocalStore(): Ctx {
  return useContext(LocalStoreCtx) ?? FALLBACK;
}
