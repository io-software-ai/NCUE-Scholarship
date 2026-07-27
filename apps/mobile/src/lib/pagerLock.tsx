/**
 * 外層橫向分頁器的手勢協調。
 *
 * 內容裡若有自己的橫向捲動區（例如公告內文的寬表格），外層 pagingEnabled ScrollView
 * 會把水平手勢攔去換頁，使用者永遠捲不到表格右側被切掉的欄位。兩道防線：
 *
 * 1. pagerRef：外層改用 gesture-handler 的 ScrollView，內層把自己的原生手勢設為
 *    blocksExternalGesture(pagerRef)，由 gesture-handler 在原生層仲裁 —— 手指落在
 *    表格上時換頁手勢直接不會啟動（新架構下這是唯一可靠的作法）。
 * 2. setScrollEnabled：觸控期間額外關掉外層 scrollEnabled，作為 1 的保險
 *    （例如外層不是 gesture-handler ScrollView 時仍有基本效果）。
 */
import React, { createContext, useContext, useMemo } from 'react';

type SetEnabled = (enabled: boolean) => void;

export type PagerLock = {
    /** 開關外層分頁器捲動（觸控期間暫時關閉） */
    setScrollEnabled: SetEnabled;
    /** 外層分頁器 ScrollView 的 ref（gesture-handler 版才有；供 blocksExternalGesture 用） */
    pagerRef: React.RefObject<any> | null;
};

const Ctx = createContext<PagerLock>({ setScrollEnabled: () => {}, pagerRef: null });

export function PagerLockProvider({
    setScrollEnabled,
    pagerRef = null,
    children,
}: {
    setScrollEnabled: SetEnabled;
    pagerRef?: React.RefObject<any> | null;
    children: React.ReactNode;
}) {
    const value = useMemo(() => ({ setScrollEnabled, pagerRef }), [setScrollEnabled, pagerRef]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 取得外層分頁器的手勢控制；不在分頁器內時為 no-op。 */
export function usePagerLock(): PagerLock {
    return useContext(Ctx);
}
