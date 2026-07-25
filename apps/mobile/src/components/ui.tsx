/**
 * 共用 Material 3 UI 原件 — 版面一致、明暗自動、無硬編碼色。
 */
import React from 'react';
import { View, ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import type { LucideIcon } from 'lucide-react-native';
import { getDeadlineInfo } from '@ncue/core';
import { useAppTheme } from '../theme';

/** 具安全區與主題底色的畫面容器 */
export function Screen({
  children,
  edges = ['top', 'left', 'right'],
  style,
}: {
  children: React.ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
}) {
  const theme = useAppTheme();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

/** 置中載入 */
export function LoadingScreen({ message }: { message?: string }) {
  const theme = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center gap-4" style={{ backgroundColor: theme.colors.background }}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {message ?? '載入中…'}
      </Text>
    </View>
  );
}

/** 空 / 錯誤狀態 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View
        className="mb-5 h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.colors.surfaceVariant }}
      >
        <Icon size={34} color={theme.colors.onSurfaceVariant} strokeWidth={1.75} />
      </View>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700', textAlign: 'center' }}>
        {title}
      </Text>
      {description ? (
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, lineHeight: 21 }}
        >
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button mode="contained-tonal" onPress={onAction} style={{ marginTop: 20 }}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

/** 區塊小標 */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const theme = useAppTheme();
  return (
    <Text
      variant="labelLarge"
      style={[{ color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 8 }, style]}
    >
      {children}
    </Text>
  );
}

/** 分類徽章（軟色底） */
export function CategoryBadge({ code, name }: { code?: string | null; name?: string | null }) {
  const theme = useAppTheme();
  const color = (code && theme.tokens.cat[code as keyof typeof theme.tokens.cat]) || theme.colors.onSurfaceVariant;
  return (
    <View
      className="flex-row items-center self-start rounded-full px-2.5 py-1"
      style={{ backgroundColor: color + '1F' }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>
        {code ? `分類 ${code}` : '未分類'}
      </Text>
      {name ? (
        <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: '600', maxWidth: 150 }}>
          {'  ' + name}
        </Text>
      ) : null}
    </View>
  );
}

export interface DeadlineDisplay {
  label: string | null;
  color: string;
  urgent: boolean;
  daysLeft: number | null;
}

/** 由截止/開始日推出顯示資訊 */
export function useDeadlineDisplay() {
  const theme = useAppTheme();
  return (endDate?: string | null, startDate?: string | null): DeadlineDisplay => {
    const info = getDeadlineInfo(endDate ?? null, startDate ?? null);
    let color = theme.colors.onSurfaceVariant;
    if (info.stampClass === 'text-danger') color = theme.tokens.danger;
    else if (info.stampClass === 'text-warn') color = theme.tokens.warn;
    return { label: info.stamp, color, urgent: info.stampClass === 'text-danger', daysLeft: info.daysLeft };
  };
}

/** 截止狀態小藥丸 */
export function DeadlineChip({ endDate, startDate }: { endDate?: string | null; startDate?: string | null }) {
  const display = useDeadlineDisplay()(endDate, startDate);
  if (!display.label) return null;
  return (
    <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: display.color + '1A' }}>
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: display.color }} />
      <Text style={{ color: display.color, fontSize: 12, fontWeight: '700' }}>{display.label}</Text>
    </View>
  );
}
