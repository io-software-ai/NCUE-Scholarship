/**
 * 設計系統色票 — 單一來源
 *
 * 沿用 Web `@theme` 的語意命名與明暗兩套色值。
 * 這裡是 JS 端唯一來源；`global.css` 的 CSS 變數為對應鏡像（給 NativeWind class 用）。
 * 分類色 cat-a…g 與語意色 ok/warn/danger 皆對齊 packages/core 的 class 命名。
 */

export interface Palette {
  page: string;
  surface: string;
  surfaceHover: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkSoft: string;
  primary: string;
  onPrimary: string;
  primaryTint: string;
  onPrimaryTint: string;
  ok: string;
  warn: string;
  danger: string;
  okBright: string;
  warnBright: string;
  dangerBright: string;
  /** 分類徽章色 A…G */
  cat: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', string>;
}

export const light: Palette = {
  page: '#F6F8FA',
  surface: '#FFFFFF',
  surfaceHover: '#EFF4F9',
  line: '#E3E8EE',
  lineStrong: '#7E8B99',
  ink: '#1C2B3A',
  inkSoft: '#5B6B7C',
  primary: '#005A9C',
  onPrimary: '#FFFFFF',
  primaryTint: '#E8F1F8',
  onPrimaryTint: '#00426F',
  ok: '#0F7A52',
  warn: '#B45309',
  danger: '#B42318',
  okBright: '#16B364',
  warnBright: '#F79009',
  dangerBright: '#F04438',
  cat: {
    A: '#B42318',
    B: '#B54708',
    C: '#A15C07',
    D: '#067647',
    E: '#0E7090',
    F: '#3538CD',
    G: '#6941C6',
  },
};

export const dark: Palette = {
  page: '#10151B',
  surface: '#171E26',
  surfaceHover: '#1E2731',
  line: '#2A3542',
  lineStrong: '#576878',
  ink: '#E7ECF2',
  inkSoft: '#97A5B4',
  primary: '#66ABDF',
  onPrimary: '#00344F',
  primaryTint: '#1B2C3C',
  onPrimaryTint: '#CFE4F5',
  ok: '#4BC194',
  warn: '#E0A25B',
  danger: '#EE8B80',
  okBright: '#2ED47E',
  warnBright: '#FDB022',
  dangerBright: '#F97066',
  cat: {
    A: '#EE8B80',
    B: '#E5985C',
    C: '#D3A94E',
    D: '#57C08F',
    E: '#5EB3CF',
    F: '#9EA4F0',
    G: '#BC9AE8',
  },
};

export type SchemeName = 'light' | 'dark';
export const palettes: Record<SchemeName, Palette> = { light, dark };
