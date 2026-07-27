/**
 * 外層橫向分頁器的手勢鎖。
 *
 * 內容裡若有自己的橫向捲動區（例如公告內文的寬表格），外層 pagingEnabled ScrollView
 * 會把水平手勢攔去換頁，使用者永遠捲不到表格右側被切掉的欄位。
 * 這裡讓內層在觸控期間暫時關掉外層捲動，放開後再打開。
 */
import React, { createContext, useContext } from 'react';

type SetEnabled = (enabled: boolean) => void;

const Ctx = createContext<SetEnabled>(() => {});

export function PagerLockProvider({ value, children }: { value: SetEnabled; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 取得「開關外層分頁器捲動」的函式；不在分頁器內時為 no-op。 */
export function usePagerLock(): SetEnabled {
  return useContext(Ctx);
}
