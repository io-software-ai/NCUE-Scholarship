import React, { useEffect, useState } from 'react';
import { View, ScrollView, Linking, Share, Pressable, Modal, useWindowDimensions } from 'react-native';
import { Text, ActivityIndicator, Button, Divider } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { enterUp } from '../../src/lib/motion';
import {
  CATEGORY_NAMES,
  getFileKind,
  formatFileSize,
  buildGoogleCalendarUrl,
  buildIcsContent,
  getPublicAttachmentUrl,
  localDateString,
  siteConfig,
} from '@ncue/core';
import {
  CalendarPlus,
  Share2,
  Bell,
  BellRing,
  BellOff,
  FileText,
  ExternalLink,
  Eye,
  Users,
  Send,
  Repeat2,
  WifiOff,
  Globe,
  Download,
  ClipboardPen,
  FileDown,
  Check,
  X,
  Bookmark,
} from 'lucide-react-native';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth-context';
import { useAppTheme, type AppTheme } from '../../src/theme';
import { useLocalStore } from '../../src/lib/localStore';
import { useAlert } from '../../src/components/dialogs';
import { CategoryBadge, DeadlineChip, SectionLabel, EmptyState } from '../../src/components/ui';
import { RichContent } from '../../src/components/RichContent';
import { BottomSheet } from '../../src/components/BottomSheet';
import { PagerLockProvider } from '../../src/lib/pagerLock';
import { openWithDefaultApp, writeCacheFile } from '../../src/lib/openFile';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;
const SUB_DAY_OPTIONS = [1, 3, 5, 7]; // 與網頁版一致

/** 附件類型徽章顏色（對齊 web：PDF 紅 / DOC 藍 / XLS 綠 / PPT·IMG 橘） */
function kindColor(label: string, theme: AppTheme) {
  switch (label) {
    case 'PDF':
      return theme.tokens.danger;
    case 'DOC':
      return theme.tokens.primary;
    case 'XLS':
      return theme.tokens.ok;
    case 'PPT':
    case 'IMG':
      return theme.tokens.warn;
    default:
      return theme.tokens.inkSoft;
  }
}

/**
 * 路由層：左右換頁分頁器（與主頁分頁相同體驗 —— 拖曳即時預覽上下一則、放開順暢切換）。
 * 用橫向 pagingEnabled ScrollView，並「開窗」只掛載目前 ±1 頁（清單可達數百則）。
 * 瀏覽數只在頁面成為 active（真正停留）時才計，預覽不灌水。
 */
export default function AnnouncementPager() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useAppTheme();

  // 左右滑動切換公告：與列表相同排序（截止日近的在前）
  const { data: idList } = useQuery({
    queryKey: ['ann-id-list'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id')
        .eq('is_active', true)
        .order('application_end_date', { ascending: true, nullsFirst: false })
        .limit(500);
      return (data ?? []).map((r: any) => String(r.id));
    },
  });

  const list = idList ?? [];
  // 清單未就緒或找不到本則 → 單頁呈現（不進分頁器）
  if (list.length === 0 || list.indexOf(String(id)) === -1) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <AnnouncementDetailView id={String(id)} active />
      </View>
    );
  }
  return <Pager list={list} startId={String(id)} />;
}

function Pager({ list, startId }: { list: string[]; startId: string }) {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(() => Math.max(0, list.indexOf(startId)));
  const [pagerH, setPagerH] = useState(0);
  // 內文裡的寬表格橫向捲動時，暫時關閉換頁，避免水平手勢被搶去切換公告
  const [pagerScroll, setPagerScroll] = useState(true);

  // 位置指示只在進頁／換頁時短暫出現，之後自動淡出（不常駐擋內容）
  const hint = useSharedValue(0);
  const showHint = () => {
    hint.value = withTiming(1, { duration: 140 });
    hint.value = withDelay(1600, withTiming(0, { duration: 420 }));
  };
  useEffect(() => {
    showHint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));

  const onMomentumEnd = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== index && i >= 0 && i < list.length) setIndex(i);
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      onLayout={(e) => setPagerH(Math.round(e.nativeEvent.layout.height))}
    >
      <ScrollView
        horizontal
        pagingEnabled
        scrollEnabled={pagerScroll}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        contentOffset={{ x: index * width, y: 0 }}
      >
        <PagerLockProvider value={setPagerScroll}>
          {list.map((annId, i) => (
            <View key={annId} style={{ width, height: pagerH || height }}>
              {/* 開窗：只掛載目前 ±1 頁；其餘留空占位（拖曳單次最多到相鄰頁，看不到占位） */}
              {Math.abs(i - index) <= 1 ? <AnnouncementDetailView id={annId} active={i === index} /> : null}
            </View>
          ))}
        </PagerLockProvider>
      </ScrollView>

      {/* 位置指示：進頁／換頁時短暫顯示後自動淡出 */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 10,
            alignSelf: 'center',
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: theme.dark ? 'rgba(23,30,38,0.9)' : 'rgba(255,255,255,0.92)',
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          },
          hintStyle,
        ]}
      >
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, fontWeight: '700' }}>
          {index + 1} / {list.length}
        </Text>
      </Animated.View>
    </View>
  );
}

function AnnouncementDetailView({ id, active }: { id: string; active: boolean }) {
  const theme = useAppTheme();
  const { session } = useAuth();
  const { markRead, isBookmarked, toggleBookmark } = useLocalStore();
  const alert = useAlert();

  // 真正停留在這一則才標記為已看過（預覽相鄰頁不算）
  useEffect(() => {
    if (active && id) markRead(id);
  }, [active, id, markRead]);
  const [subSheetOpen, setSubSheetOpen] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [liveViews, setLiveViews] = useState<number | null>(null);


  const { data: ann, isLoading, isError, refetch } = useQuery({
    queryKey: ['announcement', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('announcements').select('*, attachments(*)').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });

  // 瀏覽數 +1：僅在頁面成為 active（真正停留）時計，避免預覽相鄰頁灌水。
  // 後端 insert announcement_views（同 IP 每小時去重）+ trigger 累加，回傳最新值 → 更新畫面。
  useEffect(() => {
    if (!id || !active) return;
    setLiveViews(null);
    fetch(`${API}/api/announcements/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcementId: id }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (typeof j?.view_count === 'number') setLiveViews(j.view_count);
      })
      .catch(() => {});
  }, [id, active]);

  // 訂閱狀態（含天數）
  const { data: mySub, refetch: refetchSub } = useQuery({
    queryKey: ['sub', id, session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const res = await fetch(`${API}/api/subscriptions`, { headers: { Authorization: `Bearer ${session!.access_token}` } });
      const json = await res.json();
      const hit = json?.subscriptions?.find((s: any) => String(s.announcement_id) === String(id));
      return hit ? { days: hit.days_before as number } : null;
    },
  });

  const subscribe = async (days: number) => {
    if (!session) {
      alert({ title: '請先登入', description: '登入後即可訂閱截止提醒。', tone: 'info' });
      return;
    }
    setSubBusy(true);
    try {
      await fetch(`${API}/api/subscriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementId: id, daysBefore: days }),
      });
      await refetchSub();
      setSubSheetOpen(false);
    } catch {
      alert({ title: '操作失敗', description: '請稍後再試。', tone: 'error' });
    } finally {
      setSubBusy(false);
    }
  };

  const unsubscribe = async () => {
    if (!session) return;
    setSubBusy(true);
    try {
      await fetch(`${API}/api/subscriptions?announcementId=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await refetchSub();
      setSubSheetOpen(false);
    } finally {
      setSubBusy(false);
    }
  };

  const handleShare = () => {
    if (!ann) return;
    const url = `${siteConfig.url}/announcement/${ann.id}`;
    Share.share({ title: ann.title, message: `【${siteConfig.shortName}】${ann.title}\n${url}`, url });
  };

  /**
   * 加入日曆：產生 .ics 直接交給「裝置預設行事曆 App」開啟（Android 走 ACTION_VIEW，不跳分享選單）。
   * 全部失敗（例如裝置沒有任何行事曆 App）才退回 Google 日曆網頁版。
   */
  const handleCalendar = async () => {
    if (!ann) return;
    const ics = buildIcsContent(ann, siteConfig.url);
    if (!ics) {
      alert({ title: '無法加入日曆', description: '此公告沒有截止日期。', tone: 'info' });
      return;
    }
    const openGoogleFallback = () => {
      const url = buildGoogleCalendarUrl(ann, siteConfig.url);
      if (url) Linking.openURL(url).catch(() => {});
    };
    try {
      const uri = await writeCacheFile(`scholarship-${ann.id}.ics`, ics);
      const opened = await openWithDefaultApp({
        uri,
        mimeType: 'text/calendar',
        utiType: 'com.apple.ical.ics',
        dialogTitle: '加入行事曆',
      });
      if (!opened) openGoogleFallback();
    } catch {
      openGoogleFallback();
    }
  };

  // 下載 PDF（expo-print：HTML → PDF → 用系統預設 PDF 閱讀器開啟）
  const downloadPdf = async () => {
    if (!ann) return;
    try {
      const Print: any = await import('expo-print');
      const { uri } = await Print.printToFileAsync({ html: buildPrintableHtml(ann) });
      const opened = await openWithDefaultApp({
        uri,
        mimeType: 'application/pdf',
        utiType: 'com.adobe.pdf',
        dialogTitle: ann.title,
      });
      if (!opened) alert({ title: '已產生 PDF', description: `找不到可開啟 PDF 的 App。\n檔案位置：${uri}`, tone: 'info' });
    } catch {
      alert({ title: '此版本尚未支援 PDF', description: '需要重新 build App（開發版）後才能使用 PDF 下載。', tone: 'info' });
    }
  };

  // 現場交件登記（同網頁：Google 表單預填 internal_id + 姓名/學號）
  const openOnSiteForm = () => {
    if (!ann?.internal_id) return;
    const meta = session?.user?.user_metadata ?? {};
    const name = meta.full_name || meta.name || '';
    const sid = String(meta.student_id || '').toUpperCase();
    const url =
      `https://docs.google.com/forms/d/e/1FAIpQLSct6GjpISj20foOtBK4TVcMCpSfULcagZTTN4_YkFTNK1DQbQ/viewform?usp=pp_url&entry.40872308=${ann.internal_id}` +
      (name ? `&entry.146368827=${encodeURIComponent(name)}` : '') +
      (sid ? `&entry.609200579=${encodeURIComponent(sid)}` : '');
    Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }
  if (isError || !ann) {
    return <EmptyState icon={WifiOff} title="找不到公告" description="該公告可能已下架或連結失效。" actionLabel="重試" onAction={() => refetch()} />;
  }

  const start = ann.application_start_date ? localDateString(new Date(ann.application_start_date)) : null;
  const end = ann.application_end_date ? localDateString(new Date(ann.application_end_date)) : null;
  const period = end ? (start ? `${start} ~ ${end}` : `即日起至 ${end}`) : '長期受理・無期限';
  const concurrent = ann.application_limitations === 'Y' ? '可兼領其他獎學金' : ann.application_limitations === 'N' ? '不可兼領其他獎學金' : '未指定';
  const attachments = [...(ann.attachments || [])].sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const externalUrls = parseExternalUrls(ann.external_urls);
  const cardBg = theme.dark ? theme.colors.elevation.level1 : theme.colors.surface;

  const Field = ({ icon: Icon, label, value, html }: any) => (
    <View className="mb-5">
      <View className="mb-2 flex-row items-center gap-1.5">
        <Icon size={15} color={theme.colors.primary} />
        <SectionLabel style={{ marginBottom: 0 }}>{label}</SectionLabel>
      </View>
      {html !== undefined ? (
        <RichContent html={html || '未特別註明'} />
      ) : (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, lineHeight: 22 }}>
          {value}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        <View className="mb-2 flex-row items-center justify-between">
          <CategoryBadge code={ann.category} name={CATEGORY_NAMES[ann.category]} />
          <View className="flex-row items-center" style={{ gap: 12 }}>
            {(() => {
              const views = liveViews ?? (typeof ann.view_count === 'number' ? ann.view_count : null);
              return views !== null ? (
                <View className="flex-row items-center gap-1">
                  <Eye size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{views} 次瀏覽</Text>
                </View>
              ) : null;
            })()}
            <Pressable onPress={() => toggleBookmark(id)} hitSlop={10}>
              <Bookmark
                size={19}
                color={isBookmarked(id) ? theme.colors.primary : theme.colors.outline}
                fill={isBookmarked(id) ? theme.colors.primary : 'transparent'}
              />
            </Pressable>
          </View>
        </View>

        <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 23, lineHeight: 33, letterSpacing: -0.3 }}>
          {ann.title}
        </Text>

        {/* 期程卡 */}
        <View style={{ marginTop: 18, borderRadius: 20, backgroundColor: theme.colors.primaryContainer, padding: 18 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text style={{ color: theme.colors.primary, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.4, marginBottom: 6 }}>
                申請期間
              </Text>
              <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 17 }}>{period}</Text>
            </View>
            <DeadlineChip endDate={ann.application_end_date} startDate={ann.application_start_date} />
          </View>
        </View>

        <View style={{ height: 20 }} />
        <Field icon={Send} label="送件方式" html={ann.submission_method} />
        <Field icon={Repeat2} label="兼領限制" value={concurrent} />
        <Field icon={Users} label="適用對象" html={ann.target_audience} />

        <Divider style={{ backgroundColor: theme.colors.outlineVariant, marginBottom: 20 }} />
        <View className="mb-1 flex-row items-center gap-1.5">
          <FileText size={15} color={theme.colors.primary} />
          <SectionLabel style={{ marginBottom: 0 }}>詳細內容</SectionLabel>
        </View>
        <RichContent html={ann.summary} />

        {/* 附件（類型徽章 + 大小 + 下載） */}
        {attachments.length > 0 && (
          <View className="mt-6">
            <SectionLabel>相關附件（{attachments.length}）</SectionLabel>
            {attachments.map((f: any, i: number) => {
              const kind = getFileKind(f);
              const kc = kindColor(kind.label, theme);
              return (
                <Animated.View key={f.id} entering={enterUp(i * 60)}>
                  <Pressable
                    onPress={() => Linking.openURL(`${API}${getPublicAttachmentUrl(f.stored_file_path)}`)}
                    android_ripple={{ color: theme.colors.surfaceVariant }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 16,
                      backgroundColor: cardBg,
                      borderWidth: 1,
                      borderColor: theme.dark ? 'rgba(255,255,255,0.07)' : theme.colors.outlineVariant,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: kc + '1C' }}>
                      <Text style={{ color: kc, fontWeight: '900', fontSize: 11.5, letterSpacing: 0.5 }}>{kind.label}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 13.5, lineHeight: 18 }}>
                        {f.file_name}
                      </Text>
                      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 3 }}>
                        {kind.label}
                        {f.file_size ? ` · ${formatFileSize(f.file_size)}` : ''}
                      </Text>
                    </View>
                    <Download size={18} color={theme.colors.onSurfaceVariant} />
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* 外部連結（自動抓取網頁標題） */}
        {externalUrls.length > 0 && (
          <View className="mt-6">
            <SectionLabel>外部連結</SectionLabel>
            {externalUrls.map((u, i) => (
              <LinkPreviewRow key={i} url={u.url} fallbackTitle={u.title} />
            ))}
          </View>
        )}

        {/* 次要動作 */}
        <View className="mt-6 flex-row" style={{ gap: 10 }}>
          <Button mode="outlined" icon={() => <CalendarPlus size={17} color={theme.colors.primary} />} onPress={handleCalendar} style={{ flex: 1, borderColor: theme.colors.outline, borderRadius: 999 }}>
            日曆
          </Button>
          <Button mode="outlined" icon={() => <FileDown size={17} color={theme.colors.primary} />} onPress={downloadPdf} style={{ flex: 1, borderColor: theme.colors.outline, borderRadius: 999 }}>
            PDF
          </Button>
          <Button mode="outlined" icon={() => <Share2 size={17} color={theme.colors.primary} />} onPress={handleShare} style={{ flex: 1, borderColor: theme.colors.outline, borderRadius: 999 }}>
            分享
          </Button>
        </View>
      </ScrollView>

      {/* 底部動作列 */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 14,
          paddingBottom: 26,
          flexDirection: 'row',
          gap: 10,
          backgroundColor: theme.dark ? 'rgba(23,30,38,0.94)' : 'rgba(255,255,255,0.94)',
          borderTopWidth: 0.5,
          borderTopColor: theme.colors.outlineVariant,
        }}
      >
        <Button
          mode={mySub ? 'outlined' : 'contained'}
          loading={subBusy}
          onPress={() => setSubSheetOpen(true)}
          icon={() => (mySub ? <BellRing size={17} color={theme.colors.primary} /> : <Bell size={17} color={theme.colors.onPrimary} />)}
          style={{ flex: 1, borderRadius: 999, borderColor: mySub ? theme.colors.primary : undefined }}
          contentStyle={{ paddingVertical: 4 }}
        >
          {mySub ? `截止前 ${mySub.days} 天提醒` : '訂閱截止提醒'}
        </Button>
        {ann.internal_id ? (
          <Button
            mode="contained-tonal"
            onPress={openOnSiteForm}
            icon={() => <ClipboardPen size={17} color={theme.colors.primary} />}
            style={{ borderRadius: 999 }}
            contentStyle={{ paddingVertical: 4 }}
          >
            現場交件登記
          </Button>
        ) : null}
      </View>

      {/* 訂閱天數選單（可下拉關閉） */}
      <BottomSheet open={subSheetOpen} onClose={() => setSubSheetOpen(false)}>
        <View style={{ paddingHorizontal: 18, paddingBottom: 34 }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 16.5 }}>截止日前提醒</Text>
            <Pressable onPress={() => setSubSheetOpen(false)} hitSlop={8}>
              <X size={20} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          </View>
          {SUB_DAY_OPTIONS.map((d) => {
            const activeDay = mySub?.days === d;
            return (
              <Pressable
                key={d}
                onPress={() => subscribe(d)}
                android_ripple={{ color: theme.colors.surfaceVariant }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  backgroundColor: activeDay ? theme.colors.primaryContainer : 'transparent',
                  marginBottom: 4,
                }}
              >
                <Text style={{ color: activeDay ? theme.colors.primary : theme.colors.onSurface, fontWeight: activeDay ? '800' : '600', fontSize: 15 }}>
                  截止前 {d} 天
                </Text>
                {activeDay ? <Check size={17} color={theme.colors.primary} strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
          {mySub ? (
            <>
              <Divider style={{ backgroundColor: theme.colors.outlineVariant, marginVertical: 8 }} />
              <Pressable
                onPress={unsubscribe}
                android_ripple={{ color: theme.colors.surfaceVariant }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14 }}
              >
                <BellOff size={16} color={theme.colors.error} />
                <Text style={{ color: theme.colors.error, fontWeight: '700', fontSize: 15 }}>取消訂閱</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </BottomSheet>
    </View>
  );
}

/** 外部連結列：自動抓取網頁標題（/api/link-preview），像網頁版一樣顯示標題 + 網域 */
function LinkPreviewRow({ url, fallbackTitle }: { url: string; fallbackTitle?: string }) {
  const theme = useAppTheme();
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();
  const { data: fetched } = useQuery({
    queryKey: ['link-preview', url],
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      const res = await fetch(`${API}/api/link-preview?url=${encodeURIComponent(url)}`);
      const json = await res.json();
      return (json?.title as string) || null;
    },
  });
  const title = fetched || fallbackTitle || host;
  const cardBg = theme.dark ? theme.colors.elevation.level1 : theme.colors.surface;
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      android_ripple={{ color: theme.colors.surfaceVariant }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255,255,255,0.07)' : theme.colors.outlineVariant,
        marginBottom: 10,
      }}
    >
      <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
        <Globe size={19} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 14 }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
          {host}
        </Text>
      </View>
      <ExternalLink size={16} color={theme.colors.outline} />
    </Pressable>
  );
}

/** 產生可列印 HTML（expo-print 轉 PDF 用） */
function buildPrintableHtml(ann: any): string {
  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const start = ann.application_start_date ? localDateString(new Date(ann.application_start_date)) : null;
  const end = ann.application_end_date ? localDateString(new Date(ann.application_end_date)) : '無期限';
  const period = start ? `${start} ~ ${end}` : end;
  const concurrent = ann.application_limitations === 'Y' ? '可兼領其他獎學金' : ann.application_limitations === 'N' ? '不可兼領其他獎學金' : '未指定';
  const row = (k: string, v: string) =>
    `<tr><td style="width:96px;color:#5B6B7C;font-weight:700;padding:6px 10px 6px 0;vertical-align:top">${k}</td><td style="padding:6px 0">${v}</td></tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,'Noto Sans TC',sans-serif;color:#1C2B3A;padding:28px;font-size:13px;line-height:1.7}
    h1{font-size:19px;line-height:1.45;margin:0 0 6px}
    .meta{color:#5B6B7C;font-size:11px;margin-bottom:14px}
    table.kv{border-collapse:collapse;width:100%;background:#F6F8FA;border-radius:10px;padding:8px}
    .content table{border-collapse:collapse;width:100%;margin:8px 0}
    .content td,.content th{border:1px solid #E3E8EE;padding:6px 8px;font-size:12px}
    .footer{margin-top:22px;padding-top:10px;border-top:1px solid #E3E8EE;color:#7E8B99;font-size:10.5px}
  </style></head><body>
    <h1>${esc(ann.title)}</h1>
    <div class="meta">分類 ${esc(ann.category || '未分類')}｜${esc(CATEGORY_NAMES[ann.category] || '')}</div>
    <table class="kv">
      ${row('申請期間', esc(period))}
      ${row('兼領限制', esc(concurrent))}
      ${row('送件方式', ann.submission_method || '未特別註明')}
      ${row('適用對象', ann.target_audience || '未特別註明')}
    </table>
    <h3 style="margin:16px 0 6px;font-size:14px">詳細內容</h3>
    <div class="content">${ann.summary || '無'}</div>
    <div class="footer">${esc(siteConfig.name)}｜${esc(siteConfig.url)}/announcement/${esc(ann.id)}</div>
  </body></html>`;
}

function parseExternalUrls(raw: any): { url: string; title?: string }[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed
        .map((x: any) => (typeof x === 'string' ? { url: x } : x?.url ? { url: x.url, title: x.title } : null))
        .filter(Boolean) as { url: string; title?: string }[];
    }
  } catch {
    if (typeof raw === 'string' && /^https?:\/\//.test(raw.trim())) return [{ url: raw.trim() }];
  }
  return [];
}
