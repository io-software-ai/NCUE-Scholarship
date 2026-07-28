/**
 * 自備 Gemini 金鑰（BYOK）與帳號身分別（單一來源，web 與 App 共用）
 *
 * 平台開放兩種身分：
 * - 彰師大學生（ncue）：以學校信箱驗證取得學號，AI 使用平台金鑰。
 * - 校外使用者（external）：無學號，必須自備 Google AI Studio 的 Gemini 金鑰，
 *   AI 相關功能一律以「自己的金鑰」呼叫，額度與費用歸使用者本人。
 *
 * 金鑰儲存位置由使用者自選：
 * - local ：只存在本機（瀏覽器 localStorage / App SecureStore），每次請求由前端附帶，
 *           伺服器僅記錄遮罩提示，不留完整金鑰。換裝置需重新輸入。
 * - server：以 AES-256-GCM 加密後存於資料庫，任何裝置登入即可用，
 *           且 LINE 官方帳號等伺服器端主動流程也能替使用者呼叫 AI。
 */

import { deriveStudentIdFromEmail } from './studentId';

/** 取得金鑰的官方頁面（指引使用者前往申請） */
export const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';

/** 帶自備金鑰的請求標頭（local 儲存模式使用） */
export const GEMINI_KEY_HEADER = 'x-gemini-api-key';

export const ACCOUNT_TYPES = ['ncue', 'external'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const KEY_STORAGES = ['local', 'server'] as const;
export type KeyStorage = (typeof KEY_STORAGES)[number];

/** 去除貼上時常見的空白、引號與換行 */
export function normalizeGeminiKey(raw: unknown): string {
    return String(raw ?? '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

/**
 * 粗略檢查貼進來的字串像不像一把金鑰。
 *
 * 刻意不綁定前綴：Google 自 2026 年起，AI Studio 新建的是 `AQ.Ab…` 開頭的授權金鑰
 * （舊的 `AIza…` standard key 預計 2026-09 停用），官方文件亦未承諾金鑰格式。
 * 因此這裡只擋明顯的貼錯（空字串、含空白、貼到網址、長度過短），
 * 金鑰是否真的可用一律由伺服器實際呼叫一次 Gemini 判定。
 */
export function isLikelyGeminiKey(raw: unknown): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{19,255}$/.test(normalizeGeminiKey(raw));
}

/** 遮罩顯示用提示（例：AQ.A••••CIIA）；金鑰本身不回傳給前端 */
export function maskGeminiKey(raw: unknown): string {
    const key = normalizeGeminiKey(raw);
    if (key.length < 12) return '••••';
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export interface AiKeyProfileFields {
    student_id?: string | null;
    account_type?: string | null;
    gemini_key_storage?: string | null;
    gemini_key_hint?: string | null;
    [key: string]: any;
}

export interface AccountStatus {
    /** 'ncue'（彰師大學生）或 'external'（校外自備金鑰） */
    accountType: AccountType;
    isExternal: boolean;
    /** 學號（校內信箱推導或驗證綁定），校外使用者為 null */
    studentId: string | null;
    keyStorage: KeyStorage | null;
    keyHint: string | null;
    /** 已完成身分設定，可使用平台完整功能 */
    verified: boolean;
    /** 尚未選擇身分別／尚未完成任一種驗證 */
    needsSetup: boolean;
}

/**
 * 由 profile + 登入信箱推導帳號狀態（網頁與 App 的閘門共用同一套判斷）。
 *
 * 通過條件（二擇一）：
 * 1. 有學號（校內信箱自動推導，或以學校信箱驗證碼綁定）
 * 2. 身分為 external 且已登記自備金鑰（本機或雲端）
 */
export function resolveAccountStatus({
    profile,
    email,
}: {
    profile?: AiKeyProfileFields | null;
    email?: string | null;
}): AccountStatus {
    const studentId = profile?.student_id || deriveStudentIdFromEmail(email ?? '');
    const accountType: AccountType = profile?.account_type === 'external' ? 'external' : 'ncue';
    const rawStorage = profile?.gemini_key_storage;
    const keyStorage = (KEY_STORAGES as readonly string[]).includes(String(rawStorage))
        ? (rawStorage as KeyStorage)
        : null;
    const isExternal = accountType === 'external';
    const verified = !!studentId || (isExternal && !!keyStorage);

    return {
        accountType,
        isExternal,
        studentId: studentId || null,
        keyStorage,
        keyHint: profile?.gemini_key_hint || null,
        verified,
        needsSetup: !verified,
    };
}

/**
 * 這台裝置是否需要（重新）輸入金鑰：
 * 帳號登記為 local 儲存，但本機找不到金鑰（換裝置、清過瀏覽器資料）。
 */
export function needsLocalKeyOnThisDevice(status: AccountStatus, localKey?: string | null): boolean {
    return status.isExternal && status.keyStorage === 'local' && !normalizeGeminiKey(localKey);
}
