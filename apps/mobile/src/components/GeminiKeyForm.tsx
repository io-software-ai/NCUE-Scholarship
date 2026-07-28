/**
 * 自備 Gemini 金鑰設定表單（App 版，對齊網頁版 GeminiKeyForm）
 *
 * 兩處共用：
 * - 身分驗證閘門（校外使用者註冊）
 * - 設定頁「AI 金鑰」（更換金鑰 / 改變儲存位置）
 *
 * 儲存位置：'local' 只寫入本機 SecureStore（伺服器僅留遮罩提示，每次請求由 App 附帶）、
 * 'server' 由伺服器加密存於帳號（換裝置與 LINE 都能用）。
 */
import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, Linking } from 'react-native';
import { Text } from 'react-native-paper';
import { AlertCircle, ArrowUpRight, Check, Cloud, Eye, EyeOff, KeyRound, Laptop, Loader, ShieldCheck } from 'lucide-react-native';
import { AI_STUDIO_KEY_URL, isLikelyGeminiKey, normalizeGeminiKey, siteConfig, type KeyStorage } from '@ncue/core';
import { useAppTheme } from '../theme';
import { setLocalGeminiKey, clearLocalGeminiKey } from '../lib/geminiKey';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

const STORAGE_HINT: Record<KeyStorage, string> = {
  server: '加密後存在平台，換裝置登入即可使用，LINE 官方帳號的 AI 回覆也能運作。',
  local: '金鑰只留在本機安全儲存區，平台僅保存末四碼提示；換裝置需重新輸入，LINE 無法代為呼叫 AI。',
};

export function GeminiKeyForm({
  session,
  onSaved,
  defaultStorage = 'server',
  submitLabel = '驗證並啟用',
}: {
  session: any;
  onSaved: (status: any, message?: string) => void | Promise<void>;
  defaultStorage?: KeyStorage;
  submitLabel?: string;
}) {
  const theme = useAppTheme();
  const [key, setKey] = useState('');
  const [storage, setStorage] = useState<KeyStorage>(defaultStorage);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serverStorageAvailable, setServerStorageAvailable] = useState(true);

  useEffect(() => {
    // 伺服器未設定加密密鑰時不提供「存於雲端」（避免選了才失敗）
    fetch(`${API}/api/users/ai-key`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json?.serverStorageAvailable === false) {
          setServerStorageAvailable(false);
          setStorage('local');
        }
      })
      .catch(() => {});
  }, [session]);

  const submit = async () => {
    const normalized = normalizeGeminiKey(key);
    setError('');
    if (!isLikelyGeminiKey(normalized)) {
      setError('金鑰格式看起來不對，請確認已完整複製 Google AI Studio 產生的金鑰（勿含空白或換行）。');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/users/ai-key`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: normalized, storage }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || '設定失敗，請稍後再試');

      // 本機模式才把金鑰留在這台裝置；改為雲端時清掉本機殘留，避免兩份不同步
      if (storage === 'local') await setLocalGeminiKey(normalized);
      else await clearLocalGeminiKey();

      setKey('');
      await onSaved(json.status, json.message);
    } catch (e: any) {
      setError(e?.message || '設定失敗，請稍後再試');
    } finally {
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
    paddingRight: 46,
    color: theme.colors.onSurface,
    fontSize: 14,
  } as const;

  return (
    <View style={{ gap: 14 }}>
      {/* 取得金鑰的指引（壓成一段：閘門內版面不能太長） */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 9,
          borderRadius: 16,
          paddingHorizontal: 13,
          paddingVertical: 12,
          backgroundColor: theme.colors.surfaceVariant + '55',
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
        }}
      >
        <KeyRound size={14} color={theme.colors.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 19 }}>
            還沒有金鑰？到 Google AI Studio 點「Create API key」建立（個人使用有免費額度），把產生的金鑰完整複製貼到下方。
          </Text>
          <Pressable
            onPress={() => Linking.openURL(AI_STUDIO_KEY_URL).catch(() => {})}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 }}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12.5 }}>開啟金鑰頁面</Text>
            <ArrowUpRight size={13} color={theme.colors.primary} />
          </Pressable>
        </View>
      </View>

      {error ? (
        <View
          className="flex-row items-start"
          style={{ gap: 10, padding: 13, borderRadius: 16, backgroundColor: theme.tokens.danger + '18', borderWidth: 1, borderColor: theme.tokens.danger + '33' }}
        >
          <AlertCircle size={17} color={theme.tokens.danger} />
          <Text style={{ flex: 1, color: theme.tokens.danger, fontSize: 13, lineHeight: 19, fontWeight: '600' }}>{error}</Text>
        </View>
      ) : null}

      {/* 金鑰輸入 */}
      <View style={{ position: 'relative', justifyContent: 'center' }}>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="貼上 Gemini API 金鑰"
          placeholderTextColor={theme.colors.onSurfaceVariant + '99'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showKey}
          editable={!busy}
          style={inputStyle}
        />
        <Pressable
          onPress={() => setShowKey((v) => !v)}
          hitSlop={10}
          style={{ position: 'absolute', right: 14 }}
          accessibilityLabel={showKey ? '隱藏金鑰' : '顯示金鑰'}
        >
          {showKey ? <EyeOff size={17} color={theme.colors.onSurfaceVariant} /> : <Eye size={17} color={theme.colors.onSurfaceVariant} />}
        </Pressable>
      </View>

      {/* 儲存位置：兩顆並排，說明只顯示目前選項的一行 */}
      <View>
        <View className="flex-row" style={{ gap: 8 }}>
          <StorageChip
            active={storage === 'server'}
            disabled={!serverStorageAvailable}
            icon={Cloud}
            label="存於雲端帳號"
            onSelect={() => setStorage('server')}
          />
          <StorageChip active={storage === 'local'} icon={Laptop} label="僅存這台裝置" onSelect={() => setStorage('local')} />
        </View>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, lineHeight: 17, marginTop: 8, marginHorizontal: 2 }}>
          {serverStorageAvailable ? '' : '此平台尚未啟用雲端加密儲存。'}
          {STORAGE_HINT[storage]}
        </Text>
      </View>

      <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.primary, opacity: busy || !key.trim() ? 0.55 : 1 }}>
        <Pressable
          onPress={busy || !key.trim() ? undefined : submit}
          android_ripple={{ color: 'rgba(255,255,255,0.24)' }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 }}
        >
          {busy ? <Loader size={18} color={theme.colors.onPrimary} /> : <ShieldCheck size={18} color={theme.colors.onPrimary} />}
          <Text style={{ color: theme.colors.onPrimary, fontWeight: '800', fontSize: 15.5 }}>{busy ? '正在驗證金鑰…' : submitLabel}</Text>
        </Pressable>
      </View>

      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, lineHeight: 16, marginHorizontal: 2, opacity: 0.85 }}>
        金鑰僅用於代你呼叫 Gemini，用量與費用計入你自己的 Google 帳號；平台不會顯示或轉交完整金鑰，可隨時更換或清除。
      </Text>
    </View>
  );
}

function StorageChip({
  active,
  disabled,
  icon: Icon,
  label,
  onSelect,
}: {
  active: boolean;
  disabled?: boolean;
  icon: any;
  label: string;
  onSelect: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onSelect}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 11,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
        backgroundColor: active ? theme.colors.primaryContainer + (theme.dark ? '55' : '99') : 'transparent',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon size={15} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
      <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '800', fontSize: 12.5 }}>
        {label}
      </Text>
      {active ? <Check size={13} color={theme.colors.primary} strokeWidth={3} /> : null}
    </Pressable>
  );
}
