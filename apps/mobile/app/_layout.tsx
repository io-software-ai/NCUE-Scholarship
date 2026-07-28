import 'react-native-gesture-handler';
import '../global.css';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ThemeProvider, useAppTheme } from '../src/theme';
import { AuthProvider, useAuth } from '../src/lib/auth-context';
import { usePushRegistration } from '../src/lib/notifications';
import { LocalStoreProvider } from '../src/lib/localStore';
import { AlertProvider } from '../src/components/dialogs';
import { VerificationGate } from '../src/components/VerificationGate';

// 前台顯示推播（SDK 54+ 行為欄位）
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24h
      staleTime: 1000 * 60 * 5, // 5min
      retry: 2,
    },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage });

/** 從推播 payload 取出公告 id（後端可能放在 announcementId / announcement_id / id） */
function announcementIdFrom(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data.announcementId ?? data.announcement_id ?? data.id;
  return raw === undefined || raw === null || raw === '' ? null : String(raw);
}

/** App 圖示長按捷徑（Android 動態捷徑 / iOS Quick Actions）。
 *  原生模組未 build 進 dev client 時整段靜默略過，不影響啟動。 */
function useQuickActions() {
  const router = useRouter();
  useEffect(() => {
    let remove: (() => void) | undefined;
    (async () => {
      try {
        // @ts-ignore 選用原生模組，未 build 進 client 時走 catch
        const QA: any = await import('expo-quick-actions');
        if (!(await QA.isSupported?.())) return;
        await QA.setItems([
          { id: 'assistant', title: 'AI 助理', icon: 'symbol:sparkles', params: { href: '/?tab=assistant' } },
          { id: 'saved', title: '我的收藏', icon: 'symbol:bookmark', params: { href: '/?saved=1' } },
        ]);
        const go = (action: any) => {
          const href = action?.params?.href;
          if (typeof href === 'string') router.push(href as any);
        };
        if (QA.initial) setTimeout(() => go(QA.initial), 300); // 冷啟動：等導覽器就緒
        remove = QA.addListener?.(go)?.remove;
      } catch {
        /* 尚未 build 進 dev client：略過 */
      }
    })();
    return () => remove?.();
  }, [router]);
}

function ThemedNavigator() {
  const theme = useAppTheme();
  const router = useRouter();
  const { session } = useAuth();
  usePushRegistration(session); // 登入後自動註冊 FCM token（Stage 2）
  useQuickActions();

  // 推播深連結：點通知直接開該公告（冷啟動與前景各處理一次）
  useEffect(() => {
    let done = false;
    Notifications.getLastNotificationResponseAsync()
      .then((res) => {
        const id = announcementIdFrom(res?.notification?.request?.content?.data);
        if (id && !done) {
          done = true;
          setTimeout(() => router.push(`/announcement/${id}`), 300); // 等待導覽器就緒
        }
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const id = announcementIdFrom(res?.notification?.request?.content?.data);
      if (id) router.push(`/announcement/${id}`);
    });
    return () => sub.remove();
  }, [router]);

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: { fontWeight: '700', color: theme.colors.onSurface },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen
          name="announcement/[id]"
          options={{ headerShown: true, headerTitle: '公告詳情', headerBackTitle: '返回' }}
        />
        <Stack.Screen name="feedback" options={{ headerShown: true, headerTitle: '問題回報', headerBackTitle: '返回' }} />
        <Stack.Screen name="faq" options={{ headerShown: true, headerTitle: '常見問題', headerBackTitle: '返回' }} />
      </Stack>
      {/* 新帳號未完成校園身分驗證前，遮罩擋住整個 App（同步網頁版） */}
      <VerificationGate />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
          <ThemeProvider>
            <AuthProvider>
              <LocalStoreProvider>
                <AlertProvider>
                  <ThemedNavigator />
                </AlertProvider>
              </LocalStoreProvider>
            </AuthProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
