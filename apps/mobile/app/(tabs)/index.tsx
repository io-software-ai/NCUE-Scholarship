/**
 * 左右換頁分頁器（Google app 式）：橫向 pagingEnabled ScrollView 同時掛載 4 個分頁，
 * 拖曳即時預覽相鄰頁、放開自動吸附；底部膠囊即時跟隨捲動位置滑動。
 * 用 gesture-handler 的 ScrollView（非 pager-view 原生模組，dev client 直接可用）。
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
// gesture-handler 版 ScrollView：分頁內容裡的橫向捲動區（AI 回覆的寬表格）才能用
// blocksExternalGesture 在原生層攔下換頁手勢（見 src/lib/pagerLock.tsx）。
import { ScrollView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { Newspaper, Sparkles, Bell, Settings } from 'lucide-react-native';
import { useAppTheme } from '../../src/theme';
import { TabBarProvider, PagerProvider, useTabBar } from '../../src/lib/tabBar';
import { PagerLockProvider } from '../../src/lib/pagerLock';
import { FloatingTabBar, type TabDef } from '../../src/components/FloatingTabBar';
import AnnouncementListScreen from '../../src/screens/AnnouncementListScreen';
import AssistantScreen from '../../src/screens/AssistantScreen';
import NotificationsScreen from '../../src/screens/NotificationsScreen';
import ProfileScreen from '../../src/screens/ProfileScreen';

const SCREENS: React.ComponentType<{ active?: boolean }>[] = [
  AnnouncementListScreen,
  AssistantScreen,
  NotificationsScreen,
  ProfileScreen,
];

const TABS: TabDef[] = [
  { key: 'index', label: '公告', icon: ({ color, size }) => <Newspaper size={size} color={color} strokeWidth={2} /> },
  { key: 'assistant', label: '助理', icon: ({ color, size }) => <Sparkles size={size} color={color} strokeWidth={2} /> },
  { key: 'notifications', label: '通知', icon: ({ color, size }) => <Bell size={size} color={color} strokeWidth={2} /> },
  { key: 'profile', label: '設定', icon: ({ color, size }) => <Settings size={size} color={color} strokeWidth={2} /> },
];

export default function TabsPager() {
  return (
    <TabBarProvider>
      <PagerInner />
    </TabBarProvider>
  );
}

function PagerInner() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  // gesture-handler 包裝後的 ref：同時具備 scrollTo 與 handlerTag（供內層 blocksExternalGesture）
  const scrollRef = useRef<any>(null);
  const [index, setIndex] = useState(0);
  const [pagerScroll, setPagerScroll] = useState(true); // 內層橫向捲動（寬表格）期間暫停換頁
  const progress = useSharedValue(0); // 0..count-1 即時頁面位置
  const { resetForPageChange } = useTabBar();

  // 切到新分頁一律顯示底部導覽列（否則會沿用前一頁「已收起」的狀態而消失）
  useEffect(() => {
    resetForPageChange();
  }, [index, resetForPageChange]);

  // 指定分頁：App 圖示長按捷徑（?tab=assistant）與深連結（/profile → ?tab=profile&ts=…）
  // ts 讓「重複導到同一分頁」也能生效（?saved=1 由公告列表自行處理）
  const params = useLocalSearchParams<{ tab?: string; ts?: string }>();
  const appliedTabRef = useRef<string | null>(null);
  useEffect(() => {
    const t = params.tab;
    if (!t) return;
    const key = `${t}:${params.ts ?? ''}`;
    if (appliedTabRef.current === key) return;
    appliedTabRef.current = key;
    const i = TABS.findIndex((x) => x.key === t);
    if (i >= 0) goToTab(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab, params.ts, width]);

  const onHScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = e.nativeEvent.contentOffset.x / Math.max(1, width);
    progress.value = p;
    // 高亮即時跟手：捲過半頁就換上高亮（不必等放開）
    const near = Math.round(p);
    if (near !== index && near >= 0 && near < SCREENS.length) setIndex(near);
  };
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  };
  const goToTab = (i: number) => {
    setIndex(i); // 立即高亮，捲動平滑跟上
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
      <PagerProvider value={{ activeIndex: index, goToTab }}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            scrollEnabled={pagerScroll}
            showsHorizontalScrollIndicator={false}
            onScroll={onHScroll}
            onMomentumScrollEnd={onMomentumEnd}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            // 內層垂直清單可正常捲動；橫向手勢才換頁
            style={{ flex: 1 }}
          >
            <PagerLockProvider setScrollEnabled={setPagerScroll} pagerRef={scrollRef}>
              {SCREENS.map((Screen, i) => (
                <View key={TABS[i].key} style={{ width }}>
                  <Screen active={index === i} />
                </View>
              ))}
            </PagerLockProvider>
          </ScrollView>
          <FloatingTabBar
            tabs={TABS}
            activeIndex={index}
            progress={progress}
            onTabPress={goToTab}
            // 拖曳膠囊即時捲頁；放開吸附
            onScrub={(pos) => scrollRef.current?.scrollTo({ x: pos * width, animated: false })}
            onScrubEnd={(i) => goToTab(i)}
          />
        </View>
      </PagerProvider>
  );
}
