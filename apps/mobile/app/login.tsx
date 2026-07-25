import React, { useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { enterUp, enterDown } from '../src/lib/motion';
import Svg, { Path } from 'react-native-svg';
import { X, GraduationCap, Sparkles, BellRing, Newspaper } from 'lucide-react-native';
import { siteConfig } from '@ncue/core';
import { signInWithGoogle } from '../src/lib/auth';
import { registerForPushNotificationsAsync } from '../src/lib/notifications';
import { useAppTheme } from '../src/theme';

/** 彩色 Google G（官方四色，SVG 內建可用） */
function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

const FEATURES = [
  { icon: Sparkles, text: 'AI 助理：找獎學金、看資格、改自傳' },
  { icon: BellRing, text: '截止提醒：重要期限不再錯過' },
  { icon: Newspaper, text: '最新公告：校內外獎助學金一手掌握' },
];

export default function LoginScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      registerForPushNotificationsAsync().catch(() => {});
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    } catch (e: any) {
      if (e?.code !== 'SIGN_IN_CANCELLED' && e?.code !== '-5') {
        setError(e?.message || '登入失敗，請稍後再試');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* 關閉 */}
      <View className="flex-row justify-end px-3 pt-2">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.colors.surfaceVariant : 'transparent',
          })}
        >
          <X size={22} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* 品牌區 */}
      <View className="flex-1 justify-center px-8">
        <Animated.View entering={enterUp()} className="items-center">
          <View
            style={{
              width: 92,
              height: 92,
              borderRadius: 30,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.primaryContainer,
              shadowColor: theme.colors.primary,
              shadowOpacity: 0.25,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 10 },
              elevation: 8,
            }}
          >
            <GraduationCap size={46} color={theme.colors.primary} />
          </View>
          <Text style={{ color: theme.colors.onSurface, fontWeight: '800', fontSize: 26, marginTop: 22, letterSpacing: -0.4 }}>
            {siteConfig.schoolShort}獎學金
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14.5, marginTop: 6, textAlign: 'center' }}>
            校外獎助學金資訊，一個 App 就夠
          </Text>
        </Animated.View>

        {/* 特色列 */}
        <View style={{ marginTop: 34, gap: 14 }}>
          {FEATURES.map(({ icon: Icon, text }, i) => (
            <Animated.View key={text} entering={enterUp(140 + i * 90)} className="flex-row items-center" style={{ gap: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
                <Icon size={16} color={theme.colors.primary} />
              </View>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, flex: 1 }}>{text}</Text>
            </Animated.View>
          ))}
        </View>
      </View>

      {/* 登入區 */}
      <Animated.View entering={enterDown(250)} className="px-8 pb-10">
        {error ? (
          <Text style={{ color: theme.colors.error, textAlign: 'center', marginBottom: 14, fontSize: 13 }}>{error}</Text>
        ) : null}

        {/* Google 官方樣式按鈕：白底 + 彩色 G */}
        <View
          style={{
            borderRadius: 999,
            overflow: 'hidden',
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : '#DADCE0',
            shadowColor: '#0F2137',
            shadowOpacity: 0.1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 5 },
            elevation: 3,
            opacity: loading ? 0.75 : 1,
          }}
        >
        <Pressable
          onPress={login}
          disabled={loading}
          android_ripple={{ color: 'rgba(0,0,0,0.10)' }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, height: 54 }}
        >
          <GoogleG size={21} />
          <Text style={{ color: '#1F2937', fontWeight: '700', fontSize: 15.5 }}>
            {loading ? '正在連線 Google…' : '使用 Google 帳號登入'}
          </Text>
        </Pressable>
        </View>

        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 18 }}>
          登入即代表你同意本平台的
          <Text style={{ color: theme.colors.primary, fontWeight: '600' }} onPress={() => Linking.openURL(`${siteConfig.url}/terms-and-privacy`)}>
            {' '}服務條款與隱私權政策
          </Text>
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}
