import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { ChevronRight, CalendarClock, Bookmark, Check } from 'lucide-react-native';
import { CATEGORY_NAMES, stripHtml, localDateString } from '@ncue/core';
import { useAppTheme } from '../theme';
import { useLocalStore } from '../lib/localStore';
import { CategoryBadge, DeadlineChip } from './ui';

export interface AnnouncementCardProps {
  announcement: any;
  index?: number;
}

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({ announcement, index = 0 }) => {
  const theme = useAppTheme();
  const router = useRouter();
  const { isBookmarked, toggleBookmark, isRead } = useLocalStore();
  const id = String(announcement.id);
  const saved = isBookmarked(id);
  const read = isRead(id);

  const preview = stripHtml(announcement.summary || announcement.target_audience || '', 78);
  const endDate = announcement.application_end_date;
  const dateLabel = endDate ? `截止 ${localDateString(new Date(endDate))}` : '長期受理・無期限';

  // 斑馬紋：相鄰卡片交錯底色。刻意做「很淡」——只夠讓眼睛分出邊界，
  // 不會讓列表看起來一深一淺像兩種卡片（淺色差 ~2%、深色差 ~3% 亮度）。
  const even = index % 2 === 0;
  const bg = theme.dark
    ? even
      ? '#1A212A'
      : '#1E262F'
    : even
      ? theme.tokens.surface // #FFFFFF
      : '#F7F9FC';
  const border = theme.dark ? 'rgba(255,255,255,0.07)' : theme.colors.outlineVariant;

  return (
    <Pressable
      onPress={() => router.push(`/announcement/${announcement.id}`)}
      android_ripple={{ color: theme.colors.surfaceVariant }}
      style={({ pressed }) => ({
        borderRadius: 22,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        paddingHorizontal: 18,
        paddingVertical: 18,
        // 淺色用柔和陰影取代生硬邊框感；深色用色階分層
        shadowColor: '#0F2137',
        shadowOpacity: theme.dark ? 0 : 0.09,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: theme.dark ? 0 : 3,
        opacity: pressed ? 0.97 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      {/* 分類 + 截止 */}
      <View className="flex-row items-center justify-between">
        <CategoryBadge code={announcement.category} name={CATEGORY_NAMES[announcement.category]} />
        <DeadlineChip endDate={endDate} startDate={announcement.application_start_date} />
      </View>

      {/* 標題（已看過 → 淡化，快速辨識沒讀過的） */}
      <View className="flex-row items-start" style={{ gap: 10, marginTop: 13 }}>
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            color: read ? theme.colors.onSurfaceVariant : theme.colors.onSurface,
            fontWeight: read ? '600' : '800',
            fontSize: 17,
            lineHeight: 26,
            letterSpacing: -0.2,
          }}
        >
          {announcement.title}
        </Text>
        {/* 收藏（本機） */}
        <Pressable
          onPress={() => toggleBookmark(id)}
          hitSlop={10}
          style={{ marginTop: 1, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
        >
          <Bookmark
            size={19}
            color={saved ? theme.colors.primary : theme.colors.outline}
            fill={saved ? theme.colors.primary : 'transparent'}
          />
        </Pressable>
      </View>

      {/* 摘要 */}
      {preview ? (
        <Text numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant, fontSize: 13.5, lineHeight: 20.5, marginTop: 8 }}>
          {preview}
        </Text>
      ) : null}

      {/* 頁尾 */}
      <View className="flex-row items-center justify-between" style={{ marginTop: 16 }}>
        <View className="flex-row items-center gap-1.5">
          {read ? (
            <>
              <Check size={13} color={theme.colors.onSurfaceVariant} strokeWidth={3} />
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, fontWeight: '600' }}>已看過</Text>
              <Text style={{ color: theme.colors.outline, fontSize: 12.5 }}>·</Text>
            </>
          ) : (
            <CalendarClock size={14} color={theme.colors.onSurfaceVariant} />
          )}
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, fontWeight: '600' }}>{dateLabel}</Text>
        </View>
        <View
          className="flex-row items-center"
          style={{ gap: 3, backgroundColor: theme.colors.primaryContainer, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}
        >
          <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '800' }}>查看詳情</Text>
          <ChevronRight size={14} color={theme.colors.primary} />
        </View>
      </View>
    </Pressable>
  );
};
