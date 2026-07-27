/**
 * 深連結接口：https://<site>/profile（LINE 綁定驗證碼訊息附的連結）
 * 網頁版的「個資管理」對應 App 的「設定」分頁 → 直接導到該分頁，使用者不必離開 App。
 * ts 帶時間戳，讓分頁器每次都視為新的一次導頁（重複點同一個連結也會生效）。
 */
import React from 'react';
import { Redirect } from 'expo-router';

export default function ProfileDeepLink() {
  return <Redirect href={{ pathname: '/', params: { tab: 'profile', ts: String(Date.now()) } }} />;
}
