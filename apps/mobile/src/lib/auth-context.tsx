/**
 * 全域登入狀態 — 單一 onAuthStateChange 訂閱，供所有畫面共用。
 *
 * 另負責「身分驗證閘門」（同步網頁版 AuthContext）：
 * 登入後以 /api/auth/profile-sync 建立／取得 profile，再由 resolveAccountStatus 判定：
 * - 彰師大學生：有學號（校內信箱自動推導或以驗證碼綁定）→ 通過
 * - 校外使用者：已登記自備 Gemini 金鑰（本機或雲端）→ 通過
 * 兩者皆非時 needsVerification 為 true，由 VerificationGate 擋住整個 App。
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { resolveAccountStatus, needsLocalKeyOnThisDevice, siteConfig, type AccountStatus } from '@ncue/core';
import { supabase } from './supabase';
import { getLocalGeminiKey } from './geminiKey';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

interface Profile {
  id: string;
  student_id?: string | null;
  username?: string | null;
  email?: string | null;
  account_type?: string | null;
  gemini_key_storage?: string | null;
  gemini_key_hint?: string | null;
  [key: string]: any;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  /** 帳號身分狀態（彰師大學生 / 校外自備金鑰） */
  accountStatus: AccountStatus | null;
  /** 需完成身分驗證才能使用平台（僅在 profile 確實取得後才可能為 true） */
  needsVerification: boolean;
  /** 帳號登記為「僅存本機」但這台裝置沒有金鑰 → AI 需重新輸入金鑰（不擋瀏覽） */
  needsLocalKey: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  profile: null,
  accountStatus: null,
  needsVerification: false,
  needsLocalKey: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  // 只有「確定拿到 profile」才判定要不要擋人；連線失敗時不誤擋已通過驗證的使用者
  const [profileChecked, setProfileChecked] = useState(false);
  const [localKey, setLocalKey] = useState<string>('');
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /** 建立／取得 profile（與網頁版同一支 API，會自動補建新使用者的 profile 列） */
  const refreshProfile = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`${API}/api/auth/profile-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.profile) throw new Error(json?.error || 'profile-sync failed');
      setProfile(json.profile);
      setProfileChecked(true);
      setLocalKey(await getLocalGeminiKey());
    } catch {
      // 網路／伺服器異常：維持未判定狀態，不擋使用者，下次啟動 App 再試
      setProfileChecked(false);
    }
  }, [session]);

  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (!uid) {
      syncedFor.current = null;
      setProfile(null);
      setProfileChecked(false);
      setLocalKey('');
      return;
    }
    if (syncedFor.current === uid) return; // 同一使用者只同步一次（token 刷新不重打）
    syncedFor.current = uid;
    refreshProfile();
  }, [session, refreshProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileChecked(false);
    setLocalKey('');
    syncedFor.current = null;
  };

  const accountStatus = session
    ? resolveAccountStatus({ profile, email: session.user.email ?? '' })
    : null;

  const needsVerification = !!session && profileChecked && !!accountStatus && !accountStatus.verified;
  const needsLocalKey = !!accountStatus && needsLocalKeyOnThisDevice(accountStatus, localKey);

  return (
    <AuthContext.Provider
      value={{ session, loading, profile, accountStatus, needsVerification, needsLocalKey, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
