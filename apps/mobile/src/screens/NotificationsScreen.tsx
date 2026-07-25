import React, { useMemo } from 'react';
import { View, RefreshControl, Pressable, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, IconButton, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, BellRing, Bell } from 'lucide-react-native';
import { CATEGORY_NAMES, localDateString, siteConfig } from '@ncue/core';
import { useAuth } from '../lib/auth-context';
import { useAppTheme } from '../theme';
import { CategoryBadge, DeadlineChip, EmptyState } from '../components/ui';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { useTabBarScroll, useTabBarClearance, usePager } from '../lib/tabBar';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

export default function NotificationsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { goToTab } = usePager();
  const { session } = useAuth();
  const qc = useQueryClient();
  const onScroll = useTabBarScroll();
  const clearance = useTabBarClearance();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['subscriptions', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const res = await fetch(`${API}/api/subscriptions`, { headers: { Authorization: `Bearer ${session!.access_token}` } });
      const json = await res.json();
      return (json?.subscriptions ?? []) as any[];
    },
  });

  const unsubscribe = async (annId: string) => {
    if (!session) return;
    await fetch(`${API}/api/subscriptions?announcementId=${annId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
    qc.setQueryData(['subscriptions', session.user.id], (old: any[] = []) => old.filter((s) => s.announcement_id !== annId));
  };

  const subs = data ?? [];

  // 依緊急度分組：3 天內 / 本週 / 更晚（含無期限）
  const sections = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = (s: any) => {
      const end = s.announcements?.application_end_date;
      if (!end) return Number.POSITIVE_INFINITY;
      const d = new Date(end);
      d.setHours(0, 0, 0, 0);
      return Math.round((d.getTime() - today.getTime()) / 86400000);
    };
    const sorted = [...subs].sort((a, b) => daysLeft(a) - daysLeft(b));
    const groups: { title: string; tint: string; items: any[] }[] = [
      { title: '3 天內截止', tint: theme.tokens.dangerBright, items: [] },
      { title: '本週截止', tint: theme.tokens.warnBright, items: [] },
      { title: '之後', tint: theme.colors.primary, items: [] },
    ];
    for (const s of sorted) {
      const d = daysLeft(s);
      if (d <= 3) groups[0].items.push(s);
      else if (d <= 7) groups[1].items.push(s);
      else groups[2].items.push(s);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [subs, theme]);

  // 攤平成含標題列的單一清單（FlatList 用）
  const rows = useMemo(
    () =>
      sections.flatMap((g) => [
        { _type: 'header' as const, title: g.title, tint: g.tint, count: g.items.length },
        ...g.items.map((it: any) => ({ _type: 'item' as const, data: it })),
      ]),
    [sections],
  );

  // 未登入畫面：所有 hooks 之後才 early return（維持 hooks 呼叫順序一致）
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <EmptyState
          icon={Bell}
          title="登入以管理提醒"
          description="登入後可訂閱獎學金截止提醒，並在這裡集中管理。"
          actionLabel="前往登入"
          onAction={() => router.push('/login')}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ color: theme.colors.onSurface, fontWeight: '900', fontSize: 26, letterSpacing: -0.5 }}>通知中心</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>集中管理已訂閱的截止提醒</Text>
      </View>
      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={theme.colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r: any, i: number) => (r._type === 'header' ? `h-${r.title}` : `s-${r.data.announcement_id}-${i}`)}
          contentContainerStyle={{ padding: 16, paddingBottom: clearance, flexGrow: 1 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          ListHeaderComponent={
            subs.length > 0 ? (
              <View className="mb-3 flex-row items-center gap-2 rounded-2xl px-4 py-3" style={{ backgroundColor: theme.colors.primaryContainer }}>
                <BellRing size={18} color={theme.colors.onPrimaryContainer} />
                <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, flex: 1 }}>
                  已訂閱 {subs.length} 則公告，將於截止前依設定天數提醒你。
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item: row, index }) => {
            if (row._type === 'header') {
              return (
                <View className="flex-row items-center" style={{ gap: 7, marginTop: index === 0 ? 0 : 14, marginBottom: 10 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: row.tint }} />
                  <Text style={{ color: theme.colors.onSurface, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 }}>{row.title}</Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5 }}>{row.count}</Text>
                </View>
              );
            }
            const item = row.data;
            const a = item.announcements || {};
            const end = a.application_end_date;
            return (
              <Pressable
                onPress={() => router.push(`/announcement/${item.announcement_id}`)}
                android_ripple={{ color: theme.colors.surfaceVariant }}
                style={{ borderRadius: 20, borderWidth: theme.dark ? 0 : 1, borderColor: theme.colors.outlineVariant, backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surface, padding: 16, marginBottom: 12 }}
              >
                <View className="flex-row items-center justify-between">
                  <CategoryBadge code={a.category} name={CATEGORY_NAMES[a.category]} />
                  <IconButton icon={() => <BellOff size={18} color={theme.colors.error} />} size={18} onPress={() => unsubscribe(item.announcement_id)} />
                </View>
                <Text variant="titleSmall" numberOfLines={2} style={{ color: theme.colors.onSurface, fontWeight: '700', marginTop: 2 }}>
                  {a.title || '（公告）'}
                </Text>
                <View className="mt-2 flex-row items-center justify-between">
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {end ? `截止 ${localDateString(new Date(end))}` : '無期限'} · 截止前 {item.days_before} 天提醒
                  </Text>
                  <DeadlineChip endDate={end} />
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            isError ? (
              <EmptyState icon={BellOff} title="載入失敗" description="無法取得訂閱，請稍後重試。" actionLabel="重試" onAction={() => refetch()} />
            ) : (
              <EmptyState icon={BellOff} title="尚無截止提醒" description="在任一公告詳情頁點「訂閱截止提醒」，即可在這裡集中管理。" actionLabel="瀏覽公告" onAction={() => goToTab(0)} />
            )
          }
          ListFooterComponent={
            subs.length > 0 ? (
              <Button mode="text" onPress={() => registerForPushNotificationsAsync().catch(() => {})} style={{ marginTop: 8 }}>
                開啟系統推播通知
              </Button>
            ) : null
          }
        />
      )}
    </View>
  );
}
