"use client";

import { useEffect, useState } from 'react';
import { AI_STUDIO_KEY_URL, isLikelyGeminiKey, normalizeGeminiKey } from '@ncue/core';
import { authFetch } from '@/lib/authFetch';
import { clearLocalGeminiKey, setLocalGeminiKey } from '@/lib/aiKeyClient';
import { AlertCircle, ArrowUpRight, Cloud, Eye, EyeOff, KeyRound, Laptop, Loader2, ShieldCheck } from 'lucide-react';

/**
 * 自備 Gemini 金鑰的設定表單（校外使用者）
 *
 * 兩處共用：
 * - 註冊閘門（ProfileCompletionModal）：首次設定，成功後即完成校外身分註冊
 * - 個資管理（帳號安全）：更換金鑰或改變儲存位置
 *
 * 儲存位置由使用者決定：'local' 只寫入這台裝置的 localStorage（伺服器僅留遮罩提示）、
 * 'server' 則由伺服器加密後存於帳號，任何裝置與 LINE 都能使用。
 * 版面刻意壓縮：此表單會出現在強制顯示的註冊閘門內，過長會撐破視窗。
 */

const STORAGE_HINT = {
    server: '加密後存在平台，換裝置登入即可使用，LINE 官方帳號的 AI 回覆也能運作。',
    local: '金鑰只留在這台瀏覽器，平台僅保存末四碼提示；換裝置需重新輸入，LINE 無法代為呼叫 AI。',
};

export default function GeminiKeyForm({ onSaved, defaultStorage = 'server', submitLabel = '驗證並啟用' }) {
    const [key, setKey] = useState('');
    const [storage, setStorage] = useState(defaultStorage);
    const [showKey, setShowKey] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [serverStorageAvailable, setServerStorageAvailable] = useState(true);

    useEffect(() => {
        // 伺服器未設定加密密鑰時，不提供「存於雲端」選項（避免使用者選了才失敗）
        authFetch('/api/users/ai-key')
            .then(r => r.json())
            .then(d => {
                if (d?.serverStorageAvailable === false) {
                    setServerStorageAvailable(false);
                    setStorage('local');
                }
            })
            .catch(() => {});
    }, []);

    const handleSubmit = async () => {
        const normalized = normalizeGeminiKey(key);
        setError('');
        if (!isLikelyGeminiKey(normalized)) {
            setError('金鑰格式看起來不對，請確認已完整複製 Google AI Studio 產生的金鑰（勿含空白或換行）。');
            return;
        }

        setBusy(true);
        try {
            const res = await authFetch('/api/users/ai-key', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: normalized, storage }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '設定失敗，請稍後再試');

            // 本機模式才把金鑰留在這台裝置；改為雲端時清掉本機殘留，避免兩份不同步
            if (storage === 'local') setLocalGeminiKey(normalized);
            else clearLocalGeminiKey();

            setKey('');
            onSaved?.(data.status, data.message);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            {/* 取得金鑰的指引 */}
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-page/60 px-3.5 py-3">
                <KeyRound size={14} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-[12.5px] leading-relaxed text-ink-soft">
                    還沒有金鑰？到 Google AI Studio 點「Create API key」建立（個人使用有免費額度），把產生的金鑰完整複製貼到下方。
                    <a
                        href={AI_STUDIO_KEY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
                    >
                        開啟金鑰頁面<ArrowUpRight size={13} />
                    </a>
                </p>
            </div>

            {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/10 p-3 text-[13px] text-danger">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="font-medium leading-snug">{error}</p>
                </div>
            )}

            {/* 金鑰輸入 */}
            <div className="relative">
                <input
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !busy && handleSubmit()}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="貼上 Gemini API 金鑰"
                    aria-label="Gemini API 金鑰"
                    className="w-full rounded-xl border border-line bg-page px-4 py-3 pr-11 font-mono text-sm text-ink outline-none transition-all focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/10"
                />
                <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    aria-label={showKey ? '隱藏金鑰' : '顯示金鑰'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-soft/60 transition-colors hover:text-ink"
                >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>

            {/* 儲存位置：兩顆並排，說明只顯示目前選項的一行 */}
            <div>
                <div className="grid grid-cols-2 gap-2">
                    <StorageChip
                        active={storage === 'server'}
                        disabled={!serverStorageAvailable}
                        icon={Cloud}
                        label="存於雲端帳號"
                        badge="建議"
                        onSelect={() => setStorage('server')}
                    />
                    <StorageChip
                        active={storage === 'local'}
                        icon={Laptop}
                        label="僅存這台裝置"
                        onSelect={() => setStorage('local')}
                    />
                </div>
                <p className="mt-2 px-0.5 text-[11.5px] leading-relaxed text-ink-soft">
                    {!serverStorageAvailable && '此平台尚未啟用雲端加密儲存。'}
                    {STORAGE_HINT[storage]}
                </p>
            </div>

            <button
                type="button"
                onClick={handleSubmit}
                disabled={busy || !key.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-primary-hover disabled:opacity-60 dark:text-[#10151B]"
            >
                {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <ShieldCheck className="h-4.5 w-4.5" />}
                {busy ? '正在驗證金鑰…' : submitLabel}
            </button>

            <p className="px-0.5 text-[11px] leading-relaxed text-ink-soft/70">
                金鑰僅用於代你呼叫 Gemini，用量與費用計入你自己的 Google 帳號；平台不會顯示或轉交完整金鑰，可隨時更換或清除。
            </p>
        </div>
    );
}

function StorageChip({ active, disabled, icon: Icon, label, badge, onSelect }) {
    return (
        <button
            type="button"
            onClick={disabled ? undefined : onSelect}
            disabled={disabled}
            aria-pressed={active}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active ? 'border-primary bg-primary-tint/60' : 'border-line bg-surface hover:bg-surface-hover'
            } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
        >
            <Icon size={15} className={active ? 'text-primary' : 'text-ink-soft'} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{label}</span>
            {badge && !active && <span className="shrink-0 text-[10px] font-semibold text-ink-soft/60">{badge}</span>}
        </button>
    );
}
