/**
 * 自備 Gemini 金鑰 — App 端保管（storage = 'local' 時使用）
 *
 * 選擇「僅存於本機裝置」的校外使用者，完整金鑰只寫入 expo-secure-store
 * （iOS Keychain / Android Keystore），伺服器僅保存遮罩提示；
 * 每次呼叫 AI 相關 API 時由 App 以標頭附帶。
 */
import * as SecureStore from 'expo-secure-store';
import { GEMINI_KEY_HEADER, normalizeGeminiKey } from '@ncue/core';

const STORE_KEY = 'ncue_gemini_key_v1';

/** 取出本機金鑰（沒有則回空字串） */
export async function getLocalGeminiKey(): Promise<string> {
  try {
    return normalizeGeminiKey(await SecureStore.getItemAsync(STORE_KEY));
  } catch {
    return '';
  }
}

export async function setLocalGeminiKey(key: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORE_KEY, normalizeGeminiKey(key));
  } catch (e: any) {
    console.warn('[AIKey] 無法寫入本機金鑰：', e?.message);
  }
}

export async function clearLocalGeminiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORE_KEY);
  } catch {
    /* 忽略 */
  }
}

/** AI 相關請求要附帶的標頭（沒有本機金鑰時回空物件） */
export async function aiKeyHeaders(): Promise<Record<string, string>> {
  const key = await getLocalGeminiKey();
  return key ? { [GEMINI_KEY_HEADER]: key } : {};
}
