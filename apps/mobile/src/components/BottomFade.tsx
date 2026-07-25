/**
 * 畫面邊緣霧化漸層 — 內容滑入邊緣時融入背景色，避免被浮動元件硬切。
 * 用 react-native-svg 的 LinearGradient（已內建於 dev client），
 * 不用 expo-linear-gradient（原生模組未 build 進去會閃退）。
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAppTheme } from '../theme';

function EdgeFade({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
  const theme = useAppTheme();
  const bg = theme.colors.background;
  const id = `fade-${edge}`;
  // top：上實下透；bottom：上透下實
  const stops =
    edge === 'top'
      ? [
          { o: '0', a: 1 },
          { o: '0.55', a: 0.9 },
          { o: '0.8', a: 0.5 },
          { o: '1', a: 0 },
        ]
      : [
          { o: '0', a: 0 },
          { o: '0.45', a: 0.55 },
          { o: '0.8', a: 0.92 },
          { o: '1', a: 1 },
        ];
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, [edge]: 0, height } as any}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {stops.map((s, i) => (
              <Stop key={i} offset={s.o} stopColor={bg} stopOpacity={String(s.a)} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export function BottomFade({ height = 110 }: { height?: number }) {
  return <EdgeFade edge="bottom" height={height} />;
}

export function TopFade({ height = 120 }: { height?: number }) {
  return <EdgeFade edge="top" height={height} />;
}
