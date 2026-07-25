import React, { useState } from 'react';
import { View, ScrollView, Pressable, Linking, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Stack } from 'expo-router';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { enterUp, enterFade, stagger } from '../src/lib/motion';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, HelpCircle, Info, TriangleAlert, ExternalLink } from 'lucide-react-native';
import { siteConfig } from '@ncue/core';
import { useAppTheme, type AppTheme } from '../src/theme';
import { EmptyState } from '../src/components/ui';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

/* ── 行內標記渲染：**粗體**、==重點==、[文字](url)（與網頁版 FaqAnswer 同規格） ── */

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const MARK_RE = /\*\*([^*]+)\*\*|==([^=]+)==/g;

function renderMarks(text: string, theme: AppTheme, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <Text key={`${kp}b${i}`} style={{ fontWeight: '800', color: theme.colors.onSurface }}>
          {m[1]}
        </Text>,
      );
    } else {
      out.push(
        <Text key={`${kp}h${i}`} style={{ backgroundColor: theme.tokens.warn + '33', color: theme.colors.onSurface, fontWeight: '600' }}>
          {m[2]}
        </Text>,
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderInline(text: string, theme: AppTheme, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) out.push(...renderMarks(text.slice(last, m.index), theme, `${kp}t${i}`));
    const url = m[2];
    out.push(
      <Text
        key={`${kp}a${i}`}
        style={{ color: theme.colors.primary, textDecorationLine: 'underline', fontWeight: '600' }}
        onPress={() => Linking.openURL(url).catch(() => {})}
      >
        {renderMarks(m[1], theme, `${kp}al${i}`)}
      </Text>,
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(...renderMarks(text.slice(last), theme, `${kp}e`));
  return out;
}

/* ── 區塊渲染：paragraph / list / steps / note / warn ── */

function AnswerBlocks({ blocks }: { blocks: any[] }) {
  const theme = useAppTheme();
  const body = { color: theme.colors.onSurfaceVariant, fontSize: 14, lineHeight: 22 } as const;
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, bi) => {
        if (!b) return null;
        if (b.type === 'list' || b.type === 'steps') {
          const items: string[] = Array.isArray(b.items) ? b.items : [];
          return (
            <View key={bi} style={{ gap: 7 }}>
              {items.map((it, ii) => (
                <View key={ii} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ width: 24, alignItems: 'center', paddingTop: b.type === 'steps' ? 1 : 8 }}>
                    {b.type === 'steps' ? (
                      <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '800' }}>{ii + 1}.</Text>
                    ) : (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary }} />
                    )}
                  </View>
                  <Text style={[body, { flex: 1 }]}>{renderInline(String(it), theme, `b${bi}i${ii}`)}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (b.type === 'note' || b.type === 'warn') {
          const isWarn = b.type === 'warn';
          const tint = isWarn ? theme.tokens.warn : theme.colors.primary;
          return (
            <View
              key={bi}
              style={{
                flexDirection: 'row',
                gap: 10,
                padding: 12,
                borderRadius: 14,
                backgroundColor: tint + '14',
                borderWidth: 1,
                borderColor: tint + '33',
              }}
            >
              {isWarn ? <TriangleAlert size={16} color={tint} style={{ marginTop: 2 }} /> : <Info size={16} color={tint} style={{ marginTop: 2 }} />}
              <Text style={[body, { flex: 1 }]}>{renderInline(String(b.text ?? ''), theme, `b${bi}`)}</Text>
            </View>
          );
        }
        // paragraph（含未知型別後備）
        return (
          <Text key={bi} style={body}>
            {renderInline(String(b.text ?? b), theme, `b${bi}`)}
          </Text>
        );
      })}
    </View>
  );
}

function parseAnswer(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j;
    } catch {
      /* 純文字 */
    }
    return [{ type: 'paragraph', text: raw }];
  }
  return [];
}

/* ── FAQ 項目（手風琴） ── */

function FaqItem({ q, blocks, index }: { q: string; blocks: any[]; index: number }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const rot = useSharedValue(0);
  const toggle = () => {
    setOpen((v) => !v);
    rot.value = withTiming(open ? 0 : 1, { duration: 220 });
  };
  const chev = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(rot.value, [0, 1], [0, 180])}deg` }] }));

  return (
    <Animated.View
      entering={enterUp(stagger(index))}
      style={{
        borderRadius: 20,
        backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surface,
        borderWidth: theme.dark ? 0 : 1,
        borderColor: theme.colors.outlineVariant,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <Pressable onPress={toggle} android_ripple={{ color: theme.colors.surfaceVariant }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
          <HelpCircle size={17} color={theme.colors.primary} />
        </View>
        <Text style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '700', fontSize: 14.5, lineHeight: 21 }}>{q}</Text>
        <Animated.View style={chev}>
          <ChevronDown size={18} color={theme.colors.onSurfaceVariant} />
        </Animated.View>
      </Pressable>
      {open ? (
        <Animated.View entering={enterFade()} style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2 }}>
          <AnswerBlocks blocks={blocks} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/* ── 頁面 ── */

export default function FaqScreen() {
  const theme = useAppTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['faqs'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/faqs`);
      const json = await res.json();
      return (json?.faqs ?? []) as any[];
    },
    staleTime: 1000 * 60 * 30,
  });

  const faqs = data ?? [];

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: true, title: '常見問題' }} />
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {faqs.length === 0 ? (
            <EmptyState
              icon={HelpCircle}
              title={isError ? '載入失敗' : '尚無常見問題'}
              description={isError ? '請下拉重試，或前往網頁版查看。' : '完整說明請前往網頁版資源頁。'}
              actionLabel="開啟網頁版資源頁"
              onAction={() => Linking.openURL(`${siteConfig.url}/resource`)}
            />
          ) : (
            <>
              {faqs.map((f: any, i: number) => (
                <FaqItem key={String(f.id ?? i)} q={String(f.question ?? '')} blocks={parseAnswer(f.answer)} index={i} />
              ))}
              <Pressable
                onPress={() => Linking.openURL(`${siteConfig.url}/resource`)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 18 }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 13.5 }}>更多資源與說明（網頁版）</Text>
                <ExternalLink size={14} color={theme.colors.primary} />
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
