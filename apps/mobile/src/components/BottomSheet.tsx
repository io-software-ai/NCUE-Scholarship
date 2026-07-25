/**
 * 共用底部面板：貼底、進場上滑、遮罩淡入，並支援「下拉關閉」。
 *
 * 實作重點：
 * - 卡片固定 bottom:0，用 translateY 控制，不用 SlideInDown（會浮空，見專案慣例）。
 * - 拖曳手勢掛在頂部把手區（非整張卡），否則會與內層 ScrollView/FlatList 打架。
 * - Modal 內的手勢需要自己的 GestureHandlerRootView，否則 Android 收不到事件。
 */
import React, { useEffect } from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme';
import { SHEET_TIMING } from '../lib/motion';

const CLOSED_Y = 900; // 大於任何面板高度即可（關閉時移出畫面）

export function BottomSheet({
  open,
  onClose,
  children,
  maxHeight = '80%',
  /** 額外向上位移（例如鍵盤高度） */
  liftBy = 0,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: number | `${number}%`;
  liftBy?: number;
}) {
  const theme = useAppTheme();
  const ty = useSharedValue(CLOSED_Y);
  const drag = useSharedValue(0);

  useEffect(() => {
    ty.value = open ? withTiming(0, SHEET_TIMING) : CLOSED_Y;
    if (open) drag.value = 0;
  }, [open, ty, drag]);

  const close = () => {
    // 先滑出再通知關閉，避免內容瞬間消失
    ty.value = withTiming(CLOSED_Y, { duration: 200 }, (done) => {
      if (done) runOnJS(onClose)();
    });
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // 只允許往下拖；往上加阻尼（橡皮筋）
      drag.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15;
    })
    .onEnd((e) => {
      const shouldClose = drag.value > 110 || e.velocityY > 900;
      if (shouldClose) {
        drag.value = 0;
        ty.value = withTiming(CLOSED_Y, { duration: 200 }, (done) => {
          if (done) runOnJS(onClose)();
        });
      } else {
        drag.value = withTiming(0, { duration: 180 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value + drag.value - liftBy }],
  }));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,15,22,0.5)' }]} onPress={close} />
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              overflow: 'hidden',
              backgroundColor: theme.dark ? theme.colors.elevation.level2 : theme.colors.surface,
            },
            sheetStyle,
          ]}
        >
          {/* 把手：拖曳區（下拉關閉） */}
          <GestureDetector gesture={pan}>
            <View style={{ paddingTop: 10, paddingBottom: 6, alignItems: 'center' }}>
              <View style={{ width: 44, height: 4.5, borderRadius: 3, backgroundColor: theme.colors.outlineVariant }} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
