/**
 * Material 3 浮動膠囊底部導覽（搭配左右換頁分頁器）。
 * - 選中膠囊即時跟隨頁面捲動位置（progress）：拖頁時膠囊同步滑動（Google app 式）。
 * - 點分頁 → onTabPress → 分頁器平滑捲到該頁。
 * - 出現/消失＝從中間 Q 彈縮放；滑動/鍵盤時收起。
 * - 膠囊用動畫 left（非 transform）：Fabric 上 transform 會把 view 提升圖層蓋過 icon。
 * - 不用 expo-blur（原生模組不在 dev client 會閃退）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT, useTabBar } from '../lib/tabBar';

type TabIcon = (p: { focused: boolean; color: string; size: number }) => React.ReactNode;
export interface TabDef {
  key: string;
  label: string;
  icon: TabIcon;
}
interface Props {
  tabs: TabDef[];
  activeIndex: number;
  /** 0..count-1 的即時頁面捲動位置（供膠囊跟手滑動） */
  progress: SharedValue<number>;
  onTabPress: (index: number) => void;
  /** 拖曳膠囊時即時捲動頁面（0..count-1 的小數位置） */
  onScrub?: (position: number) => void;
  /** 放開膠囊：吸附到該分頁 */
  onScrubEnd?: (index: number) => void;
}

const POP_SPRING = { damping: 12, stiffness: 170, mass: 0.7 };
const H_PAD = 8;
const PILL_W = 66;

export function FloatingTabBar({ tabs, activeIndex, progress, onTabPress, onScrub, onScrubEnd }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { hidden } = useTabBar();
  const bottomGap = Math.max(insets.bottom, 10) + TAB_BAR_GAP;
  const appear = useSharedValue(0);
  const [barW, setBarW] = useState(0);
  const isDark = theme.dark;

  const count = tabs.length;
  const slotW = barW > 0 ? (barW - H_PAD * 2) / count : 0;
  const pillH = TAB_BAR_HEIGHT - 12;

  // 只在掛載時彈出一次
  useEffect(() => {
    appear.value = 0;
    appear.value = withSpring(1, POP_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      hidden.value = withTiming(1, { duration: 200 });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      hidden.value = withSpring(0, { damping: 11, stiffness: 190, mass: 0.7 });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [hidden]);

  const wrapStyle = useAnimatedStyle(() => {
    const slide = hidden.value;
    const a = appear.value;
    return {
      opacity:
        interpolate(slide, [0, 0.6, 1], [1, 0.35, 0], Extrapolation.CLAMP) *
        interpolate(a, [0, 0.55, 1], [0, 1, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: slide * (TAB_BAR_HEIGHT + bottomGap) + interpolate(a, [0, 1], [16, 0], Extrapolation.CLAMP) },
        { scale: interpolate(slide, [0, 1], [1, 0.3]) * interpolate(a, [0, 1], [0.8, 1]) },
      ],
    };
  });

  // 選中膠囊：即時跟隨頁面捲動位置（progress），拖頁時同步滑動
  const pillStyle = useAnimatedStyle(() => ({
    left: H_PAD + progress.value * slotW + (slotW - PILL_W) / 2,
  }));
  // 拖曳把手跟著膠囊走（透明、置於圖示之上才抓得到）
  const handleStyle = useAnimatedStyle(() => ({ left: H_PAD + progress.value * slotW }));

  // 拖曳膠囊 → 即時捲動頁面；放開吸附最近分頁
  const maxIdx = count - 1;
  const dragStart = useSharedValue(0);
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-4, 4])
        .onStart(() => {
          dragStart.value = progress.value;
        })
        .onUpdate((e) => {
          if (slotW <= 0) return;
          const pos = Math.min(Math.max(dragStart.value + e.translationX / slotW, 0), maxIdx);
          if (onScrub) runOnJS(onScrub)(pos);
        })
        .onEnd(() => {
          const idx = Math.min(Math.max(Math.round(progress.value), 0), maxIdx);
          if (onScrubEnd) runOnJS(onScrubEnd)(idx);
        }),
    [slotW, maxIdx, onScrub, onScrubEnd, progress, dragStart],
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: 'absolute', left: 0, right: 0, bottom: bottomGap, alignItems: 'center' }, wrapStyle]}
    >
      <View
        onLayout={(e) => setBarW(Math.round(e.nativeEvent.layout.width))}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: TAB_BAR_HEIGHT,
          paddingHorizontal: H_PAD,
          borderRadius: TAB_BAR_HEIGHT / 2,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
          // 半透明玻璃感：內容從底下滑過會微微透出（真實模糊需 expo-blur，重 build 後可加回）
          backgroundColor: isDark ? 'rgba(30,41,53,0.86)' : 'rgba(255,255,255,0.85)',
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.5 : 0.18,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 16,
        }}
      >
        {/* 視覺膠囊：在圖示下層（圓角與外框同心）。深色用亮色半透明才看得見 */}
        {slotW > 0 ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 6,
                width: PILL_W,
                height: pillH,
                borderRadius: pillH / 2,
                backgroundColor: isDark ? 'rgba(102,171,223,0.26)' : theme.colors.primaryContainer,
                borderWidth: isDark ? 1 : 0,
                borderColor: 'rgba(102,171,223,0.45)',
              },
              pillStyle,
            ]}
          />
        ) : null}

        {tabs.map((t, index) => (
          <TabButton
            key={t.key}
            focused={activeIndex === index}
            label={t.label}
            icon={t.icon}
            onPress={() => onTabPress(index)}
          />
        ))}

        {/* 透明拖曳把手：疊在目前分頁上方，可直接拖動膠囊來換頁 */}
        {slotW > 0 && onScrub ? (
          <GestureDetector gesture={drag}>
            <Animated.View
              style={[{ position: 'absolute', top: 0, width: slotW, height: TAB_BAR_HEIGHT, zIndex: 10 }, handleStyle]}
            />
          </GestureDetector>
        ) : null}
      </View>
    </Animated.View>
  );
}

function TabButton({
  focused,
  label,
  icon,
  onPress,
}: {
  focused: boolean;
  label: string;
  icon: TabIcon;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const p = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    p.value = withSpring(focused ? 1 : 0, { damping: 13, stiffness: 190, mass: 0.6 });
  }, [focused, p]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(p.value, [0, 1], [0, -1]) },
      { scale: interpolate(p.value, [0, 1], [1, 1.08]) * interpolate(press.value, [0, 1], [1, 0.82]) },
    ],
  }));

  const color = focused ? theme.colors.primary : theme.colors.onSurfaceVariant;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 12, stiffness: 220 });
      }}
      style={{ width: 76, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={iconStyle}>{icon({ focused, color, size: 21 })}</Animated.View>
      <Text style={{ fontSize: 10.5, marginTop: 2, fontWeight: focused ? '800' : '600', color }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
