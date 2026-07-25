import React, { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable, Linking, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { enterUp } from '../src/lib/motion';
import { Bug, FileWarning, Lightbulb, HelpCircle, Mail, Send, Check, MessagesSquare } from 'lucide-react-native';
import { siteConfig } from '@ncue/core';
import { useAuth } from '../src/lib/auth-context';
import { useAppTheme } from '../src/theme';
import { useAlert } from '../src/components/dialogs';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;
const DESC_MAX = 2000;

const TYPES = [
  { key: '功能異常', desc: 'App 或網站壞掉、閃退', icon: Bug },
  { key: '內容錯誤', desc: '公告資訊有誤或過期', icon: FileWarning },
  { key: '使用建議', desc: '希望新增或改善功能', icon: Lightbulb },
  { key: '其他', desc: '其他想告訴我們的事', icon: HelpCircle },
];

export default function FeedbackScreen() {
  const theme = useAppTheme();
  const alert = useAlert();
  const router = useRouter();
  const { session } = useAuth();
  const [type, setType] = useState('功能異常');
  const [desc, setDesc] = useState('');
  const [email, setEmail] = useState(session?.user?.email ?? '');
  const [busy, setBusy] = useState(false);

  const cardBg = theme.dark ? theme.colors.elevation.level1 : theme.colors.surface;
  const cardBorder = { borderWidth: theme.dark ? 0 : 1, borderColor: theme.colors.outlineVariant } as const;

  const submit = async () => {
    if (desc.trim().length < 5) {
      alert({ title: '請再詳細一點', description: '請描述你遇到的問題或建議（至少 5 個字）。', tone: 'info' });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('description', desc.trim());
      if (email.trim()) fd.append('email', email.trim());
      fd.append('page', 'mobile-app');
      const res = await fetch(`${API}/api/send-feedback`, { method: 'POST', body: fd as any });
      if (!res.ok) throw new Error(String(res.status));
      alert({ title: '已送出', description: '感謝你的回報，我們會盡快處理！', tone: 'success', onClose: () => router.back() });
    } catch {
      alert({
        title: '送出失敗',
        description: '請稍後再試，或直接來信客服。',
        tone: 'error',
        action: { label: '來信客服', onPress: () => Linking.openURL(`mailto:${siteConfig.supportEmail}?subject=平台問題回報`) },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: true, title: '問題回報' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* 引言卡 */}
          <Animated.View
            entering={enterUp()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, backgroundColor: theme.colors.primaryContainer, marginBottom: 22 }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
              <MessagesSquare size={20} color={theme.colors.primary} />
            </View>
            <Text style={{ flex: 1, color: theme.colors.onSurface, fontSize: 13.5, lineHeight: 20 }}>
              遇到問題或有建議嗎？告訴我們，一起把平台做得更好。
            </Text>
          </Animated.View>

          {/* 類型：2×2 卡片網格 */}
          <Animated.View entering={enterUp(60)}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, fontWeight: '800', letterSpacing: 0.3, marginBottom: 10 }}>
              問題類型
            </Text>
            <View style={{ borderRadius: 20, backgroundColor: cardBg, ...cardBorder, overflow: 'hidden', marginBottom: 22 }}>
              {TYPES.map(({ key, desc: d, icon: Icon }, i) => {
                const active = type === key;
                return (
                  <React.Fragment key={key}>
                    {i > 0 ? <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant, marginLeft: 62 }} /> : null}
                    <Pressable
                      onPress={() => setType(key)}
                      android_ripple={{ color: theme.colors.surfaceVariant }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 13,
                        backgroundColor: active ? theme.colors.primaryContainer + (theme.dark ? '' : '99') : 'transparent',
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: active ? theme.colors.primary : theme.colors.surfaceVariant,
                        }}
                      >
                        <Icon size={17} color={active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.onSurface, fontWeight: active ? '800' : '600', fontSize: 14.5 }}>{key}</Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 1 }}>{d}</Text>
                      </View>
                      {/* radio */}
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: 2,
                          borderColor: active ? theme.colors.primary : theme.colors.outline,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary }} /> : null}
                      </View>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>
          </Animated.View>

          {/* 描述卡（純 RN TextInput，無 placeholder 爆版問題） */}
          <Animated.View entering={enterUp(120)}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, fontWeight: '800', letterSpacing: 0.3, marginBottom: 10 }}>
              詳細描述
            </Text>
            <View style={{ borderRadius: 20, backgroundColor: cardBg, ...cardBorder, padding: 16, marginBottom: 6 }}>
              <TextInput
                placeholder="描述遇到的狀況或你的建議…"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={desc}
                onChangeText={(t) => setDesc(t.slice(0, DESC_MAX))}
                multiline
                textAlignVertical="top"
                style={{ color: theme.colors.onSurface, fontSize: 15, lineHeight: 22, minHeight: 120, padding: 0 }}
              />
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, textAlign: 'right', marginTop: 8, opacity: 0.7 }}>
                {desc.length}/{DESC_MAX}
              </Text>
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginBottom: 22, marginLeft: 4, opacity: 0.8 }}>
              可包含操作步驟、公告名稱或錯誤訊息，會更快處理。
            </Text>
          </Animated.View>

          {/* 聯絡信箱卡 */}
          <Animated.View entering={enterUp(180)}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, fontWeight: '800', letterSpacing: 0.3, marginBottom: 10 }}>
              聯絡信箱（選填）
            </Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, backgroundColor: cardBg, ...cardBorder, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 6 }}
            >
              <Mail size={18} color={theme.colors.onSurfaceVariant} />
              <TextInput
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: theme.colors.onSurface, fontSize: 15, paddingVertical: 14 }}
              />
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginBottom: 28, marginLeft: 4, opacity: 0.8 }}>
              留下信箱，我們才能回覆你。
            </Text>

            <Button
              mode="contained"
              onPress={submit}
              loading={busy}
              disabled={busy || desc.trim().length === 0}
              icon={() => <Send size={17} color={theme.colors.onPrimary} />}
              contentStyle={{ paddingVertical: 8, flexDirection: 'row-reverse' }}
              style={{ borderRadius: 999 }}
              labelStyle={{ fontSize: 15.5, fontWeight: '800' }}
            >
              送出回報
            </Button>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
