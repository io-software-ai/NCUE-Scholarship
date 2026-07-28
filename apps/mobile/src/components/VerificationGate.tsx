/**
 * 身分驗證閘門（App 版，對齊網頁版 ProfileCompletionModal）
 *
 * 登入一律走 Google，首次登入須完成身分驗證才能使用平台，分兩條路：
 * - 彰師大學生：以 @mail.ncue.edu.tw / @gm.ncue.edu.tw 登入自動通過（學號由信箱推導）；
 *   用其他信箱登入者在此輸入學校信箱收 6 位數驗證碼綁定學號。
 * - 校外使用者：沒有學校信箱，改為自備 Google AI Studio 的 Gemini 金鑰完成註冊，
 *   AI 功能一律以其本人的金鑰呼叫（用量與費用歸使用者本人）。
 * 未完成前整個 App 被遮罩擋住。
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Animated from 'react-native-reanimated';
import { ShieldCheck, Mail, KeyRound, LogOut, AlertCircle, Loader, GraduationCap, Globe, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { deriveStudentIdFromEmail, STUDENT_EMAIL_DOMAINS, siteConfig } from '@ncue/core';
import { useAuth } from '../lib/auth-context';
import { useAppTheme } from '../theme';
import { enterDialog } from '../lib/motion';
import { GeminiKeyForm } from './GeminiKeyForm';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;
const DOMAIN_HINT = STUDENT_EMAIL_DOMAINS.map((d) => `@${d}`).join(' 或 ');

type Step = 'choose' | 'school' | 'byok';

export function VerificationGate() {
  const theme = useAppTheme();
  const { session, needsVerification, refreshProfile, signOut } = useAuth();
  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 換帳號（或重新登入）時把流程歸零
  useEffect(() => {
    if (!needsVerification) {
      setStep('choose');
      setEmail('');
      setCode('');
      setCodeSent(false);
      setError('');
    }
  }, [needsVerification]);

  if (!needsVerification || !session) return null;

  const post = async (body: any) => {
    const res = await fetch(`${API}/api/verify-school-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || '操作失敗，請稍後再試');
    return json;
  };

  const sendCode = async () => {
    setError('');
    if (!deriveStudentIdFromEmail(email)) {
      setError(`請輸入正確的學校信箱（帳號${DOMAIN_HINT}）`);
      return;
    }
    setBusy(true);
    try {
      await post({ action: 'send', email: email.trim().toLowerCase() });
      setCodeSent(true);
    } catch (e: any) {
      setError(e?.message || '寄送失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setError('');
    setBusy(true);
    try {
      await post({ action: 'confirm', code });
      await refreshProfile(); // 綁定成功 → needsVerification 轉為 false，閘門自動關閉
    } catch (e: any) {
      setError(e?.message || '驗證失敗');
      setBusy(false);
    }
  };

  const inputStyle = {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surfaceVariant + '55',
    paddingHorizontal: 16,
    color: theme.colors.onSurface,
    fontSize: 15.5,
  } as const;

  const heading = step === 'school' ? '彰師大學生驗證' : step === 'byok' ? '校外使用者註冊' : '選擇你的身分';
  const subheading =
    step === 'school'
      ? `輸入你的學校信箱（${DOMAIN_HINT}）收取 6 位數驗證碼，驗證後自動綁定學號（教職員信箱則綁定信箱帳號）。`
      : step === 'byok'
        ? '提供你自己的 Gemini 金鑰即可啟用 AI 助理與平台完整功能。'
        : '平台同時開放彰師大學生與校外使用者，請先選擇你的身分。';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,12,18,0.72)' }]} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 }}
      >
        <Animated.View
          entering={enterDialog()}
          style={{
            width: '100%',
            maxWidth: 420,
            maxHeight: '92%',
            borderRadius: 28,
            overflow: 'hidden',
            backgroundColor: theme.dark ? theme.colors.elevation.level3 : theme.colors.surface,
            borderWidth: theme.dark ? 1 : 0,
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 24 }} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View className="items-center" style={{ marginBottom: 20 }}>
              <View style={{ width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
                {step === 'byok' ? <Globe size={30} color={theme.colors.primary} /> : <ShieldCheck size={30} color={theme.colors.primary} />}
              </View>
              <Text style={{ color: theme.colors.onSurface, fontWeight: '900', fontSize: 21, marginTop: 14, letterSpacing: -0.3 }}>{heading}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>
                {subheading}
              </Text>
            </View>

            {error ? (
              <View
                className="flex-row items-start"
                style={{ gap: 10, padding: 13, borderRadius: 16, marginBottom: 14, backgroundColor: theme.tokens.danger + '18', borderWidth: 1, borderColor: theme.tokens.danger + '33' }}
              >
                <AlertCircle size={17} color={theme.tokens.danger} />
                <Text style={{ flex: 1, color: theme.tokens.danger, fontSize: 13, lineHeight: 19, fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            {/* ── 身分分流 ── */}
            {step === 'choose' ? (
              <View style={{ gap: 11 }}>
                <IdentityOption
                  icon={GraduationCap}
                  title="我是彰師大學生"
                  description={`以學校信箱（${DOMAIN_HINT}）收驗證碼綁定學號，AI 功能由平台提供。`}
                  onSelect={() => {
                    setStep('school');
                    setError('');
                  }}
                />
                <IdentityOption
                  icon={Globe}
                  title="我不是彰師大學生"
                  description="自備 Google AI Studio 的 Gemini 金鑰即可註冊，同樣能使用 AI 助理與公告訂閱等完整功能。"
                  onSelect={() => {
                    setStep('byok');
                    setError('');
                  }}
                />
              </View>
            ) : null}

            {/* ── 彰師大學生：校信箱驗證碼 ── */}
            {step === 'school' ? (
              !codeSent ? (
                <>
                  <Label icon={Mail} text="學校信箱" />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder={`s1234567${STUDENT_EMAIL_DOMAINS[0] ? `@${STUDENT_EMAIL_DOMAINS[0]}` : ''}`}
                    placeholderTextColor={theme.colors.onSurfaceVariant + '99'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!busy}
                    onSubmitEditing={sendCode}
                    style={inputStyle}
                  />
                  <PrimaryButton label="寄送驗證碼" icon={Mail} busy={busy} onPress={sendCode} />
                </>
              ) : (
                <>
                  <Label icon={KeyRound} text={`驗證碼（已寄至 ${email.trim().toLowerCase()}）`} />
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="──────"
                    placeholderTextColor={theme.colors.onSurfaceVariant + '99'}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!busy}
                    style={{ ...inputStyle, textAlign: 'center', letterSpacing: 10, fontWeight: '800', fontSize: 19 }}
                  />
                  <PrimaryButton label="完成驗證，進入平台" icon={ShieldCheck} busy={busy} disabled={code.length !== 6} onPress={confirmCode} />
                  <Pressable
                    onPress={() => {
                      setCodeSent(false);
                      setCode('');
                      setError('');
                    }}
                    disabled={busy}
                    style={{ paddingVertical: 10, alignItems: 'center' }}
                  >
                    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, fontWeight: '700' }}>重新輸入信箱 / 重寄驗證碼</Text>
                  </Pressable>
                </>
              )
            ) : null}

            {/* ── 校外使用者：自備 Gemini 金鑰 ── */}
            {step === 'byok' ? (
              <GeminiKeyForm session={session} submitLabel="驗證金鑰，完成註冊" onSaved={() => refreshProfile()} />
            ) : null}

            {step !== 'choose' ? (
              <Pressable
                onPress={() => {
                  setStep('choose');
                  setError('');
                  setCodeSent(false);
                  setCode('');
                }}
                disabled={busy}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14 }}
              >
                <ChevronLeft size={15} color={theme.colors.onSurfaceVariant} />
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, fontWeight: '700' }}>回上一步，重新選擇身分</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={signOut} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12 }}>
              <LogOut size={15} color={theme.colors.onSurfaceVariant} />
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13.5, fontWeight: '700' }}>登出</Text>
            </Pressable>

            <View
              className="flex-row"
              style={{ gap: 9, padding: 13, borderRadius: 16, backgroundColor: theme.colors.surfaceVariant + '55', marginTop: 4 }}
            >
              <ShieldCheck size={14} color={theme.colors.onSurfaceVariant} />
              <Text style={{ flex: 1, color: theme.colors.onSurfaceVariant, fontSize: 11.5, lineHeight: 17 }}>
                {step === 'byok'
                  ? '校外帳號沒有學號，僅供瀏覽公告與使用 AI 助理；AI 一律以你提供的金鑰呼叫，可隨時在設定頁更換或清除。'
                  : '驗證僅用於確認在學身分並綁定學號，資料依平台隱私權政策保護。若以學校 Google 帳號登入則自動通過驗證。'}
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function IdentityOption({ icon: Icon, title, description, onSelect }: { icon: any; title: string; description: string; onSelect: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onSelect}
      android_ripple={{ color: theme.colors.surfaceVariant }}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 15,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surfaceVariant + '40',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.primaryContainer,
        }}
      >
        <Icon size={17} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 14.5 }}>{title}</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 19, marginTop: 3 }}>{description}</Text>
      </View>
      <ChevronRight size={16} color={theme.colors.outline} style={{ marginTop: 4 }} />
    </Pressable>
  );
}

function Label({ icon: Icon, text }: { icon: any; text: string }) {
  const theme = useAppTheme();
  return (
    <View className="flex-row items-center" style={{ gap: 6, marginBottom: 8, marginLeft: 2 }}>
      <Icon size={13} color={theme.colors.onSurfaceVariant} />
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5 }}>{text}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  icon: Icon,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  icon: any;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const off = busy || disabled;
  return (
    <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.primary, marginTop: 14, opacity: off ? 0.55 : 1 }}>
      <Pressable
        onPress={off ? undefined : onPress}
        android_ripple={{ color: 'rgba(255,255,255,0.24)' }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 }}
      >
        {busy ? <Loader size={18} color={theme.colors.onPrimary} /> : <Icon size={18} color={theme.colors.onPrimary} />}
        <Text style={{ color: theme.colors.onPrimary, fontWeight: '800', fontSize: 15.5 }}>{label}</Text>
      </Pressable>
    </View>
  );
}
