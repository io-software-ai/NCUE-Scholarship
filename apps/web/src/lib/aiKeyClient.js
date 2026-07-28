/**
 * 自備 Gemini 金鑰 — 瀏覽器端保管（storage = 'local' 時使用）
 *
 * 選擇「僅存於本機裝置」的使用者，完整金鑰只留在這台瀏覽器的 localStorage，
 * 伺服器僅保存遮罩提示。每次呼叫 AI 相關 API 時由前端以標頭附帶。
 */

import { GEMINI_KEY_HEADER, normalizeGeminiKey } from '@ncue/core';

const STORAGE_KEY = 'ncue.gemini_key.v1';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

/** 取出本機金鑰（沒有則回空字串） */
export function getLocalGeminiKey() {
    if (!canUseStorage()) return '';
    try {
        return normalizeGeminiKey(window.localStorage.getItem(STORAGE_KEY));
    } catch {
        return '';
    }
}

export function setLocalGeminiKey(key) {
    if (!canUseStorage()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, normalizeGeminiKey(key));
    } catch (e) {
        console.warn('[AIKey] 無法寫入本機金鑰：', e.message);
    }
}

export function clearLocalGeminiKey() {
    if (!canUseStorage()) return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* 忽略 */ }
}

/** AI 相關請求要附帶的標頭（沒有本機金鑰時回空物件） */
export function aiKeyHeaders() {
    const key = getLocalGeminiKey();
    return key ? { [GEMINI_KEY_HEADER]: key } : {};
}
