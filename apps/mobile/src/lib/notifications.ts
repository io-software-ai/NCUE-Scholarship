import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { siteConfig } from '@ncue/core';
import { supabase } from './supabase';

const API = process.env.EXPO_PUBLIC_API_BASE || siteConfig.url;

export type PushRegisterResult =
  /** 權限已取得且 token 已存到後端 */
  | { ok: true; token: string }
  /** 使用者剛剛按了「拒絕」 */
  | { ok: false; reason: 'denied' }
  /** 系統層級已關閉且不會再跳詢問視窗 → 只能請使用者去系統設定開啟 */
  | { ok: false; reason: 'blocked' }
  /** 未登入，token 無法對應使用者 */
  | { ok: false; reason: 'signed-out' }
  /** 取 token 或上傳失敗（Firebase 未設定、模擬器、網路異常…） */
  | { ok: false; reason: 'error'; message?: string };

/**
 * 註冊推播並將「原生 FCM device token」儲存至既有後端。
 *
 * 重要：後端 `fcm_tokens` 直接透過 FCM 發送，所以這裡必須取「原生裝置 token」
 * (Android = FCM registration token，iOS = APNs token)，而不是 Expo push token。
 * → 使用 Notifications.getDevicePushTokenAsync()，而非 getExpoPushTokenAsync()。
 *
 * 回傳結構化結果（而非僅 token/undefined），讓 UI 能明確回饋「已開啟／被拒絕／請到系統設定開啟」，
 * 不會出現按了按鈕卻毫無反應的情況。
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegisterResult> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '獎學金通知',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#005A9C',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted) {
    // canAskAgain === false → 系統不會再跳窗，requestPermissionsAsync 會立刻回傳且畫面上「沒反應」
    if (current.canAskAgain === false) return { ok: false, reason: 'blocked' };
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
    if (!granted) return { ok: false, reason: asked.canAskAgain === false ? 'blocked' : 'denied' };
  }

  try {
    // 原生 FCM / APNs token（對應既有直發 FCM 後端）
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    const token = devicePushToken.data as string;
    if (!token) return { ok: false, reason: 'error', message: '無法取得裝置推播 token' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, reason: 'signed-out' };

    // POST 到既有後端 API（後端 save-token 期望 { token, deviceType }）
    const res = await fetch(`${API}/api/notifications/save-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        token,
        deviceType: Platform.OS, // ios / android
      }),
    });
    if (!res.ok) return { ok: false, reason: 'error', message: '推播裝置註冊失敗，請稍後再試' };
    return { ok: true, token };
  } catch (e: any) {
    // 常見原因：尚未設定 Firebase (google-services.json)，或在模擬器/無 Google Play 服務環境
    console.warn('取得裝置推播 token 失敗（可能尚未設定 Firebase）：', e);
    return { ok: false, reason: 'error', message: e?.message };
  }
}

/** 目前系統推播權限是否已開啟（供設定畫面顯示狀態用） */
export async function getPushPermissionGranted(): Promise<boolean> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/** 重新註冊的最小間隔（FCM token 會輪替，但不需每次進前景都打） */
const REREGISTER_MS = 1000 * 60 * 60 * 12;

/**
 * 自動註冊推播：登入後立刻註冊一次，之後每次回到前景（超過間隔）再確認一次。
 *
 * 先前只有「在登入頁完成登入」那一刻會註冊 —— 已登入的使用者重開 App 永遠不會註冊，
 * 導致後端 fcm_tokens 拿不到這台裝置、推播送不到。
 */
export function usePushRegistration(session: any) {
  const lastRef = useRef(0);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      lastRef.current = 0;
      return;
    }

    const run = () => {
      const now = Date.now();
      if (now - lastRef.current < REREGISTER_MS) return;
      lastRef.current = now;
      registerForPushNotificationsAsync().catch(() => {});
    };

    run(); // 登入 / 啟動時立即註冊
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [userId]);
}
