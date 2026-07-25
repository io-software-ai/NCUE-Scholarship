/**
 * Material 3 主題系統 — react-native-paper 為色彩單一來源。
 *
 * - `theme.colors.*` = MD3 角色（品牌化）。
 * - `theme.tokens.*` = Web 語意色票（ink / line / cat-a…g / ok-warn-danger）。
 * - 明暗整組切換，保證一致；支援 系統 / 淺 / 深 三態並持久化。
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MD3LightTheme,
  MD3DarkTheme,
  PaperProvider,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import { light, dark, type Palette, type SchemeName } from './colors';

export type AppTheme = MD3Theme & { tokens: Palette; scheme: SchemeName };

function buildTheme(base: MD3Theme, p: Palette, scheme: SchemeName): AppTheme {
  const isDark = scheme === 'dark';
  const elevation = isDark
    ? {
        level0: 'transparent',
        level1: '#1C242D',
        level2: '#1F2831',
        level3: '#212C36',
        level4: '#232E38',
        level5: '#26323D',
      }
    : {
        level0: 'transparent',
        level1: '#F0F4F8',
        level2: '#E9F0F6',
        level3: '#E3ECF3',
        level4: '#E0EAF2',
        level5: '#DBE7F0',
      };

  return {
    ...base,
    roundness: 4, // MD3 8dp grid; Paper multiplies roundness*? keep components rounded via style
    tokens: p,
    scheme,
    colors: {
      ...base.colors,
      primary: p.primary,
      onPrimary: p.onPrimary,
      primaryContainer: p.primaryTint,
      onPrimaryContainer: p.onPrimaryTint,
      secondary: isDark ? '#A9B7C6' : '#4C5A69',
      onSecondary: isDark ? '#17202A' : '#FFFFFF',
      secondaryContainer: isDark ? '#28323D' : '#E1E8EF',
      onSecondaryContainer: isDark ? '#D5DFEA' : '#2A3542',
      tertiary: p.cat.F,
      onTertiary: isDark ? '#1A1B4B' : '#FFFFFF',
      tertiaryContainer: isDark ? '#2A2D66' : '#E7E7FB',
      onTertiaryContainer: isDark ? '#DEDEFF' : '#23227A',
      background: p.page,
      onBackground: p.ink,
      surface: p.surface,
      onSurface: p.ink,
      surfaceVariant: p.surfaceHover,
      onSurfaceVariant: p.inkSoft,
      outline: p.lineStrong,
      outlineVariant: p.line,
      error: p.danger,
      onError: isDark ? '#3A0F0A' : '#FFFFFF',
      errorContainer: isDark ? '#3A1512' : '#FDECEA',
      onErrorContainer: isDark ? '#F8C6C1' : '#7A160E',
      inverseSurface: isDark ? '#E7ECF2' : '#2A3542',
      inverseOnSurface: isDark ? '#1C2B3A' : '#EFF4F9',
      inversePrimary: isDark ? light.primary : dark.primary,
      surfaceDisabled: isDark ? 'rgba(231,236,242,0.12)' : 'rgba(28,43,58,0.12)',
      onSurfaceDisabled: isDark ? 'rgba(231,236,242,0.38)' : 'rgba(28,43,58,0.38)',
      backdrop: 'rgba(9,14,20,0.5)',
      elevation,
    },
  };
}

export const paperLight = buildTheme(MD3LightTheme, light, 'light');
export const paperDark = buildTheme(MD3DarkTheme, dark, 'dark');

/** 型別化的 useTheme */
export const useAppTheme = () => useTheme<AppTheme>();

/** 依分類代碼取徽章色 */
export const useCategoryColor = () => {
  const t = useAppTheme();
  return (code?: string | null) =>
    (code && t.tokens.cat[code as keyof Palette['cat']]) || t.tokens.inkSoft;
};

// ── 主題偏好（系統 / 淺 / 深）────────────────────────────────
export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'ncue.themePreference';

interface ThemeCtx {
  preference: ThemePreference;
  scheme: SchemeName;
  setPreference: (p: ThemePreference) => void;
}
const Ctx = createContext<ThemeCtx>({
  preference: 'system',
  scheme: 'light',
  setPreference: () => {},
});

export const useThemePreference = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') {
        setPreferenceState(v);
        setColorScheme(v);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    setColorScheme(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  };

  const scheme: SchemeName = colorScheme === 'dark' ? 'dark' : 'light';
  const theme = scheme === 'dark' ? paperDark : paperLight;

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme]);

  return (
    <Ctx.Provider value={value}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </Ctx.Provider>
  );
}
