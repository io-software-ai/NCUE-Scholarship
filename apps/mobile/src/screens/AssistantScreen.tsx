import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, Share, TextInput, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from 'react-native-paper';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import {
  Sparkles,
  ArrowUp,
  SquarePen,
  ChevronRight,
  Check,
  Loader,
  BellPlus,
  GraduationCap,
  CalendarClock,
  Wallet,
  FileSearch,
  AtSign,
  Paperclip,
  X,
  Search,
  Plus,
  Trash2,
  UserRound,
  Copy,
  RotateCcw,
  Database,
  MessagesSquare,
  ClipboardCheck,
  ListChecks,
  PenLine,
  UsersRound,
} from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { htmlToLineText, siteConfig } from '@ncue/core';
import { supabase } from '../lib/supabase';
import { streamChat } from '../lib/chatStream';
import { useAuth } from '../lib/auth-context';
import { useAppTheme } from '../theme';
import { useTabBar, useTabBarClearance } from '../lib/tabBar';
import { CompactAnnouncementCard } from '../components/CompactAnnouncementCard';
import { RichContent } from '../components/RichContent';
import { DeadlineChip, EmptyState } from '../components/ui';
import { ConfirmDialog, useAlert } from '../components/dialogs';
import { BottomSheet } from '../components/BottomSheet';
import { enterUp, enterDown, enterFade, exitFade, stagger } from '../lib/motion';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

interface Tool { name?: string; label?: string; status?: string; summary?: string }
interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  tools?: Tool[];
  isStreaming?: boolean;
}
interface AttachmentDraft { name: string; mimeType: string; data: string; size: number }

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** chat_history.session_id 是 uuid 型別，必須送合法 UUID v4 才會落庫（同步網頁版） */
const uuid4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/**
 * 歡迎頁預設問題：點擊只「帶入輸入框」不自動送出，使用者可再編輯後送出。
 * hint 僅為卡片上的操作提示，不會被帶進輸入框。
 */
type AssistantMode = 'general' | 'review';

/** 助理模式：一般問答 vs 依生輔組承辦人員的查核重點檢核申請文件 */
const MODES: { id: AssistantMode; label: string; icon: any; hint: string }[] = [
  { id: 'general', label: '一般對話', icon: MessagesSquare, hint: '查詢公告、資格與申請規定' },
  { id: 'review', label: '文件檢核', icon: ClipboardCheck, hint: '依承辦人員的查核重點檢查申請書與自傳' },
];

const SUGGESTIONS: Record<AssistantMode, { icon: any; text: string; hint?: string }[]> = {
  general: [
    { icon: Wallet, text: '有哪些清寒獎學金？' },
    { icon: CalendarClock, text: '這個月即將截止的有哪些？' },
    { icon: GraduationCap, text: '低收入戶可以申請什麼？' },
    { icon: FileSearch, text: '我想申請 xxx，請幫我修改並優化我的申請書', hint: '輸入 @ 選擇獎學金' },
  ],
  review: [
    { icon: ListChecks, text: '送件前要檢查哪些欄位才不會被退件？' },
    { icon: PenLine, text: '我貼上自傳，請幫我看哪裡寫得不夠具體' },
    { icon: UsersRound, text: '家庭狀況欄位要寫到什麼程度才夠？' },
    { icon: FileSearch, text: '請依這個獎學金的規定幫我檢核申請書', hint: '輸入 @ 選擇獎學金' },
  ],
};

const INPUT_PLACEHOLDER = '輸入 @ 選擇公告或提問…';

const RAINBOW = ['#4E8DF7', '#9B72F2', '#E96AC0', '#43BFA8'];
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];

export default function AssistantScreen({ active = true }: { active?: boolean }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { session } = useAuth();
  const alert = useAlert();
  const { hidden } = useTabBar();
  const clearance = useTabBarClearance(6);
  const inputWrapStyle = useAnimatedStyle(() => ({
    paddingBottom: interpolate(hidden.value, [0, 1], [clearance, 12], Extrapolation.CLAMP),
  }));
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<AssistantMode>('general');
  const [reviewAnn, setReviewAnn] = useState<{ id: string; title: string } | null>(null);
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [inputBox, setInputBox] = useState<{ w: number; h: number } | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);
  const inputRef = useRef<TextInput>(null);
  const sessionIdRef = useRef(uuid4());
  const lastSendRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // 彩虹邊框：串流時柔和脈動
  const glow = useSharedValue(0);
  useEffect(() => {
    if (sending) glow.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
    else glow.value = withTiming(0, { duration: 300 });
  }, [sending, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: interpolate(glow.value, [0, 1], [0.65, 1]) }));

  // 由資料庫載入對話（與網頁版共用 chat_history，依 user_id 同步）
  const loadHistory = useCallback(() => {
    if (!session) return;
    fetch(`${API}/api/chat-history`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j.data)) {
          setMessages(
            j.data
              .filter((m: any) => m.message_content !== '__HISTORY_CLEARED__')
              .map((m: any) => ({ id: String(m.id ?? genId()), role: m.role === 'model' ? 'assistant' : 'user', content: m.message_content })),
          );
        }
      })
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useFocusEffect(
    useCallback(() => {
      if (!sending && Date.now() - lastSendRef.current > 3000) loadHistory();
    }, [loadHistory, sending]),
  );

  // 分頁器裡各頁同時掛載，useFocusEffect 不會在「滑到本頁」時觸發；
  // 改用 active 旗標：切到助理頁且非傳送中就同步一次（維持與網頁版同步）。
  useEffect(() => {
    if (active && !sending && Date.now() - lastSendRef.current > 3000) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const scrollEnd = useCallback(() => listRef.current?.scrollToEnd({ animated: true }), []);

  // 預設問題：帶入輸入框並聚焦，讓使用者能先改寫（例如把 xxx 換成獎學金名稱）再送出
  const fillInput = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // 輸入「@」→ 開公告選擇器（文件檢核模式，對齊網頁版）
  const onChangeInput = (t: string) => {
    if (t.length > input.length && t.endsWith('@')) {
      setPickerOpen(true);
      setInput(t.slice(0, -1));
      return;
    }
    setInput(t);
  };

  // 附件挑選（需原生模組；未 build 進 dev client 時優雅提示，不閃退）
  const pickAttachment = async () => {
    try {
      const DocumentPicker: any = await import('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({ type: ALLOWED_MIME, copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if ((a.size ?? 0) > 5 * 1024 * 1024) {
        alert({ title: '檔案過大', description: '附件需小於 5MB。', tone: 'error' });
        return;
      }
      let data = '';
      try {
        const FS: any = await import('expo-file-system/legacy');
        data = await FS.readAsStringAsync(a.uri, { encoding: 'base64' });
      } catch {
        const FS: any = await import('expo-file-system');
        data = new FS.File(a.uri).base64();
      }
      if (!data) throw new Error('read failed');
      setAttachment({ name: a.name || '附件', mimeType: a.mimeType || 'application/pdf', data, size: a.size ?? 0 });
    } catch {
      alert({ title: '此版本尚未支援附件', description: '需要重新 build App（開發版）後才能使用附件上傳。', tone: 'info' });
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || sending || !session) return;
    lastSendRef.current = Date.now();
    const history = messages.map((m) => ({ id: m.id, role: m.role === 'assistant' ? 'model' : 'user', content: m.content, createdAt: new Date().toISOString() }));
    const shown = trimmed || `（附件：${attachment?.name}）`;
    const userMsg: Msg = { id: genId(), role: 'user', content: shown };
    const aiId = genId();
    setMessages((prev) => [...prev, userMsg, { id: aiId, role: 'assistant', content: '', isStreaming: true }]);
    setInput('');
    setSending(true);
    const body: any = {
      messages: [...history, { id: userMsg.id, role: 'user', content: trimmed || shown, createdAt: new Date().toISOString() }],
      sessionId: sessionIdRef.current,
      text: trimmed || shown,
      mode,
    };
    if (reviewAnn) body.reviewAnnouncementId = reviewAnn.id;
    if (attachment) body.attachment = { name: attachment.name, mimeType: attachment.mimeType, data: attachment.data };
    setReviewAnn(null);
    setAttachment(null);
    const patch = (fn: (m: Msg) => Msg) => setMessages((prev) => prev.map((m) => (m.id === aiId ? fn(m) : m)));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    streamChat(API, body, session.access_token, {
      onText: (t) => patch((m) => ({ ...m, content: m.content + t })),
      onThought: (t) => patch((m) => ({ ...m, thought: (m.thought || '') + t })),
      onTool: (e: Tool) =>
        patch((m) => {
          const tools = [...(m.tools || [])];
          const idx = tools.findIndex((x) => x.label === e.label);
          if (idx >= 0) tools[idx] = { ...tools[idx], ...e };
          else tools.push(e);
          return { ...m, tools };
        }),
      onError: () => patch((m) => ({ ...m, content: m.content + '\n\n（連線發生問題，請稍後再試）', isStreaming: false })),
    }, ctrl.signal).finally(() => {
      patch((m) => ({ ...m, isStreaming: false }));
      setSending(false);
      abortRef.current = null;
      lastSendRef.current = Date.now();
    });
  };

  /** 複製回覆：優先用系統剪貼簿（原生模組未 build 時退回分享選單） */
  const copyText = async (text: string) => {
    if (!text) return;
    try {
      // 尚未安裝/build 進 dev client 時會拋錯 → 退回系統分享選單
      // @ts-ignore 選用原生模組，未安裝時走 fallback
      const Clipboard: any = await import('expo-clipboard');
      await Clipboard.setStringAsync(text);
      alert({ title: '已複製', tone: 'success' });
    } catch {
      Share.share({ message: text }).catch(() => {});
    }
  };

  /** 重新生成：移除最後一則 AI 回覆，用上一則使用者訊息重問 */
  const retryLast = () => {
    if (sending) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf('assistant');
      return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
    });
    setTimeout(() => send(lastUser.content), 0);
  };

  /** 停止生成：中止串流，保留已產生的內容 */
  const stopGenerating = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
    setSending(false);
  };

  const clearHistory = async () => {
    if (!session) return;
    setMessages([]);
    sessionIdRef.current = uuid4();
    fetch(`${API}/api/chat-history`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => {});
  };

  const Header = () => (
    <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
      <View className="flex-row items-center gap-2.5">
        <AiAvatar streaming={sending} />
        <View>
          <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 17, letterSpacing: -0.2 }}>AI 助理</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5 }}>{siteConfig.schoolShort}獎學金專屬</Text>
        </View>
      </View>
      <View className="flex-row items-center" style={{ gap: 14 }}>
        {/* 編輯個人背景 */}
        <Pressable
          onPress={() => setSettingsOpen(true)}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.colors.surfaceVariant : theme.colors.surfaceVariant + '80',
          })}
        >
          <UserRound size={20} color={theme.colors.onSurfaceVariant} />
        </Pressable>
        {/* 刪除對話：只有在有對話紀錄時才顯示 */}
        {messages.length > 0 ? (
          <Pressable
            onPress={() => setConfirmClearOpen(true)}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.tokens.danger + '2A' : theme.tokens.danger + '14',
            })}
          >
            <Trash2 size={20} color={theme.colors.error} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  /** 模式切換列：一般對話 / 文件檢核（檢核模式會帶入承辦人員的查核重點） */
  const ModeBar = () => (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <View
        className="flex-row"
        style={{ alignSelf: 'flex-start', padding: 3, borderRadius: 999, backgroundColor: theme.colors.surfaceVariant + '80' }}
      >
        {MODES.map(({ id, label, icon: Icon }) => {
          const on = mode === id;
          return (
            <Pressable
              key={id}
              onPress={() => setMode(id)}
              android_ripple={{ color: theme.colors.surfaceVariant, borderless: false }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: on ? theme.colors.primary : 'transparent',
              }}
            >
              <Icon size={14} color={on ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} />
              <Text style={{ color: on ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, fontSize: 13, fontWeight: '700' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 6, opacity: 0.9 }}>
        {MODES.find((m) => m.id === mode)?.hint}
      </Text>
    </View>
  );

  if (!session) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Header />
        <EmptyState
          icon={Sparkles}
          title="登入即可使用 AI 助理"
          description="登入後，AI 會依你的背景推薦合適的獎學金、回答資格與截止問題。"
          actionLabel="前往登入"
          onAction={() => router.push('/login')}
        />
      </SafeAreaView>
    );
  }

  const hasInput = (input.trim().length > 0 || !!attachment) && !sending;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header />
      <ModeBar />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => (
            <MessageRow
              msg={item}
              session={session}
              onCopy={copyText}
              // 只有「最後一則 AI 回覆」可重新生成
              onRetry={item.role === 'assistant' && index === messages.length - 1 && !sending ? retryLast : undefined}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, flexGrow: 1 }}
          onContentSizeChange={scrollEnd}
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<WelcomePane name={session.user.user_metadata?.full_name} onPick={fillInput} mode={mode} />}
        />

        {/* 懸浮輸入區 */}
        <Animated.View style={[{ paddingHorizontal: 14, paddingTop: 6 }, inputWrapStyle]}>
          {/* @公告 / 附件 chips */}
          {reviewAnn || attachment ? (
            <View className="flex-row flex-wrap" style={{ gap: 8, marginBottom: 8 }}>
              {reviewAnn ? (
                <ContextChip
                  icon={<AtSign size={13} color={theme.colors.primary} />}
                  label={reviewAnn.title}
                  onClear={() => setReviewAnn(null)}
                />
              ) : null}
              {attachment ? (
                <ContextChip
                  icon={<Paperclip size={13} color={theme.colors.primary} />}
                  label={attachment.name}
                  onClear={() => setAttachment(null)}
                />
              ) : null}
            </View>
          ) : null}

          {/* 彩虹漸變輸入膠囊（Gemini 式） */}
          <View onLayout={(e) => setInputBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })} style={{ borderRadius: 28 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 28,
                backgroundColor: theme.dark ? theme.colors.elevation.level2 : theme.colors.surface,
                paddingLeft: 14,
                paddingRight: 8,
                paddingVertical: 8,
                shadowColor: '#0F2137',
                shadowOpacity: theme.dark ? 0 : 0.08,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: theme.dark ? 0 : 3,
              }}
            >
              <RoundIcon onPress={() => setPlusOpen(true)}>
                <Plus size={21} color={theme.colors.onSurfaceVariant} />
              </RoundIcon>
              {/* multiline TextInput 的原生 placeholder 會換行（窄螢幕變兩行）；
                  改用單行 Text 疊層當 placeholder，過長時省略號截斷而非折行。 */}
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={onChangeInput}
                  multiline
                  editable={!sending}
                  style={{
                    color: theme.colors.onSurface,
                    fontSize: 15.5,
                    lineHeight: 21,
                    maxHeight: 110,
                    paddingTop: 8,
                    paddingBottom: 8,
                    paddingHorizontal: 6,
                  }}
                />
                {input.length === 0 ? (
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center', paddingHorizontal: 6 }]}>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{ color: theme.colors.onSurfaceVariant, fontSize: 15.5, lineHeight: 21 }}
                    >
                      {INPUT_PLACEHOLDER}
                    </Text>
                  </View>
                ) : null}
              </View>
              <SendOrb active={hasInput} busy={sending} onPress={() => (sending ? stopGenerating() : send(input))} />
            </View>

            {/* 彩虹漸層邊框（SVG，串流時脈動） */}
            {inputBox ? (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
                <Svg width={inputBox.w} height={inputBox.h}>
                  <Defs>
                    <SvgGradient id="rainbow" x1="0" y1="0" x2="1" y2="1">
                      {RAINBOW.map((c, i) => (
                        <Stop key={c} offset={String(i / (RAINBOW.length - 1))} stopColor={c} />
                      ))}
                    </SvgGradient>
                  </Defs>
                  <Rect x={2.5} y={2.5} width={inputBox.w - 5} height={inputBox.h - 5} rx={25.5} stroke="url(#rainbow)" strokeWidth={5} opacity={0.16} fill="none" />
                  <Rect x={0.8} y={0.8} width={inputBox.w - 1.6} height={inputBox.h - 1.6} rx={27} stroke="url(#rainbow)" strokeWidth={1.6} opacity={0.9} fill="none" />
                </Svg>
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* ＋ 選單：指定公告 / 上傳附件 */}
      <Modal visible={plusOpen} transparent animationType="fade" onRequestClose={() => setPlusOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(10,15,22,0.4)' }} onPress={() => setPlusOpen(false)} />
        <View
          style={{
            position: 'absolute',
            left: 14,
            bottom: clearance + 74,
            width: 230,
            borderRadius: 20,
            backgroundColor: theme.dark ? theme.colors.elevation.level3 : theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            padding: 6,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {[
            { icon: AtSign, label: '指定公告（文件檢核）', act: () => { setPlusOpen(false); setPickerOpen(true); } },
            { icon: Paperclip, label: '上傳附件給 AI 檢視', act: () => { setPlusOpen(false); pickAttachment(); } },
          ].map(({ icon: Icon, label, act }) => (
            <Pressable
              key={label}
              onPress={act}
              android_ripple={{ color: theme.colors.surfaceVariant }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14 }}
            >
              <Icon size={17} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 14 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      <AnnouncementPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(a) => {
          setReviewAnn(a);
          setPickerOpen(false);
        }}
      />
      <AssistantSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} session={session} />
      <ConfirmDialog
        open={confirmClearOpen}
        title="刪除對話紀錄？"
        description="將清空目前的對話（含網頁版同步的紀錄），且無法復原。"
        confirmLabel="刪除"
        destructive
        onConfirm={() => {
          setConfirmClearOpen(false);
          clearHistory();
        }}
        onClose={() => setConfirmClearOpen(false)}
      />
    </SafeAreaView>
  );
}

/** 助理設定（Gemini 式：個人背景 = system-prompt 層級） */
function AssistantSettingsSheet({ open, onClose, session }: { open: boolean; onClose: () => void; session: any }) {
  const theme = useAppTheme();
  const alert = useAlert();
  const [bg, setBg] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  // 鍵盤彈出時把面板往上抬（BottomSheet 負責貼底與下拉關閉）
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (open) {
      Keyboard.dismiss(); // 開啟時關掉主畫面殘留的鍵盤
      setKb(0);
    }
  }, [open]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!open || !session) return;
    fetch(`${API}/api/users/background`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setBg(j.background || '');
          setSaved(j.background || '');
        }
      })
      .catch(() => {});
  }, [open, session]);

  const save = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/users/background`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ background: bg }),
      });
      if (!res.ok) throw new Error();
      setSaved(bg);
      alert({ title: '已儲存', description: 'AI 之後的回答會參考你的背景。', tone: 'success' });
      onClose();
    } catch {
      alert({ title: '儲存失敗', description: '請稍後再試。', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} liftBy={kb}>
      <View style={{ padding: 18, paddingTop: 8, paddingBottom: 34 }}>
        <View className="flex-row items-center gap-2.5" style={{ marginBottom: 6 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
            <UserRound size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 16.5 }}>個人背景</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>AI 每次回答都會參考（如系所、身分別、需求）</Text>
          </View>
        </View>

        <View style={{ borderRadius: 18, backgroundColor: theme.colors.surfaceVariant + '66', borderWidth: 1, borderColor: theme.colors.outlineVariant, padding: 14, marginTop: 10 }}>
          <TextInput
            placeholder="例：資工系大二、低收入戶、想找清寒獎學金…"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={bg}
            onChangeText={(t) => setBg(t.slice(0, 1000))}
            multiline
            textAlignVertical="top"
            style={{ color: theme.colors.onSurface, fontSize: 15, lineHeight: 22, minHeight: 96, padding: 0 }}
          />
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, textAlign: 'right', marginTop: 6, opacity: 0.7 }}>{bg.length}/1000</Text>
        </View>

        <View style={{ alignItems: 'flex-end', marginTop: 26 }}>
          <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: bg === saved ? theme.colors.surfaceVariant : theme.colors.primary }}>
            <Pressable
              onPress={save}
              disabled={busy || bg === saved}
              android_ripple={{ color: 'rgba(255,255,255,0.24)' }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, paddingHorizontal: 26 }}
            >
              {busy ? (
                <Spinner color={theme.colors.onPrimary} size={18} />
              ) : (
                <Text style={{ color: bg === saved ? theme.colors.onSurfaceVariant : theme.colors.onPrimary, fontWeight: '800', fontSize: 15.5 }}>
                  儲存背景
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

/* ── 小元件 ────────────────────────────────── */

function RoundIcon({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.colors.surfaceVariant : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}

function ContextChip({ icon, label, onClear }: { icon: React.ReactNode; label: string; onClear: () => void }) {
  const theme = useAppTheme();
  return (
    <Animated.View entering={enterUp()}>
      <View
        className="flex-row items-center"
        style={{ gap: 6, backgroundColor: theme.colors.primaryContainer, borderRadius: 999, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, maxWidth: 260 }}
      >
        {icon}
        <Text numberOfLines={1} style={{ color: theme.colors.primary, fontSize: 12.5, fontWeight: '700', flexShrink: 1 }}>
          {label}
        </Text>
        <Pressable onPress={onClear} hitSlop={6} style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
          <X size={12} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** @ 公告選擇器（文件檢核模式） */
function AnnouncementPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (a: { id: string; title: string }) => void }) {
  const theme = useAppTheme();
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['ann-picker', q],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from('announcements')
        .select('id, title, category, application_end_date')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30);
      const safe = q.replace(/[,()%*\\]/g, ' ').trim();
      if (safe) query = query.ilike('title', `%${safe}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="78%">
        <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 18, marginBottom: 10 }}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 16.5 }}>選擇公告（文件檢核）</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>
        <View
          className="flex-row items-center"
          style={{ marginHorizontal: 16, gap: 8, borderRadius: 999, backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 14, marginBottom: 8 }}
        >
          <Search size={16} color={theme.colors.onSurfaceVariant} />
          <TextInput
            placeholder="搜尋公告標題…"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={q}
            onChangeText={setQ}
            style={{ flex: 1, color: theme.colors.onSurface, fontSize: 14.5, paddingVertical: 10 }}
          />
        </View>
        <FlatList
          data={data ?? []}
          keyExtractor={(a: any) => String(a.id)}
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 30 }}>
              {isLoading ? '載入中…' : '找不到符合的公告'}
            </Text>
          }
          renderItem={({ item }: any) => (
            <Pressable
              onPress={() => onPick({ id: String(item.id), title: item.title })}
              android_ripple={{ color: theme.colors.surfaceVariant }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 14 }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
                <GraduationCap size={16} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ color: theme.colors.onSurface, fontSize: 14, fontWeight: '600', lineHeight: 19 }}>
                  {item.title}
                </Text>
              </View>
              <DeadlineChip endDate={item.application_end_date} />
            </Pressable>
          )}
        />
    </BottomSheet>
  );
}

// 靜態頭像（不再旋轉；生成狀態改由下方光柵掃描動畫呈現，避免多個元件同時轉動）
function AiAvatar({ size = 34 }: { streaming?: boolean; size?: number }) {
  const theme = useAppTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
      <Sparkles size={size * 0.5} color={theme.colors.primary} />
    </View>
  );
}

/**
 * Cloudflare 式光柵掃描生成動畫：骨架列 + 一道柔光橫向反覆掃過（唯一在動的元件）。
 */
function ScanningLoader() {
  const theme = useAppTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const p = useSharedValue(0);
  useEffect(() => {
    // 等速掃描（linear）：光帶兩端都完全移出容器外才重來，看不到「跳回」的接縫
    p.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
  }, [p]);

  const w = size.w || 320;
  const h = size.h || 80;
  // 光帶做寬（約容器 8 成）＋ 多段極緩漸層 → 邊緣柔和，不會有硬邊
  const BAND = Math.round(w * 0.8);
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 1], [-BAND, w]) }],
  }));

  const barBg = theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,33,55,0.06)';
  const peak = theme.dark ? 0.16 : 0.1; // 高光強度：柔和不刺眼
  const bars = [
    { w: '96%', h: 13 },
    { w: '100%', h: 13 },
    { w: '82%', h: 13 },
    { w: '90%', h: 13 },
  ];

  return (
    <View
      onLayout={(e) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
      style={{ overflow: 'hidden', gap: 11, paddingVertical: 6, borderRadius: 10 }}
    >
      {bars.map((b, i) => (
        <View key={i} style={{ height: b.h, borderRadius: b.h / 2, width: b.w as any, backgroundColor: barBg }} />
      ))}
      {size.w > 0 ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND }, sweep]}>
          <Svg width={BAND} height={h}>
            <Defs>
              <SvgGradient id="scanband" x1="0" y1="0" x2="1" y2="0">
                {/* 多段緩升緩降，避免單一中點造成的生硬亮塊 */}
                <Stop offset="0" stopColor={theme.colors.primary} stopOpacity="0" />
                <Stop offset="0.2" stopColor={theme.colors.primary} stopOpacity={String(peak * 0.18)} />
                <Stop offset="0.38" stopColor={theme.colors.primary} stopOpacity={String(peak * 0.6)} />
                <Stop offset="0.5" stopColor={theme.colors.primary} stopOpacity={String(peak)} />
                <Stop offset="0.62" stopColor={theme.colors.primary} stopOpacity={String(peak * 0.6)} />
                <Stop offset="0.8" stopColor={theme.colors.primary} stopOpacity={String(peak * 0.18)} />
                <Stop offset="1" stopColor={theme.colors.primary} stopOpacity="0" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width={BAND} height={h} fill="url(#scanband)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Spinner({ color, size = 13 }: { color: string; size?: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
  }, [v]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${v.value * 360}deg` }] }));
  return (
    <Animated.View style={style}>
      <Loader size={size} color={color} />
    </Animated.View>
  );
}

function SendOrb({ active, busy, onPress }: { active: boolean; busy: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  const v = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(active ? 1 : 0, { damping: 14, stiffness: 220, mass: 0.6 });
  }, [active, v]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(v.value, [0, 1], [0.92, 1]) }] }));
  return (
    <Pressable onPress={onPress} disabled={!active && !busy} hitSlop={6}>
      <Animated.View
        style={[
          {
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active || busy ? theme.colors.primary : theme.colors.surfaceVariant,
          },
          style,
        ]}
      >
        {busy ? (
          // 生成中＝停止鍵（方形），點擊中止串流並保留已產生內容
          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: theme.colors.onPrimary }} />
        ) : (
          <ArrowUp size={20} color={active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} strokeWidth={2.5} />
        )}
      </Animated.View>
    </Pressable>
  );
}

/* ── 歡迎頁 ────────────────────────────────── */

function WelcomePane({ name, onPick, mode }: { name?: string; onPick: (t: string) => void; mode: AssistantMode }) {
  const theme = useAppTheme();
  const first = (name || '').trim().split(/\s+/)[0];
  return (
    <View className="flex-1 justify-center" style={{ paddingBottom: 30 }}>
      <Animated.View entering={enterUp()}>
        <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: theme.colors.primary, lineHeight: 40 }}>
          {first ? `嗨，${first}` : '嗨，你好'}
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.onSurfaceVariant, marginTop: 2, letterSpacing: -0.3 }}>
          {mode === 'review' ? '要檢核哪份申請文件？' : '想找什麼獎學金？'}
        </Text>
      </Animated.View>

      <View className="flex-row flex-wrap" style={{ marginTop: 28, gap: 10 }}>
        {SUGGESTIONS[mode].map(({ icon: Icon, text, hint }, i) => (
          <Animated.View key={text} entering={enterUp(150 + i * 80)} style={{ width: '47.8%' }}>
            <Pressable
              onPress={() => onPick(text)}
              android_ripple={{ color: theme.colors.surfaceVariant }}
              style={({ pressed }) => ({
                flex: 1, // 同一列的卡片等高（第 4 張文字較長）
                minHeight: 108,
                padding: 14,
                borderRadius: 20,
                backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surface,
                borderWidth: theme.dark ? 0 : 1,
                borderColor: theme.colors.outlineVariant,
                justifyContent: 'space-between',
                transform: [{ scale: pressed ? 0.965 : 1 }],
              })}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
                <Icon size={16} color={theme.colors.primary} />
              </View>
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: theme.colors.onSurface, fontSize: 13.5, fontWeight: '600', lineHeight: 19 }}>{text}</Text>
                {hint ? (
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, lineHeight: 16, marginTop: 4 }}>（{hint}）</Text>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/* ── 訊息列 ────────────────────────────────── */

const CARD_RE = /\[ANNOUNCEMENT_CARD:([\w,-]+)\]/g;
const SUB_RE = /\[SUBSCRIBE_CONFIRM:([\w-]+):(\d+)\]/g;
const MEM_RE = /\[MEMORY_CONFIRM:([^\]]+)\]/g;
// 串流途中標記尚未閉合，先隱藏避免原始文字閃現
const PARTIAL_MARKER_RE = /\[(?:ANNOUNCEMENT_CARD|SUBSCRIBE_CONFIRM|MEMORY_CONFIRM):[^\]]*$/;

function MsgAction({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.surfaceVariant + '99' }}>
      <Pressable
        onPress={onPress}
        android_ripple={{ color: theme.colors.surfaceVariant }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6 }}
      >
        <Icon size={13} color={theme.colors.onSurfaceVariant} />
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    </View>
  );
}

function MessageRow({
  msg,
  session,
  onCopy,
  onRetry,
}: {
  msg: Msg;
  session: any;
  onCopy?: (text: string) => void;
  onRetry?: () => void;
}) {
  const theme = useAppTheme();
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const isAI = msg.role === 'assistant';

  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withTiming(thoughtOpen ? 1 : 0, { duration: 200 });
  }, [thoughtOpen, rot]);
  const chevStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(rot.value, [0, 1], [0, 90])}deg` }] }));

  const cardIds: string[] = [];
  const subs: { id: string; days: string }[] = [];
  let memoryItems: string[] = [];
  let raw = msg.content || '';
  let m: RegExpExecArray | null;
  CARD_RE.lastIndex = 0;
  while ((m = CARD_RE.exec(raw))) cardIds.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
  SUB_RE.lastIndex = 0;
  while ((m = SUB_RE.exec(raw))) subs.push({ id: m[1], days: m[2] });
  MEM_RE.lastIndex = 0;
  while ((m = MEM_RE.exec(raw))) {
    const items = m[1].split('|').map((s) => s.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean).slice(0, 6);
    if (items.length > 0) memoryItems = items;
  }
  raw = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(CARD_RE, '')
    .replace(SUB_RE, '')
    .replace(MEM_RE, '')
    .replace(PARTIAL_MARKER_RE, '')
    .trim();
  const hasContent = raw.length > 0;
  const streamPlain = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!isAI) {
    return (
      <Animated.View entering={enterDown()} style={{ alignItems: 'flex-end', marginBottom: 18 }}>
        <View
          style={{
            maxWidth: '85%',
            backgroundColor: theme.colors.primaryContainer,
            borderRadius: 22,
            borderBottomRightRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 11,
          }}
        >
          <Text style={{ color: theme.colors.onSurface, lineHeight: 23, fontSize: 15.5 }}>{msg.content}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={enterDown()} style={{ marginBottom: 34 }}>
      <View className="flex-row items-center gap-2" style={{ marginBottom: 8 }}>
        <AiAvatar size={24} streaming={msg.isStreaming && !hasContent} />
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 }}>AI 助理</Text>
      </View>

      {msg.tools?.map((t, i) => (
        <Animated.View
          key={i}
          entering={enterFade()}
          className="mb-2 flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5"
          style={{ backgroundColor: theme.colors.surfaceVariant }}
        >
          {t.status === 'done' ? <Check size={13} color={theme.tokens.ok} /> : <Spinner color={theme.colors.onSurfaceVariant} />}
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            {t.label || t.name}{t.summary ? ` · ${t.summary}` : ''}
          </Text>
        </Animated.View>
      ))}

      {msg.thought ? (
        <View style={{ marginBottom: 8 }}>
          <Pressable
            onPress={msg.isStreaming ? undefined : () => setThoughtOpen((v) => !v)}
            hitSlop={8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: theme.colors.surfaceVariant,
            }}
          >
            {msg.isStreaming ? (
              <>
                <Spinner color={theme.colors.primary} size={12} />
                <Text style={{ color: theme.colors.primary, fontSize: 12.5, fontWeight: '700' }}>思考中…</Text>
              </>
            ) : (
              <>
                <Animated.View style={chevStyle}>
                  <ChevronRight size={14} color={theme.colors.onSurfaceVariant} />
                </Animated.View>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, fontWeight: '600' }}>
                  {thoughtOpen ? '收合思考過程' : '顯示思考過程'}
                </Text>
              </>
            )}
          </Pressable>
          {/* 生成中自動展開，即時看到思考過程；完成後預設收合、可手動展開 */}
          {msg.isStreaming || thoughtOpen ? (
            <Animated.View
              entering={enterFade()}
              exiting={exitFade()}
              style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.outlineVariant, paddingLeft: 12, marginTop: 10, marginLeft: 6 }}
            >
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 20, fontStyle: 'italic' }}>
                {htmlToLineText(msg.thought)}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {msg.isStreaming && hasContent ? (
        <Text style={{ color: theme.colors.onSurface, lineHeight: 25, fontSize: 15.5 }}>{streamPlain}</Text>
      ) : hasContent ? (
        <RichContent html={raw} />
      ) : msg.isStreaming ? (
        <ScanningLoader />
      ) : (
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14 }}>（無回覆）</Text>
      )}

      {cardIds.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4, marginBottom: 2, opacity: 0.8 }}>
            相關公告
          </Text>
          {cardIds.slice(0, 3).map((id) => (
            <CompactAnnouncementCard key={id} announcementId={id} />
          ))}
        </View>
      ) : null}
      {subs.map((s, i) => (
        <SubscribeConfirm key={i} announcementId={s.id} days={s.days} session={session} />
      ))}
      {/* 記憶庫提議：串流結束後才顯示，避免解析到半截標記 */}
      {!msg.isStreaming && memoryItems.length > 0 ? (
        <MemoryConsent items={memoryItems} session={session} />
      ) : null}

      {/* 訊息動作：完成後才顯示（複製／重新生成） */}
      {!msg.isStreaming && hasContent ? (
        <View className="flex-row items-center" style={{ gap: 8, marginTop: 20 }}>
          <MsgAction icon={Copy} label="複製" onPress={() => onCopy?.(streamPlain)} />
          {onRetry ? <MsgAction icon={RotateCcw} label="重新生成" onPress={onRetry} /> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

function SubscribeConfirm({ announcementId, days, session }: { announcementId: string; days: string; session: any }) {
  const theme = useAppTheme();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await fetch(`${API}/api/subscriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementId, daysBefore: Number(days) || 3 }),
      });
      setDone(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Animated.View entering={enterUp()}>
      <View style={{ alignSelf: 'flex-start', marginTop: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: done ? theme.tokens.ok + '22' : theme.colors.primary }}>
        <Pressable
          onPress={done ? undefined : confirm}
          disabled={busy || done}
          android_ripple={{ color: 'rgba(255,255,255,0.24)' }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, paddingVertical: 10 }}
        >
          {done ? <Check size={16} color={theme.tokens.ok} /> : <BellPlus size={16} color={theme.colors.onPrimary} />}
          <Text style={{ color: done ? theme.tokens.ok : theme.colors.onPrimary, fontWeight: '700' }}>
            {done ? `已訂閱・截止前 ${days} 天提醒` : `訂閱提醒（截止前 ${days} 天）`}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * AI 提議「加入記憶庫」後的同意卡片。
 * 需點擊同意才寫入；寫入為整理增補，個人資料頁既有的背景資料不會被覆蓋。
 */
function MemoryConsent({ items, session }: { items: string[]; session: any }) {
  const theme = useAppTheme();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error' | 'dismissed'>('idle');
  const [message, setMessage] = useState('');

  const confirm = async () => {
    if (!session) {
      setMessage('請先登入後再加入記憶庫。');
      setState('error');
      return;
    }
    setState('busy');
    try {
      const res = await fetch(`${API}/api/users/background/merge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '加入記憶庫失敗');
      setMessage(data?.message || '已加入記憶庫');
      setState('done');
    } catch (e: any) {
      setMessage(e?.message || '加入記憶庫失敗，請稍後再試。');
      setState('error');
    }
  };

  if (state === 'dismissed') return null;

  return (
    <Animated.View
      entering={enterUp()}
      style={{
        marginTop: 12,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.outlineVariant,
        backgroundColor: theme.colors.surfaceVariant + '66',
        padding: 14,
      }}
    >
      <View className="flex-row items-center" style={{ gap: 7 }}>
        <Database size={15} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.onSurface, fontSize: 13.5, fontWeight: '800' }}>
          {state === 'done' ? '已加入記憶庫' : '要把這些資料加入記憶庫嗎？'}
        </Text>
      </View>

      <View style={{ marginTop: 8, gap: 4 }}>
        {items.map((item, i) => (
          <View key={i} className="flex-row" style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.primary, fontSize: 13 }}>•</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 20, flex: 1 }}>{item}</Text>
          </View>
        ))}
      </View>

      {state === 'done' ? (
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
          {message}可從右上角的「個人背景」檢視或修改。
        </Text>
      ) : (
        <>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, lineHeight: 17, marginTop: 10, opacity: 0.85 }}>
            同意後會整理併入你的 AI 背景資料（原有內容保留，不會被覆蓋），之後對話自動帶入，可隨時修改或刪除。
          </Text>
          <View className="flex-row items-center" style={{ gap: 8, marginTop: 12 }}>
            <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.primary }}>
              <Pressable
                onPress={confirm}
                disabled={state === 'busy'}
                android_ripple={{ color: 'rgba(255,255,255,0.24)' }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, paddingVertical: 9 }}
              >
                {state === 'busy' ? <Spinner color={theme.colors.onPrimary} size={14} /> : <Check size={15} color={theme.colors.onPrimary} />}
                <Text style={{ color: theme.colors.onPrimary, fontWeight: '700', fontSize: 13.5 }}>
                  {state === 'busy' ? '整理中…' : '同意加入'}
                </Text>
              </Pressable>
            </View>
            <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.surfaceVariant }}>
              <Pressable
                onPress={() => setState('dismissed')}
                disabled={state === 'busy'}
                android_ripple={{ color: theme.colors.outlineVariant }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 9 }}
              >
                <X size={15} color={theme.colors.onSurfaceVariant} />
                <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 13.5 }}>不用了</Text>
              </Pressable>
            </View>
          </View>
          {state === 'error' ? (
            <Text style={{ color: theme.tokens.danger, fontSize: 12, marginTop: 8 }}>{message}</Text>
          ) : null}
        </>
      )}
    </Animated.View>
  );
}
