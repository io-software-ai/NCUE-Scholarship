import React, { useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { enterUp } from '../lib/motion';
import { CATEGORY_NAMES, getDeadlineInfo } from '@ncue/core';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../theme';

interface Props {
  announcementId: string;
  title?: string;
}

/**
 * AI 助理內嵌的公告卡片。
 * 設計要點：左側分類色條 + 明確卡面（淺色下不能與聊天白底融在一起）＋
 * 右側箭頭（不再用整行的「查看公告」膠囊，省一行高度、卡片之間才拉得開）。
 */
export const CompactAnnouncementCard: React.FC<Props> = ({ announcementId, title }) => {
  const theme = useAppTheme();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ann-compact', announcementId],
    enabled: !!announcementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, category, application_start_date, application_end_date')
        .eq('id', announcementId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (isLoading) pulse.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
  }, [isLoading, pulse]);
  const skeleton = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.35, 0.75]) }));

  const displayTitle = data?.title || title || (isError ? '查看相關公告' : '');
  const cat = data?.category as string | undefined;
  const catColor = cat ? (theme.tokens.cat as any)[cat] ?? theme.colors.primary : theme.colors.primary;
  const deadline = data ? getDeadlineInfo(data.application_end_date ?? null, data.application_start_date ?? null) : null;
  const deadlineColor =
    deadline?.stampClass === 'text-danger'
      ? theme.tokens.danger
      : deadline?.stampClass === 'text-warn'
        ? theme.tokens.warn
        : theme.colors.onSurfaceVariant;

  // 淺色：淡藍灰卡面（不能用純白，否則與聊天底色融在一起）；深色：抬高一階
  const cardBg = theme.dark ? theme.colors.elevation.level2 : '#F4F7FB';
  const cardBorder = theme.dark ? 'rgba(255,255,255,0.09)' : '#E1E8F0';

  return (
    <Animated.View entering={enterUp()} style={{ marginTop: 12 }}>
      <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
        <Pressable
          onPress={() => router.push(`/announcement/${announcementId}`)}
          android_ripple={{ color: theme.colors.surfaceVariant }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          {/* 左側分類色條 */}
          <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: catColor }} />

          <View style={{ flex: 1, paddingVertical: 13, paddingLeft: 13, paddingRight: 6 }}>
            {isLoading && !displayTitle ? (
              <>
                <Animated.View style={[{ height: 11, width: '44%', borderRadius: 6, backgroundColor: theme.colors.surfaceVariant }, skeleton]} />
                <Animated.View style={[{ height: 14, width: '92%', borderRadius: 7, marginTop: 9, backgroundColor: theme.colors.surfaceVariant }, skeleton]} />
              </>
            ) : (
              <>
                {/* meta 一行：分類 + 截止狀態，字級小、不搶標題 */}
                <View className="flex-row items-center" style={{ gap: 6, marginBottom: 5 }}>
                  {cat ? (
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: catColor, fontSize: 11, fontWeight: '800', letterSpacing: 0.2 }}>
                      {cat}・{CATEGORY_NAMES[cat] ?? ''}
                    </Text>
                  ) : null}
                  {deadline?.stamp ? (
                    <>
                      <Text style={{ color: theme.colors.outline, fontSize: 11 }}>·</Text>
                      <Text style={{ color: deadlineColor, fontSize: 11, fontWeight: '700' }}>{deadline.stamp}</Text>
                    </>
                  ) : null}
                </View>
                <Text numberOfLines={2} style={{ color: theme.colors.onSurface, fontWeight: '700', fontSize: 14, lineHeight: 20, letterSpacing: -0.1 }}>
                  {displayTitle || '查看相關公告'}
                </Text>
              </>
            )}
          </View>

          <View style={{ paddingHorizontal: 10 }}>
            <ChevronRight size={17} color={theme.colors.onSurfaceVariant} />
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
};
