import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

/**
 * 註冊推播並將「原生 FCM device token」儲存至既有後端。
 *
 * 重要：後端 `fcm_tokens` 直接透過 FCM 發送，所以這裡必須取「原生裝置 token」
 * (Android = FCM registration token，iOS = APNs token)，而不是 Expo push token。
 * → 使用 Notifications.getDevicePushTokenAsync()，而非 getExpoPushTokenAsync()。
 *
 * 注意：Android 端 getDevicePushTokenAsync() 需要專案已設定 Firebase
 * (google-services.json)；在設定完成前會拋錯，這裡以 try/catch 靜默處理。
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '獎學金通知',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#005A9C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('推播權限未授予，略過 token 註冊');
    return undefined;
  }

  try {
    // 原生 FCM / APNs token（對應既有直發 FCM 後端）
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    const token = devicePushToken.data as string;

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token && token) {
      // POST 到既有後端 API（後端 save-token 期望 { token, deviceType }）
      await fetch(`${process.env.EXPO_PUBLIC_API_BASE}/api/notifications/save-token`, {
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
    }
    return token;
  } catch (e) {
    // 常見原因：尚未設定 Firebase (google-services.json)，或在模擬器/無 Google Play 服務環境
    console.warn('取得裝置推播 token 失敗（可能尚未設定 Firebase）：', e);
    return undefined;
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
