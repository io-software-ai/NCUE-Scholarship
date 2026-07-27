import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl, Keyboard, Linking } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { enterUp, stagger, UI_TIMING } from '../lib/motion';
import { Text, Searchbar, ActivityIndicator } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Newspaper, ArrowUpNarrowWide, ArrowDownWideNarrow, WifiOff, Bookmark, History, X, SlidersHorizontal, ChevronDown, Check } from 'lucide-react-native';
import { CATEGORY_NAMES, localDateString, daysFromNowString, siteConfig } from '@ncue/core';
import { supabase } from '../lib/supabase';
import { AnnouncementCard } from '../components/AnnouncementCard';
import { EmptyState } from '../components/ui';
import { BottomFade, TopFade } from '../components/BottomFade';
import { BottomSheet } from '../components/BottomSheet';
import { IO_SOFTWARE_LOGO } from '../assets/ioSoftwareLogo';
import { useAppTheme } from '../theme';
import { useLocalStore } from '../lib/localStore';
import { useLocalSearchParams } from 'expo-router';
import { useTabBar, useTabBarClearance } from '../lib/tabBar';

const PAGE_SIZE = 15;
type Status = 'open' | 'all' | 'expired' | 'closing';

const STATUS_TABS: { key: Status; label: string }[] = [
  { key: 'open', label: '開放中' },
  { key: 'closing', label: '即將截止' },
  { key: 'expired', label: '已截止' },
  { key: 'all', label: '全部' },
];
const CATEGORIES = ['all', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export default function AnnouncementList() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { hidden, onScroll } = useTabBar();
  const clearance = useTabBarClearance();
  const [headerH, setHeaderH] = useState(232);
  const [rawSearch, setRawSearch] = useState('');

  // 進場：頂欄輕微放大淡入（統一動效，不做彈跳）
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = withTiming(1, UI_TIMING);
  }, [appear]);

  // 鍵盤開啟時強制顯示頂欄（搜尋框在裡面，不能被收起）
  const kbd = useSharedValue(0);
  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', () => {
      kbd.value = withTiming(1, { duration: 150 });
    });
    const h = Keyboard.addListener('keyboardDidHide', () => {
      kbd.value = withTiming(0, { duration: 150 });
    });
    return () => {
      s.remove();
      h.remove();
    };
  }, [kbd]);

  // 懸浮頂欄：與底部列同一訊號（往下滑收起、往上滑 Q 彈回來）＋ 進場縮放展開
  const headerStyle = useAnimatedStyle(() => {
    const eff = hidden.value * (1 - kbd.value);
    const a = appear.value;
    return {
      transform: [{ translateY: -(headerH + 34) * eff }, { scale: 0.94 + 0.06 * a }],
      opacity: interpolate(eff, [0, 0.8], [1, 0], Extrapolation.CLAMP) * a,
    };
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('open');
  const [category, setCategory] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState(true);
  const [onlySaved, setOnlySaved] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const { bookmarks, searches, pushSearch, removeSearch } = useLocalStore();

  // App 圖示長按捷徑「我的收藏」：?saved=1 進來就開啟只看收藏
  const params = useLocalSearchParams<{ saved?: string }>();
  const appliedSavedRef = useRef<string | null>(null);
  useEffect(() => {
    const v = params.saved;
    if (!v || appliedSavedRef.current === v) return;
    appliedSavedRef.current = v;
    setOnlySaved(true);
  }, [params.saved]);

  // debounce 搜尋（送出後記入搜尋歷史）
  useEffect(() => {
    const t = setTimeout(() => {
      const term = rawSearch.trim();
      setSearch(term);
      if (term) pushSearch(term);
    }, 450);
    return () => clearTimeout(t);
  }, [rawSearch, pushSearch]);

  const filters = useMemo(() => ({ search, status, category, sortAsc }), [search, status, category, sortAsc]);

  const { data: stats } = useQuery({
    queryKey: ['ann-stats'],
    queryFn: async () => {
      const today = localDateString();
      const week = daysFromNowString(7);
      // 用 count:'exact' + limit(1)：只抓 1 列但 Content-Range 會回完整總數（自架後端對 head:true 不穩）
      const base = () => supabase.from('announcements').select('id', { count: 'exact' }).eq('is_active', true).limit(1);
      const [open, closing, total] = await Promise.all([
        base().or(`application_end_date.gte.${today},application_end_date.is.null`),
        base().gte('application_end_date', today).lte('application_end_date', week),
        base(),
      ]);
      if (total.error) throw total.error; // 失敗就讓 query 進入 error 狀態，而非靜默顯示 0
      return { open: open.count ?? 0, closing: closing.count ?? 0, total: total.count ?? 0 };
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch, isRefetching } =
    useInfiniteQuery({
      queryKey: ['announcements', filters],
      queryFn: async ({ pageParam = 0 }) => {
        const today = localDateString();
        let q = supabase
          .from('announcements')
          .select(
            'id, title, category, summary, target_audience, application_start_date, application_end_date, application_limitations, submission_method',
          )
          .eq('is_active', true);

        // 清掉 PostgREST .or() 的保留字元（逗號/括號/萬用字元），避免搜尋含這些字時 filter 字串被拆壞
        const safe = search.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
        if (safe) q = q.or(`title.ilike.%${safe}%,summary.ilike.%${safe}%,target_audience.ilike.%${safe}%`);
        if (category !== 'all') q = q.eq('category', category);
        if (status === 'open') q = q.or(`application_end_date.gte.${today},application_end_date.is.null`);
        else if (status === 'expired') q = q.lt('application_end_date', today);
        else if (status === 'closing')
          q = q.gte('application_end_date', today).lte('application_end_date', daysFromNowString(7));

        q = q
          .order('application_end_date', { ascending: sortAsc, nullsFirst: false })
          .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

        const { data, error } = await q;
        if (error) throw error;
        return { items: data ?? [], nextPage: (data?.length ?? 0) === PAGE_SIZE ? pageParam + 1 : undefined };
      },
      initialPageParam: 0,
      getNextPageParam: (last) => last.nextPage,
    });

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];
  // 「只看收藏」為本機篩選（收藏存在裝置端，不動後端查詢）
  const items = onlySaved ? allItems.filter((a: any) => bookmarks.includes(String(a.id))) : allItems;

  const StatPill = ({ value, label, color, active, onPress }: any) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 14,
        backgroundColor: active ? color + '1C' : theme.colors.surface,
        borderWidth: 1,
        borderColor: active ? color + '4D' : theme.colors.outlineVariant,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Text style={{ color, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 }}>{value ?? '—'}</Text>
      <View className="flex-row items-center" style={{ gap: 5, marginTop: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* 懸浮頂部篩選層（往下滑收起、往上滑彈回；鍵盤開啟時固定顯示） */}
      <Animated.View
        pointerEvents="box-none"
        onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }, headerStyle]}
      >
        <TopFade height={headerH + 44} />
        <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 16 }}>
        {/* 標題渲染在塗層之上（同一浮動面板，一起收合／展開） */}
        <View className="flex-row items-end justify-between" style={{ marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: '900', fontSize: 26, letterSpacing: -0.5 }}>獎學金公告</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>{siteConfig.schoolShort}學務處生輔組彙整</Text>
          </View>
          {/* 開發團隊署名 */}
          <Pressable
            onPress={() => Linking.openURL(siteConfig.developer.url).catch(() => {})}
            hitSlop={8}
            style={({ pressed }) => ({ alignItems: 'flex-end', paddingBottom: 3, marginLeft: 12, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 9.5, letterSpacing: 0.3, fontWeight: '600', opacity: 0.7, marginBottom: 4 }}>
              Powered by
            </Text>
            <SvgXml xml={IO_SOFTWARE_LOGO} width={96} height={21} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>
        <Searchbar
          placeholder="搜尋標題、摘要、適用對象"
          value={rawSearch}
          onChangeText={setRawSearch}
          elevation={0}
          style={{
            // Paper 的 Searchbar 預設約 56 高（Material 3 規格），這裡壓扁一些
            height: 46,
            backgroundColor: theme.dark ? theme.colors.elevation.level2 : theme.colors.surface,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            shadowColor: '#0F2137',
            shadowOpacity: theme.dark ? 0 : 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: theme.dark ? 0 : 2,
          }}
          inputStyle={{ minHeight: 0, paddingVertical: 0, fontSize: 14.5, color: theme.colors.onSurface }}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
        />

        {/* 搜尋歷史：聚焦且尚未輸入時顯示 */}
        {searchFocused && !rawSearch && searches.length > 0 ? (
          <Animated.View
            entering={enterUp()}
            style={{
              marginTop: 8,
              borderRadius: 18,
              backgroundColor: theme.dark ? theme.colors.elevation.level2 : theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, paddingHorizontal: 14, paddingVertical: 6 }}>
              最近搜尋
            </Text>
            {searches.map((s) => (
              <View key={s} className="flex-row items-center" style={{ paddingHorizontal: 6 }}>
                <Pressable
                  onPress={() => setRawSearch(s)}
                  android_ripple={{ color: theme.colors.surfaceVariant }}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12 }}
                >
                  <History size={15} color={theme.colors.onSurfaceVariant} />
                  <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.onSurface, fontSize: 14 }}>{s}</Text>
                </Pressable>
                <Pressable onPress={() => removeSearch(s)} hitSlop={10} style={{ padding: 8 }}>
                  <X size={14} color={theme.colors.outline} />
                </Pressable>
              </View>
            ))}
          </Animated.View>
        ) : null}

        {/* 狀態分頁 + 收藏 + 排序
            仍不使用橫向 ScrollView（會被左右換頁的手勢攔截）。
            改為單列不換行：晶片以 flexShrink 讓出空間，窄螢幕上一起等比壓縮而不斷行。 */}
        <View className="mt-3 flex-row items-center justify-between">
          <View className="flex-row items-center" style={{ flex: 1, gap: 5 }}>
            {STATUS_TABS.map((t) => {
              const active = status === t.key && !onlySaved;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    setStatus(t.key);
                    setOnlySaved(false);
                  }}
                  style={{ flexShrink: 1, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? theme.colors.primary : theme.colors.surfaceVariant }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 12 }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
            {/* 只看收藏 */}
            <Pressable
              onPress={() => setOnlySaved((v) => !v)}
              style={{
                flexShrink: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 9,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: onlySaved ? theme.colors.primary : theme.colors.surfaceVariant,
              }}
            >
              <Bookmark
                size={12}
                color={onlySaved ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}
                fill={onlySaved ? theme.colors.onPrimary : 'transparent'}
              />
              <Text
                numberOfLines={1}
                style={{ color: onlySaved ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 12 }}
              >
                收藏{bookmarks.length ? ` ${bookmarks.length}` : ''}
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setSortAsc((v) => !v)}
            hitSlop={8}
            style={{ marginLeft: 6, height: 32, width: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: theme.colors.surfaceVariant }}
          >
            {sortAsc ? (
              <ArrowUpNarrowWide size={17} color={theme.colors.onSurfaceVariant} />
            ) : (
              <ArrowDownWideNarrow size={17} color={theme.colors.onSurfaceVariant} />
            )}
          </Pressable>
        </View>

        {/* 分類：改用篩選面板（分類全名很長，橫滑列在換頁手勢下不可用也難選） */}
        <Pressable
          onPress={() => setCatSheetOpen(true)}
          style={{
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: category === 'all' ? theme.colors.surfaceVariant : theme.colors.primaryContainer,
          }}
        >
          <SlidersHorizontal size={15} color={category === 'all' ? theme.colors.onSurfaceVariant : theme.colors.primary} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: category === 'all' ? theme.colors.onSurfaceVariant : theme.colors.primary, fontSize: 13, fontWeight: '700' }}
          >
            {category === 'all' ? '全部分類' : `${category}・${CATEGORY_NAMES[category] ?? category}`}
          </Text>
          <ChevronDown size={15} color={category === 'all' ? theme.colors.onSurfaceVariant : theme.colors.primary} />
        </Pressable>
        </View>
      </Animated.View>

      <CategorySheet
        open={catSheetOpen}
        current={category}
        onClose={() => setCatSheetOpen(false)}
        onPick={(c) => {
          setCategory(c);
          setCatSheetOpen(false);
        }}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.onSurfaceVariant }}>正在載入公告…</Text>
        </View>
      ) : isError ? (
        <EmptyState
          icon={WifiOff}
          title="載入失敗"
          description="無法取得公告，請確認網路後重試。"
          actionLabel="重新載入"
          onAction={() => refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={enterUp(stagger(index))}
              style={{ paddingVertical: 13 }}
            >
              <AnnouncementCard announcement={item} index={index} />
            </Animated.View>
          )}
          contentContainerStyle={{ paddingTop: headerH + 6, paddingHorizontal: 16, paddingBottom: clearance }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
              progressBackgroundColor={theme.colors.surface}
              progressViewOffset={headerH - 20}
            />
          }
          ListHeaderComponent={
            <View className="mb-3 flex-row gap-2.5" style={{ paddingBottom: 2 }}>
              <StatPill value={stats?.open} label="開放申請" color={theme.tokens.okBright} active={status === 'open'} onPress={() => setStatus('open')} />
              <StatPill value={stats?.closing} label="7 日內截止" color={theme.tokens.warnBright} active={status === 'closing'} onPress={() => setStatus('closing')} />
              <StatPill value={stats?.total} label="公告總數" color={theme.colors.primary} active={status === 'all'} onPress={() => setStatus('all')} />
            </View>
          }
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 20 }} color={theme.colors.primary} /> : null}
          ListEmptyComponent={
            onlySaved ? (
              <EmptyState
                icon={Bookmark}
                title="尚無收藏"
                description="在公告卡片右上角點書籤即可收藏，方便之後比較。"
                actionLabel="看全部公告"
                onAction={() => setOnlySaved(false)}
              />
            ) : (
              <EmptyState
                icon={Newspaper}
                title="找不到公告"
                description="目前沒有符合條件的獎學金公告，試試調整關鍵字或篩選。"
              />
            )
          }
        />
      )}
      {/* 底部霧化淡出：列表滑到底融入背景，不被浮動列硬切 */}
      <BottomFade />
    </View>
  );
}

/** 分類篩選面板：分類全名很長，用底部面板一次列完（取代橫滑 chip 列）。可下拉關閉。 */
function CategorySheet({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onPick: (c: string) => void;
}) {
  const theme = useAppTheme();
  return (
    <BottomSheet open={open} onClose={onClose}>
      <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 18, marginBottom: 6 }}>
        <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 16.5 }}>依分類篩選</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <X size={20} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 30 }}>
        {CATEGORIES.map((c) => {
          const active = current === c;
          const name = c === 'all' ? '全部分類' : CATEGORY_NAMES[c] ?? c;
          return (
            <Pressable
              key={c}
              onPress={() => onPick(c)}
              android_ripple={{ color: theme.colors.surfaceVariant }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 12,
                paddingVertical: 14,
                borderRadius: 14,
                backgroundColor: active ? theme.colors.primaryContainer : 'transparent',
              }}
            >
              {c !== 'all' ? (
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: (theme.tokens.cat as any)[c] + '22' }}>
                  <Text style={{ color: (theme.tokens.cat as any)[c], fontWeight: '900', fontSize: 13 }}>{c}</Text>
                </View>
              ) : (
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceVariant }}>
                  <Newspaper size={15} color={theme.colors.onSurfaceVariant} />
                </View>
              )}
              <Text style={{ flex: 1, color: active ? theme.colors.primary : theme.colors.onSurface, fontSize: 14.5, fontWeight: active ? '800' : '600', lineHeight: 20 }}>
                {name}
              </Text>
              {active ? <Check size={18} color={theme.colors.primary} strokeWidth={3} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
