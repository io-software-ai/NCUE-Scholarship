"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AI_STUDIO_KEY_URL } from '@ncue/core';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/authFetch';
import { clearLocalGeminiKey, getLocalGeminiKey } from '@/lib/aiKeyClient';
import GeminiKeyForm from '@/components/ai-key/GeminiKeyForm';
import ConfirmByTypingModal from '@/components/ui/ConfirmByTypingModal';
import { AlertCircle, ArrowUpRight, Cloud, KeyRound, Laptop, Loader2, RefreshCw, Trash2 } from 'lucide-react';

/**
 * 自備 Gemini 金鑰管理（校外使用者）
 *
 * - 顯示目前儲存位置與遮罩提示（完整金鑰不會回傳前端）
 * - 更換金鑰 / 改變儲存位置（本機 ↔ 雲端）
 * - 清除金鑰：校外帳號的所有功能都以金鑰為前提，清除等同放棄帳號，
 *   因此明確告知「將同時註銷帳號」，並要求打字確認。
 */
export default function AiKeyCard({ showToast }) {
    const router = useRouter();
    const { accountStatus, needsLocalKey, refreshUserData, signOut } = useAuth();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [clearing, setClearing] = useState(false);

    const loadStatus = useCallback(async () => {
        try {
            const res = await authFetch('/api/users/ai-key');
            const data = await res.json();
            if (data?.success) setStatus(data.status);
        } catch { /* 靜默：卡片改以 accountStatus 顯示 */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    if (!accountStatus?.isExternal) return null;

    const keyStorage = status?.keyStorage || accountStatus.keyStorage;
    const keyHint = status?.keyHint || accountStatus.keyHint;
    const missingOnThisDevice = needsLocalKey || (keyStorage === 'local' && !getLocalGeminiKey());

    const handleSaved = async (nextStatus, message) => {
        setStatus(nextStatus);
        setEditing(false);
        await refreshUserData?.();
        showToast?.(message || '金鑰已更新', 'success');
    };

    const handleClear = async () => {
        setClearing(true);
        try {
            const res = await authFetch('/api/users/ai-key', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: true }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '清除失敗，請稍後再試');
            clearLocalGeminiKey();
            showToast?.('已清除金鑰並註銷帳號', 'success');
            setConfirmOpen(false);
            await signOut?.();
            router.push('/');
        } catch (e) {
            showToast?.(e.message, 'error');
            setClearing(false);
        }
    };

    return (
        <>
            <div className="bg-surface rounded-xl border border-line overflow-hidden">
                <div className="px-5 sm:px-6 py-4 border-b border-line">
                    <h3 className="text-base font-bold text-ink flex items-center gap-2.5">
                        <span className="p-1.5 bg-primary-tint rounded-lg"><KeyRound className="h-4 w-4 text-primary" /></span>
                        AI 金鑰（校外使用者）
                    </h3>
                    <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">
                        你的帳號以自備的 Gemini 金鑰使用 AI 功能，用量與費用計入你自己的 Google 帳號。
                    </p>
                </div>

                <div className="px-5 sm:px-6 py-5 space-y-4">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-ink-soft">
                            <Loader2 className="h-4 w-4 animate-spin" />讀取金鑰狀態…
                        </div>
                    ) : (
                        <>
                            {missingOnThisDevice && (
                                <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-[13px] text-warn">
                                    <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                                    <p className="font-medium leading-relaxed">
                                        這台裝置找不到你的金鑰（金鑰只存在原本輸入的裝置）。請在下方重新輸入金鑰，或改選「存於雲端帳號」，換裝置就不必再輸入。
                                    </p>
                                </div>
                            )}

                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <dt className="text-xs font-medium text-ink-soft">儲存位置</dt>
                                    <dd className="mt-1 flex items-center gap-1.5 text-sm text-ink font-semibold">
                                        {keyStorage === 'server'
                                            ? <><Cloud size={14} className="text-primary" />雲端帳號（加密儲存）</>
                                            : <><Laptop size={14} className="text-primary" />僅這台裝置</>}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-ink-soft">金鑰</dt>
                                    <dd className="mt-1 text-sm text-ink font-mono" translate="no">{keyHint || '••••'}</dd>
                                </div>
                                {status?.keyUpdatedAt && (
                                    <div>
                                        <dt className="text-xs font-medium text-ink-soft">最後更新</dt>
                                        <dd className="mt-1 text-sm text-ink">
                                            {new Date(status.keyUpdatedAt).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}
                                        </dd>
                                    </div>
                                )}
                            </dl>

                            {editing ? (
                                <div className="pt-1">
                                    <GeminiKeyForm
                                        onSaved={handleSaved}
                                        defaultStorage={keyStorage || 'server'}
                                        submitLabel="驗證並更新金鑰"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setEditing(false)}
                                        className="mt-2 w-full py-2 text-[13px] font-semibold text-ink-soft hover:text-ink transition-colors"
                                    >
                                        取消
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditing(true)}
                                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary border border-primary/40 rounded-lg hover:bg-primary-tint transition-colors duration-150"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        更換金鑰 / 變更儲存位置
                                    </button>
                                    <a
                                        href={AI_STUDIO_KEY_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-ink-soft border border-line rounded-lg hover:text-ink hover:bg-surface-hover transition-colors duration-150"
                                    >
                                        Google AI Studio
                                        <ArrowUpRight className="h-4 w-4" />
                                    </a>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-5 sm:px-6 py-5 border-t border-danger/30 bg-danger/[0.04]">
                    <h4 className="text-danger font-bold text-sm flex items-center gap-2 mb-2">
                        <Trash2 className="h-4 w-4" />清除金鑰
                    </h4>
                    <p className="text-[13px] text-ink-soft mb-4 leading-relaxed">
                        校外帳號的所有功能都以你的金鑰為前提，因此
                        <strong className="text-danger">清除金鑰將同時自動註銷帳號</strong>
                        ，個人資料、對話紀錄與訂閱都會一併刪除，且無法復原。
                    </p>
                    <button
                        type="button"
                        onClick={() => setConfirmOpen(true)}
                        className="px-4 py-2 text-sm font-semibold text-danger border border-danger/40 rounded-lg hover:bg-danger/10 transition-colors duration-150"
                    >
                        清除金鑰並註銷帳號
                    </button>
                </div>
            </div>

            <ConfirmByTypingModal
                isOpen={confirmOpen}
                title="清除金鑰並註銷帳號？"
                description="金鑰將從平台移除，帳號會同時註銷：個人資料、AI 對話紀錄與訂閱都會永久刪除，且無法復原。你在 Google AI Studio 的金鑰本身不會被刪除，可自行前往撤銷。"
                keyword="清除金鑰"
                confirmLabel="清除並註銷"
                isBusy={clearing}
                onConfirm={handleClear}
                onClose={() => !clearing && setConfirmOpen(false)}
            />
        </>
    );
}
