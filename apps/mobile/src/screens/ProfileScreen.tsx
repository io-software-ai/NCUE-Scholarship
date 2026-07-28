import React, { useEffect, useState } from 'react';
import { View, ScrollView, Alert, Linking, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, SvgXml } from 'react-native-svg';
import { Text, Avatar, Button, ActivityIndicator, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  BellRing,
  ShieldCheck,
  MailQuestion,
  LogOut,
  UserX,
  ChevronRight,
  LogIn,
  HelpCircle,
  Check,
  ExternalLink,
  Sun,
  Moon,
  MonitorSmartphone,
} from 'lucide-react-native';
import { siteConfig } from '@ncue/core';
import { useAuth } from '../lib/auth-context';
import { useThemePreference, useAppTheme } from '../theme';
import { SectionLabel } from '../components/ui';
import { AiKeySection } from '../components/AiKeySection';
import { IO_SOFTWARE_LOGO } from '../assets/ioSoftwareLogo';
import { LINE_LOGO_PATH, LINE_GREEN, LINE_GREEN_DARK } from '../assets/lineLogo';
import { useTabBarScroll, useTabBarClearance, usePager } from '../lib/tabBar';
import { ConfirmDialog, ConfirmByTypingDialog, useAlert } from '../components/dialogs';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

export default function ProfileScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { goToTab } = usePager();
  const { session, loading, signOut } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const onScroll = useTabBarScroll();
  const clearance = useTabBarClearance();
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFailOpen, setDeleteFailOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const { data: subCount } = useQuery({
    queryKey: ['subscriptions', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const res = await fetch(`${API}/api/subscriptions`, { headers: { Authorization: `Bearer ${session!.access_token}` } });
      const json = await res.json();
      return (json?.subscriptions ?? []) as any[];
    },
    select: (arr) => (Array.isArray(arr) ? arr.length : 0),
  });

  // 刪除帳號：與網頁版同一支 API（改用 Bearer token 驗證），App 內即可完成註銷
  const doDelete = async () => {
    if (!session) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/api/users/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || '註銷過程中發生錯誤');
      setDeleteOpen(false);
      await signOut();
    } catch (e: any) {
      setDeleteOpen(false);
      setDeleteError(e?.message || '請檢查網路連線後再試一次。');
      setDeleteFailOpen(true);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const Card = ({ children }: any) => (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surface,
        borderWidth: theme.dark ? 0 : 1,
        borderColor: theme.colors.outlineVariant,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, paddingBottom: clearance }} onScroll={onScroll} scrollEventThrottle={16}>
          <View className="items-center">
            <Avatar.Icon size={84} icon={() => <LogIn size={40} color={theme.colors.onPrimaryContainer} />} style={{ backgroundColor: theme.colors.primaryContainer }} />
            <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '800', marginTop: 16 }}>歡迎使用</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
              登入後即可使用 AI 助理、訂閱截止提醒，並個人化推薦。
            </Text>
            <Button mode="contained" onPress={() => router.push('/login')} style={{ marginTop: 24, alignSelf: 'stretch', borderRadius: 999 }} contentStyle={{ paddingVertical: 6 }}>
              前往登入
            </Button>
          </View>
          <ThemeSection preference={preference} setPreference={setPreference} />
        </ScrollView>
      </View>
    );
  }

  const user = session.user;
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || '同學';
  const avatar = user.user_metadata?.avatar_url;

  const Row = ({ icon: Icon, title, subtitle, danger, onPress, right }: any) => (
    <Pressable onPress={onPress} android_ripple={{ color: theme.colors.surfaceVariant }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }}>
      <Icon size={20} color={danger ? theme.colors.error : theme.colors.onSurfaceVariant} />
      <Text style={{ flex: 1, marginLeft: 14, color: danger ? theme.colors.error : theme.colors.onSurface, fontWeight: '600' }}>{title}</Text>
      {subtitle ? <Text style={{ color: theme.colors.onSurfaceVariant, marginRight: 6 }}>{subtitle}</Text> : null}
      {right ?? <ChevronRight size={18} color={theme.colors.outline} />}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 4 }}>
        <Text style={{ color: theme.colors.onSurface, fontWeight: '900', fontSize: 26, letterSpacing: -0.5 }}>設定</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: clearance }} onScroll={onScroll} scrollEventThrottle={16}>
        {/* 個人 */}
        <View className="items-center py-4">
          {avatar ? <Avatar.Image size={80} source={{ uri: avatar }} /> : <Avatar.Text size={80} label={name.slice(0, 1)} />}
          <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: '800', marginTop: 12 }}>{name}</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{user.email}</Text>
        </View>

        {/* LINE 綁定 */}
        <SectionLabel style={{ marginTop: 12 }}>LINE 帳號綁定</SectionLabel>
        <Card>
          <LineBindingSection session={session} />
        </Card>

        {/* 自備 Gemini 金鑰（僅校外使用者顯示） */}
        <AiKeySection />

        {/* 帳號 */}
        <SectionLabel style={{ marginTop: 20 }}>帳號與設定</SectionLabel>
        <Card>
          <Row icon={BellRing} title="訂閱與通知管理" subtitle={subCount ? String(subCount) : undefined} onPress={() => goToTab(2)} />
          <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
          <Row icon={HelpCircle} title="常見問題 FAQ" onPress={() => router.push('/faq')} />
          <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
          <Row icon={ShieldCheck} title="服務條款與隱私權" onPress={() => Linking.openURL(`${siteConfig.url}/terms-and-privacy`)} />
          <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
          <Row icon={MailQuestion} title="問題回報" onPress={() => router.push('/feedback')} />
        </Card>

        {/* 外觀 */}
        <ThemeSection preference={preference} setPreference={setPreference} />

        {/* 危險區 */}
        <SectionLabel style={{ marginTop: 20 }}>帳號安全</SectionLabel>
        <Card>
          <Row icon={LogOut} title="登出" danger onPress={signOut} right={<View />} />
          <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
          <Row icon={UserX} title={deleting ? '處理中…' : '刪除帳號'} danger onPress={deleting ? undefined : () => setDeleteOpen(true)} right={<View />} />
        </Card>

        {/* 關於我們（開發團隊） */}
        <Pressable
          onPress={() => Linking.openURL(siteConfig.developer.url).catch(() => {})}
          style={{ alignItems: 'center', marginTop: 30, paddingVertical: 12 }}
        >
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, fontWeight: '700', letterSpacing: 0.8, opacity: 0.8, marginBottom: 14 }}>
            關於我們
          </Text>
          <SvgXml xml={IO_SOFTWARE_LOGO} width={188} height={41} color={theme.colors.onSurface} />
          <Text style={{ color: theme.colors.primary, fontSize: 13.5, fontWeight: '600', marginTop: 12 }}>
            {siteConfig.developer.url.replace(/^https?:\/\//, '')}
          </Text>
        </Pressable>

        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
          {siteConfig.shortName} · 版本 1.0.0
        </Text>
      </ScrollView>

      <ConfirmByTypingDialog
        open={deleteOpen}
        title="確認刪除帳號？"
        description="將永久刪除你的個人化資料、對話與訂閱，且無法復原。"
        keyword={name}
        confirmLabel="永久刪除"
        busy={deleting}
        onConfirm={doDelete}
        onClose={() => !deleting && setDeleteOpen(false)}
      />
      <ConfirmDialog
        open={deleteFailOpen}
        title="刪除失敗"
        description={`${deleteError}\n若持續失敗，請來信 ${siteConfig.supportEmail} 由我們協助處理。`}
        confirmLabel="重試"
        cancelLabel="關閉"
        onConfirm={() => {
          setDeleteFailOpen(false);
          setDeleteOpen(true);
        }}
        onClose={() => setDeleteFailOpen(false)}
      />
    </View>
  );
}

/** LINE 官方標誌（單一 path，字樣鏤空；color 直接當 fill） */
function LineLogo({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={LINE_LOGO_PATH} fill={color} />
    </Svg>
  );
}

/** LINE 綁定（對齊網頁版：官方帳號輸入「帳號綁定」取 6 位驗證碼 → 這裡提交） */
function LineBindingSection({ session }: { session: any }) {
  const theme = useAppTheme();
  const alert = useAlert();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [unbindOpen, setUnbindOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['line-link', session?.user?.id],
    enabled: !!session,
    queryFn: async () => {
      const res = await fetch(`${API}/api/line/link`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      return res.json();
    },
  });
  const binding = data?.binding ?? null;

  const bind = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      alert({ title: '格式錯誤', description: '請輸入 6 位數驗證碼。', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/line/link/code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '綁定失敗');
      setCode('');
      alert({ title: '綁定成功', description: 'AI 助理將同步你的 LINE 對話。', tone: 'success' });
      refetch();
    } catch (e: any) {
      alert({ title: '綁定失敗', description: e?.message || '請確認驗證碼後再試。', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const doUnbind = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/line/link`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) throw new Error();
      setUnbindOpen(false);
      refetch();
    } catch {
      setUnbindOpen(false);
      alert({ title: '解除失敗', description: '請稍後再試。', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // 直接跳進 LINE App 的官方帳號：先試原生 line:// scheme，失敗再退回 https（會由系統轉跳）
  const openLineOA = () => {
    const web = siteConfig.links.lineOfficialAdd;
    const native = web.replace('https://line.me/R/', 'line://');
    Linking.openURL(native).catch(() => Linking.openURL(web).catch(() => {}));
  };

  if (isLoading) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} size="small" />
      </View>
    );
  }

  if (binding) {
    return (
      <View style={{ padding: 16 }}>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tokens.ok + '22' }}>
            <Check size={18} color={theme.tokens.ok} strokeWidth={3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: '700' }}>已綁定 {binding.displayName || 'LINE 帳號'}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 1 }}>AI 助理已同步 LINE 對話</Text>
          </View>
          <Button mode="text" textColor={theme.colors.error} onPress={() => setUnbindOpen(true)} disabled={busy} compact>
            解除綁定
          </Button>
        </View>
        <ConfirmDialog
          open={unbindOpen}
          title="解除 LINE 綁定？"
          description="AI 助理將不再同步你的 LINE 對話。"
          confirmLabel="解除綁定"
          destructive
          busy={busy}
          onConfirm={doUnbind}
          onClose={() => !busy && setUnbindOpen(false)}
        />
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <View className="flex-row items-center" style={{ gap: 10, marginBottom: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: LINE_GREEN + '1F' }}>
          <LineLogo size={19} color={LINE_GREEN} />
        </View>
        <Text style={{ flex: 1, color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 }}>
          綁定後 AI 助理可跨 LINE／App 同步對話，並透過 LINE 接收公告推播。
        </Text>
      </View>

      {/* LINE 官方按鈕樣式：品牌綠底 + 白色官方標誌。深色模式改用官方 hover 綠，降低大面積純色的刺眼感。
          底色放在純 View 上（Pressable 帶背景色在此環境不穩定），Pressable 只負責觸控 */}
      <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.dark ? LINE_GREEN_DARK : LINE_GREEN, marginBottom: 12 }}>
        <Pressable
          onPress={openLineOA}
          android_ripple={{ color: 'rgba(0,0,0,0.16)' }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46 }}
        >
          <LineLogo size={20} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>1. 加入 LINE 官方帳號</Text>
          <ExternalLink size={14} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>

      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginBottom: 8 }}>
        2. 在 LINE 傳送「<Text style={{ fontWeight: '800', color: theme.colors.onSurface }}>帳號綁定</Text>」（或點下方選單）取得 6 位數驗證碼，輸入完成綁定：
      </Text>
      <View className="flex-row" style={{ gap: 10 }}>
        <TextInput
          placeholder="6 位數驗證碼"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          style={{
            flex: 1,
            height: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            backgroundColor: theme.colors.surfaceVariant + '55',
            paddingHorizontal: 14,
            color: theme.colors.onSurface,
            fontSize: 16,
            letterSpacing: 4,
            fontWeight: '700',
          }}
        />
        <Button mode="contained" onPress={bind} loading={busy} disabled={busy || code.length !== 6} style={{ borderRadius: 12, justifyContent: 'center' }}>
          綁定
        </Button>
      </View>
    </View>
  );
}

const THEME_OPTIONS = [
  { value: 'system', label: '跟隨系統', icon: MonitorSmartphone },
  { value: 'light', label: '淺色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
] as const;

/** 自訂主題切換：滑動膠囊指示器（與底部列同語言），非現成 SegmentedButtons */
function ThemeSection({ preference, setPreference }: { preference: string; setPreference: (p: any) => void }) {
  const theme = useAppTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, THEME_OPTIONS.findIndex((o) => o.value === preference));
  const PAD = 5;
  const slotW = w > 0 ? (w - PAD * 2) / THEME_OPTIONS.length : 0;

  const pos = useSharedValue(idx);
  useEffect(() => {
    pos.value = withSpring(idx, { damping: 15, stiffness: 230, mass: 0.7 });
  }, [idx, pos]);
  // 動畫 left（非 transform）：避免 Fabric 圖層提升蓋過文字
  const pillStyle = useAnimatedStyle(() => ({ left: PAD + pos.value * slotW }));

  return (
    <>
      <SectionLabel style={{ marginTop: 20 }}>外觀主題</SectionLabel>
      <View
        onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 54,
          borderRadius: 20,
          padding: PAD,
          backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surface,
          borderWidth: theme.dark ? 0 : 1,
          borderColor: theme.colors.outlineVariant,
        }}
      >
        {/* 滑動指示膠囊（在文字下層） */}
        {slotW > 0 ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: PAD,
                bottom: PAD,
                width: slotW,
                borderRadius: 15,
                backgroundColor: theme.dark ? 'rgba(102,171,223,0.26)' : theme.colors.primaryContainer,
                borderWidth: theme.dark ? 1 : 0,
                borderColor: 'rgba(102,171,223,0.45)',
              },
              pillStyle,
            ]}
          />
        ) : null}

        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = preference === value;
          const color = active ? theme.colors.primary : theme.colors.onSurfaceVariant;
          return (
            <Pressable
              key={value}
              onPress={() => setPreference(value)}
              style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon size={15} color={color} strokeWidth={active ? 2.5 : 2} />
              <Text style={{ color, fontSize: 13, fontWeight: active ? '800' : '600' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
