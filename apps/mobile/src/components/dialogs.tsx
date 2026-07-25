/**
 * 樣式化對話框（取代原生 Alert 的確認框，樣式與 App 一致）。
 * - ConfirmDialog：一般確認／破壞性確認（遮罩淡入、卡片 Q 彈縮放進場）。
 * - ConfirmByTypingDialog：Cloudflare 式打字確認（對齊網頁版：點擊關鍵字可自動帶入）。
 * 皆用 RN Modal（animationType="fade" → 遮罩淡入）＋ Reanimated ZoomIn（卡片縮放），
 * 不依賴任何原生模組，dev client 直接可用。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, ScrollView, Pressable, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import Animated from 'react-native-reanimated';
import { TriangleAlert, CheckCircle2, Info, CircleX } from 'lucide-react-native';
import { useAppTheme } from '../theme';
import { enterDialog } from '../lib/motion';

function Spinner({ color, size = 16 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, borderTopColor: 'transparent' }} />;
}

function Shell({ open, onClose, busy, children }: { open: boolean; onClose: () => void; busy?: boolean; children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      {/* 遮罩自成一層（點擊關閉）；卡片放在會避開鍵盤的容器裡置中 → 按鈕不會被鍵盤吃掉 */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,12,18,0.55)' }]} onPress={busy ? undefined : onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26 }}
        pointerEvents="box-none"
      >
        <Animated.View
          entering={enterDialog()}
          style={{
            width: '100%',
            maxWidth: 400,
            maxHeight: '88%',
            borderRadius: 26,
            overflow: 'hidden',
            backgroundColor: theme.dark ? theme.colors.elevation.level3 : theme.colors.surface,
            borderWidth: theme.dark ? 1 : 0,
            borderColor: 'rgba(255,255,255,0.06)',
            shadowColor: '#000',
            shadowOpacity: 0.28,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 16 },
            elevation: 14,
          }}
        >
          {/* 內容過高（小螢幕／大字級）時可捲動，按鈕永不被截掉 */}
          <ScrollView contentContainerStyle={{ padding: 22 }} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Actions({
  onClose,
  onConfirm,
  cancelLabel,
  confirmLabel,
  accent,
  onAccentText,
  disabled,
  busy,
}: {
  onClose: () => void;
  onConfirm: () => void;
  cancelLabel: string;
  confirmLabel: string;
  accent: string;
  onAccentText: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
      {/* 底色一律放在純 View 上（Pressable 帶背景色在此環境不穩定會變透明） */}
      <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.surfaceVariant, opacity: busy ? 0.5 : 1 }}>
        <Pressable
          onPress={busy ? undefined : onClose}
          android_ripple={{ color: theme.colors.outlineVariant }}
          style={{ paddingHorizontal: 20, height: 46, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 15 }}>{cancelLabel}</Text>
        </Pressable>
      </View>
      <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: accent || theme.colors.primary, opacity: disabled ? 0.45 : 1 }}>
        <Pressable
          onPress={disabled || busy ? undefined : onConfirm}
          android_ripple={{ color: 'rgba(255,255,255,0.24)' }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 96, paddingHorizontal: 22, height: 46 }}
        >
          {busy ? <Spinner color={onAccentText} /> : null}
          <Text style={{ color: onAccentText || '#FFFFFF', fontWeight: '800', fontSize: 15 }}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '確認',
  cancelLabel = '取消',
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const accent = destructive ? theme.tokens.danger : theme.colors.primary;
  const onAccentText = destructive ? '#FFFFFF' : theme.colors.onPrimary;
  return (
    <Shell open={open} onClose={onClose} busy={busy}>
      <View className="flex-row items-start" style={{ gap: 14 }}>
        {destructive ? (
          <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tokens.danger + '1F' }}>
            <TriangleAlert size={21} color={theme.tokens.danger} />
          </View>
        ) : null}
        <View style={{ flex: 1, paddingTop: destructive ? 2 : 0 }}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 18, letterSpacing: -0.2 }}>{title}</Text>
          {description ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, lineHeight: 21, marginTop: 8 }}>{description}</Text>
          ) : null}
        </View>
      </View>
      <Actions
        onClose={onClose}
        onConfirm={onConfirm}
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        accent={accent}
        onAccentText={onAccentText}
        busy={busy}
      />
    </Shell>
  );
}

export function ConfirmByTypingDialog({
  open,
  title,
  description,
  keyword,
  hint = '此操作無法復原',
  confirmLabel = '永久刪除',
  cancelLabel = '取消',
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  keyword: string;
  hint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const danger = theme.tokens.danger;
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);
  const matched = value.trim() === keyword;

  useEffect(() => {
    if (open) {
      setValue('');
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Shell open={open} onClose={onClose} busy={busy}>
      <View className="flex-row items-start" style={{ gap: 14 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: danger + '1F' }}>
          <TriangleAlert size={21} color={danger} />
        </View>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 18, letterSpacing: -0.2 }}>{title}</Text>
          {description ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, lineHeight: 21, marginTop: 8 }}>{description}</Text>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
          請輸入{' '}
          <Text
            onPress={() => {
              setValue(keyword);
              inputRef.current?.focus();
            }}
            style={{ color: danger, fontWeight: '800' }}
          >
            {keyword}
          </Text>
          {' '}以確認（點擊可自動帶入）
        </Text>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={setValue}
          placeholder={keyword}
          placeholderTextColor={theme.colors.onSurfaceVariant + '80'}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            marginTop: 8,
            height: 46,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: matched ? theme.tokens.ok : theme.colors.outlineVariant,
            paddingHorizontal: 14,
            color: theme.colors.onSurface,
            fontSize: 15,
            backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surfaceVariant + '55',
          }}
        />
        <View className="flex-row items-center" style={{ gap: 5, marginTop: 8 }}>
          <TriangleAlert size={12} color={theme.tokens.warn} />
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5 }}>{hint}</Text>
        </View>
      </View>

      <Actions
        onClose={onClose}
        onConfirm={onConfirm}
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        accent={danger}
        onAccentText="#FFFFFF"
        disabled={!matched}
        busy={busy}
      />
    </Shell>
  );
}

/* ── 全域訊息對話框（取代原生 Alert.alert）────────────── */

export type AlertTone = 'success' | 'error' | 'info';
export interface AlertOptions {
  title: string;
  description?: string;
  tone?: AlertTone;
  confirmLabel?: string;
  /** 次要動作（例如「開啟網頁」「來信客服」） */
  action?: { label: string; onPress: () => void };
  onClose?: () => void;
}

const AlertCtx = createContext<(o: AlertOptions) => void>(() => {});

/** 在任何畫面呼叫：const alert = useAlert(); alert({ title:'已儲存', tone:'success' }) */
export function useAlert() {
  return useContext(AlertCtx);
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const [opts, setOpts] = useState<AlertOptions | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((o: AlertOptions) => {
    setOpts(o);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    opts?.onClose?.();
  }, [opts]);

  const tone = opts?.tone ?? 'info';
  const accent =
    tone === 'success' ? theme.tokens.ok : tone === 'error' ? theme.tokens.danger : theme.colors.primary;
  const ToneIcon = tone === 'success' ? CheckCircle2 : tone === 'error' ? CircleX : Info;

  const ctxValue = useMemo(() => show, [show]);

  return (
    <AlertCtx.Provider value={ctxValue}>
      {children}
      <Shell open={open} onClose={close}>
        <View className="flex-row items-start" style={{ gap: 14 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: accent + '1F' }}>
            <ToneIcon size={22} color={accent} />
          </View>
          <View style={{ flex: 1, paddingTop: 2 }}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 18, letterSpacing: -0.2 }}>{opts?.title}</Text>
            {opts?.description ? (
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, lineHeight: 21, marginTop: 8 }}>{opts.description}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          {opts?.action ? (
            <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.surfaceVariant }}>
              <Pressable
                onPress={() => {
                  const fn = opts.action!.onPress;
                  setOpen(false);
                  fn();
                }}
                android_ripple={{ color: theme.colors.outlineVariant }}
                style={{ paddingHorizontal: 20, height: 46, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 15 }}>{opts.action.label}</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: accent }}>
            <Pressable
              onPress={close}
              android_ripple={{ color: 'rgba(255,255,255,0.24)' }}
              style={{ minWidth: 96, paddingHorizontal: 22, height: 46, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>{opts?.confirmLabel ?? '好'}</Text>
            </Pressable>
          </View>
        </View>
      </Shell>
    </AlertCtx.Provider>
  );
}
