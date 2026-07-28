/**
 * 自備 Gemini 金鑰管理（App 版設定頁，對齊網頁版 AiKeyCard）
 *
 * 僅校外使用者顯示：
 * - 目前儲存位置與遮罩提示（完整金鑰不會回傳）
 * - 更換金鑰 / 改變儲存位置（本機 ↔ 雲端）
 * - 清除金鑰：校外帳號的功能全以金鑰為前提，清除等同放棄帳號 → 明確告知會同時註銷帳號
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Text, ActivityIndicator, Divider } from 'react-native-paper';
import { AlertCircle, ArrowUpRight, Cloud, KeyRound, Laptop, RefreshCw, Trash2 } from 'lucide-react-native';
import { AI_STUDIO_KEY_URL, siteConfig } from '@ncue/core';
import { useAuth } from '../lib/auth-context';
import { useAppTheme } from '../theme';
import { SectionLabel } from './ui';
import { ConfirmByTypingDialog, useAlert } from './dialogs';
import { GeminiKeyForm } from './GeminiKeyForm';
import { clearLocalGeminiKey } from '../lib/geminiKey';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

export function AiKeySection() {
  const theme = useAppTheme();
  const alert = useAlert();
  const { session, accountStatus, needsLocalKey, refreshProfile, signOut } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const isExternal = !!accountStatus?.isExternal;

  const load = useCallback(async () => {
    if (!session || !isExternal) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/users/ai-key`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json?.success) setStatus(json.status);
    } catch {
      /* 靜默：改以 accountStatus 顯示 */
    } finally {
      setLoading(false);
    }
  }, [session, isExternal]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isExternal || !session) return null;

  const keyStorage = status?.keyStorage || accountStatus?.keyStorage;
  const keyHint = status?.keyHint || accountStatus?.keyHint;

  const clearKey = async () => {
    setClearing(true);
    try {
      const res = await fetch(`${API}/api/users/ai-key`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || '清除失敗，請稍後再試');
      await clearLocalGeminiKey();
      setConfirmOpen(false);
      await signOut();
    } catch (e: any) {
      setConfirmOpen(false);
      alert({ title: '清除失敗', description: e?.message || '請稍後再試。', tone: 'error' });
    } finally {
      setClearing(false);
    }
  };

  const cardStyle = {
    borderRadius: 20,
    backgroundColor: theme.dark ? theme.colors.elevation.level1 : theme.colors.surface,
    borderWidth: theme.dark ? 0 : 1,
    borderColor: theme.colors.outlineVariant,
    overflow: 'hidden',
  } as const;

  return (
    <>
      <SectionLabel style={{ marginTop: 20 }}>AI 金鑰（校外使用者）</SectionLabel>
      <View style={cardStyle}>
        <View style={{ padding: 16, gap: 12 }}>
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
              <KeyRound size={17} color={theme.colors.primary} />
            </View>
            <Text style={{ flex: 1, color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 }}>
              你的帳號以自備的 Gemini 金鑰使用 AI 功能，用量與費用計入你自己的 Google 帳號。
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.colors.primary} size="small" style={{ alignSelf: 'flex-start' }} />
          ) : (
            <>
              {needsLocalKey ? (
                <View
                  className="flex-row items-start"
                  style={{ gap: 9, padding: 12, borderRadius: 14, backgroundColor: theme.tokens.warn + '18', borderWidth: 1, borderColor: theme.tokens.warn + '33' }}
                >
                  <AlertCircle size={16} color={theme.tokens.warn} />
                  <Text style={{ flex: 1, color: theme.tokens.warn, fontSize: 12.5, lineHeight: 18, fontWeight: '600' }}>
                    這台裝置找不到你的金鑰（金鑰只存在原本輸入的裝置）。請重新輸入，或改選「存於雲端帳號」。
                  </Text>
                </View>
              ) : null}

              <View className="flex-row" style={{ gap: 20 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, fontWeight: '700' }}>儲存位置</Text>
                  <View className="flex-row items-center" style={{ gap: 5, marginTop: 3 }}>
                    {keyStorage === 'server' ? <Cloud size={13} color={theme.colors.primary} /> : <Laptop size={13} color={theme.colors.primary} />}
                    <Text style={{ color: theme.colors.onSurface, fontSize: 13, fontWeight: '700' }}>
                      {keyStorage === 'server' ? '雲端帳號（加密）' : '僅這台裝置'}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, fontWeight: '700' }}>金鑰</Text>
                  <Text style={{ color: theme.colors.onSurface, fontSize: 13, fontWeight: '700', marginTop: 3 }}>{keyHint || '••••'}</Text>
                </View>
              </View>

              {editing ? (
                <View style={{ gap: 10 }}>
                  <GeminiKeyForm
                    session={session}
                    defaultStorage={keyStorage === 'local' ? 'local' : 'server'}
                    submitLabel="驗證並更新金鑰"
                    onSaved={async (next, message) => {
                      setStatus(next);
                      setEditing(false);
                      await refreshProfile();
                      alert({ title: '金鑰已更新', description: message, tone: 'success' });
                    }}
                  />
                  <Pressable onPress={() => setEditing(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, fontWeight: '700' }}>取消</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => setEditing(true)}
                    android_ripple={{ color: theme.colors.surfaceVariant }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      height: 46,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.primary + '66',
                    }}
                  >
                    <RefreshCw size={15} color={theme.colors.primary} />
                    <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 13.5 }}>更換金鑰 / 變更儲存位置</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Linking.openURL(AI_STUDIO_KEY_URL).catch(() => {})}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 }}
                  >
                    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, fontWeight: '700' }}>前往 Google AI Studio</Text>
                    <ArrowUpRight size={13} color={theme.colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>

        <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />

        <View style={{ padding: 16, gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 7 }}>
            <Trash2 size={15} color={theme.colors.error} />
            <Text style={{ color: theme.colors.error, fontWeight: '800', fontSize: 13.5 }}>清除金鑰</Text>
          </View>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 }}>
            校外帳號的所有功能都以你的金鑰為前提，清除金鑰將同時自動註銷帳號，個人資料、對話紀錄與訂閱都會一併刪除，且無法復原。
          </Text>
          <Pressable
            onPress={() => setConfirmOpen(true)}
            android_ripple={{ color: theme.colors.errorContainer }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              height: 46,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.error + '66',
            }}
          >
            <Text style={{ color: theme.colors.error, fontWeight: '800', fontSize: 13.5 }}>清除金鑰並註銷帳號</Text>
          </Pressable>
        </View>
      </View>

      <ConfirmByTypingDialog
        open={confirmOpen}
        title="清除金鑰並註銷帳號？"
        description="金鑰將從平台移除，帳號會同時註銷：個人資料、AI 對話紀錄與訂閱都會永久刪除，且無法復原。你在 Google AI Studio 的金鑰本身不會被刪除，可自行前往撤銷。"
        keyword="清除金鑰"
        confirmLabel="清除並註銷"
        busy={clearing}
        onConfirm={clearKey}
        onClose={() => !clearing && setConfirmOpen(false)}
      />
    </>
  );
}
