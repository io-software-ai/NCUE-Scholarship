/**
 * (tabs) 群組只剩單一路由 index（自訂左右換頁分頁器）。
 * 分頁切換、底部導覽、TabBarProvider 皆由 index.tsx 的分頁器處理，這裡只需渲染它。
 */
import React from 'react';
import { Slot } from 'expo-router';

export default function TabsLayout() {
  return <Slot />;
}
