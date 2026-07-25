/**
 * 全站統一動效（單一來源）。
 *
 * 原則：專業、克制、一致 —— 不用彈簧 overshoot（Q 彈），改用短時長 + easeOutQuint 曲線，
 * 位移距離小（10–14px）。曲線 [0.22, 1, 0.36, 1] 與網頁版 framer-motion 設定一致，
 * 讓 App 與網頁的節奏讀起來是同一個產品。
 */
import { Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, ZoomIn } from 'react-native-reanimated';

/** 標準時長（毫秒） */
export const DUR = {
  /** 微互動：狀態切換、淡入淡出 */
  fast: 160,
  /** 標準：元件進場 */
  base: 260,
  /** 較重的面板／對話框 */
  slow: 320,
} as const;

/** 統一緩動：easeOutQuint（與網頁版 framer-motion 的 [0.22,1,0.36,1] 相同） */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** 列表／卡片由下淡入（最常用） */
export const enterUp = (delay = 0) => FadeInDown.duration(DUR.base).easing(EASE).delay(delay);

/** 由上淡入（訊息、頂部元素） */
export const enterDown = (delay = 0) => FadeInUp.duration(DUR.base).easing(EASE).delay(delay);

/** 純淡入（不位移，用於次要內容） */
export const enterFade = (delay = 0) => FadeIn.duration(DUR.base).easing(EASE).delay(delay);

/** 淡出 */
export const exitFade = () => FadeOut.duration(DUR.fast).easing(EASE);

/** 對話框：輕微放大淡入（無彈跳） */
export const enterDialog = () => ZoomIn.duration(DUR.base).easing(EASE);

/**
 * 串接列表的階梯延遲：前幾項依序進場，之後統一（避免長列表尾端延遲過久）。
 */
export const stagger = (index: number, step = 45, max = 6) => Math.min(index, max) * step;

/** 面板／底部卡片滑入用的 timing 設定（搭配 withTiming） */
export const SHEET_TIMING = { duration: DUR.slow, easing: EASE } as const;

/** 一般 UI 狀態轉換用的 timing 設定 */
export const UI_TIMING = { duration: DUR.base, easing: EASE } as const;
