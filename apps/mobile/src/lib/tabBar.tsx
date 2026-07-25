/**
 * 浮動底部導覽的顯示狀態（單一 shared value，UI thread 驅動）。
 * - 各畫面把 onScroll 接到自己的 ScrollView / FlatList / FlashList。
 * - 往下滑 → 收起；往上滑或回到頂 → 浮現。
 */
import React, { createContext, useCallback, useContext, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

/** 膠囊列的視覺高度（供畫面計算底部留白用） */
export const TAB_BAR_HEIGHT = 60;
/** 膠囊列離螢幕底的懸浮距離（不含安全區） */
export const TAB_BAR_GAP = 14;

interface TabBarCtx {
  /** 0 = 顯示, 1 = 隱藏 */
  hidden: SharedValue<number>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  setHidden: (v: number) => void;
  /** 切換分頁時呼叫：顯示導覽列並重置捲動基準（各分頁捲動位置不同，否則會誤判成大幅下滑而收起） */
  resetForPageChange: () => void;
}

const Ctx = createContext<TabBarCtx | null>(null);

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSharedValue(0);
  const target = useRef(0);
  // null = 尚未有基準（剛切換分頁）：下一次捲動事件只記錄位置、不判定方向
  const lastY = useRef<number | null>(0);

  const setHidden = useCallback(
    (v: number) => {
      if (target.current === v) return;
      target.current = v;
      // 出現：彈簧（Q 彈、可 overshoot 從中間展開）；消失：快速收合
      hidden.value =
        v === 0
          ? withSpring(0, { damping: 11, stiffness: 190, mass: 0.7 })
          : withTiming(1, { duration: 220 });
    },
    [hidden],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const prev = lastY.current;
      lastY.current = y;
      if (y <= 6) {
        setHidden(0);
        return;
      }
      if (prev === null) return; // 剛切換分頁：只建立基準，不因跨頁位移差誤判
      const dy = y - prev;
      if (dy > 8) setHidden(1); // 往下滑 → 收起
      else if (dy < -8) setHidden(0); // 往上滑 → 浮現
    },
    [setHidden],
  );

  // 切換分頁：一律先顯示導覽列，並清掉捲動基準
  const resetForPageChange = useCallback(() => {
    lastY.current = null;
    setHidden(0);
  }, [setHidden]);

  return <Ctx.Provider value={{ hidden, onScroll, setHidden, resetForPageChange }}>{children}</Ctx.Provider>;
}

/** 供 FloatingTabBar 使用（需在 Provider 內） */
export function useTabBar(): TabBarCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTabBar 必須在 <TabBarProvider> 內使用');
  return c;
}

/** 供畫面掛在 scrollable 的 onScroll；不在 Provider 內時回傳 no-op。 */
export function useTabBarScroll() {
  const c = useContext(Ctx);
  return c?.onScroll ?? (() => {});
}

/* ── 分頁器（左右換頁）：讓畫面能切到別的分頁 ───────────── */
interface PagerCtx {
  activeIndex: number;
  goToTab: (index: number) => void;
}
const PagerContext = createContext<PagerCtx>({ activeIndex: 0, goToTab: () => {} });

export function PagerProvider({ value, children }: { value: PagerCtx; children: React.ReactNode }) {
  return <PagerContext.Provider value={value}>{children}</PagerContext.Provider>;
}

/** 取得目前分頁與切換函式（在自訂分頁器內）。 */
export function usePager() {
  return useContext(PagerContext);
}

/** 內容底部應保留的高度，避免最後一項被浮動列蓋住。 */
export function useTabBarClearance(extra = 16) {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + TAB_BAR_GAP + extra;
}
