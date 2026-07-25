"use client";

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { MessageCircle, Loader2, CheckCircle2, Unlink, KeyRound, ExternalLink } from 'lucide-react';
import { siteConfig } from '@/lib/siteConfig';

/**
 * LINE 帳號綁定卡片（個資頁）
 * 兩種綁定方式：LINE Login OAuth（一鍵）或驗證碼手動綁定
 * 綁定後 AI 獎學金助理將跨渠道同步 LINE 與網頁對話上下文。
 */
export default function LineBindingCard({ showToast }) {
    const confirm = useConfirm();
    const [binding, setBinding] = useState(null);
    const [oauthAvailable, setOauthAvailable] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isBusy, setIsBusy] = useState(false);
    const [codeInput, setCodeInput] = useState('');

    const notify = useCallback((message, type) => {
        if (showToast) showToast(message, type);
    }, [showToast]);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await authFetch('/api/line/link');
            const data = await res.json();
            if (data.success) {
                setBinding(data.binding);
                setOauthAvailable(data.oauthAvailable);
            }
        } catch (e) { /* 靜默 */ }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    // OAuth 回跳結果提示
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const result = params.get('line');
        if (!result) return;
        if (result === 'linked') notify('LINE 帳號綁定成功！AI 助理將同步您的跨渠道對話。', 'success');
        else notify('LINE 綁定失敗，請重試或改用驗證碼綁定', 'error');
        params.delete('line'); params.delete('reason');
        window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
        fetchStatus();
    }, [fetchStatus, notify]);

    const handleOauth = async () => {
        setIsBusy(true);
        try {
            const res = await authFetch('/api/line/link/start');
            const data = await res.json();
            if (!res.ok || !data.url) throw new Error(data.error || '無法啟動 LINE 綁定');
            window.location.href = data.url;
        } catch (e) {
            notify(e.message, 'error');
            setIsBusy(false);
        }
    };

    const handleCodeSubmit = async () => {
        if (!/^\d{6}$/.test(codeInput.trim())) { notify('請輸入 6 位數驗證碼', 'error'); return; }
        setIsBusy(true);
        try {
            const res = await authFetch('/api/line/link/code', {
                method: 'POST',
                body: JSON.stringify({ code: codeInput.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '綁定失敗');
            setCodeInput('');
            notify('LINE 帳號綁定成功！AI 助理將同步您的跨渠道對話。', 'success');
            await fetchStatus();
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setIsBusy(false);
        }
    };

    const handleUnbind = async () => {
        if (!(await confirm({ title: '解除 LINE 綁定', message: 'AI 助理將不再同步您的 LINE 對話。', variant: 'danger', confirmLabel: '解除綁定' }))) return;
        setIsBusy(true);
        try {
            const res = await authFetch('/api/line/link', { method: 'DELETE' });
            if (!res.ok) throw new Error('解除綁定失敗');
            setBinding(null);
            notify('已解除 LINE 綁定', 'success');
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className="p-6 border-t border-line">
            <h3 className="text-lg font-semibold text-ink mb-1.5 flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-[#06C755]" />LINE 帳號綁定
            </h3>
            <p className="text-xs text-ink-soft leading-relaxed mb-4">
                綁定後，AI 獎學金助理會同步您在 LINE 官方帳號與網頁的對話紀錄，提供連續的諮詢體驗。
            </p>

            {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-ink-soft py-2"><Loader2 size={15} className="animate-spin" />載入中...</div>
            ) : binding ? (
                <div className="flex items-center gap-3">
                    {binding.pictureUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={binding.pictureUrl} alt="" className="w-9 h-9 rounded-full border border-line" />
                    ) : (
                        <span className="w-9 h-9 rounded-full bg-ok/10 text-ok flex items-center justify-center"><CheckCircle2 size={18} /></span>
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">已綁定：{binding.displayName || 'LINE 帳號'}</p>
                        <p className="text-[11px] text-ok flex items-center gap-1"><CheckCircle2 size={11} />對話同步已啟用</p>
                    </div>
                    <button onClick={handleUnbind} disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line-strong text-xs font-medium text-ink-soft hover:text-danger hover:border-danger/40 hover:bg-danger/10 transition-colors duration-150 disabled:opacity-50">
                        <Unlink size={13} />解除綁定
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {oauthAvailable && (
                        <button onClick={handleOauth} disabled={isBusy}
                            className="w-full flex items-center justify-center gap-2.5 h-11 rounded-lg bg-[#06C755] text-white text-sm font-semibold hover:brightness-105 active:scale-[0.98] transition-[filter,transform] duration-150 disabled:opacity-60">
                            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                            使用 LINE 帳號一鍵綁定
                        </button>
                    )}
                    <div>
                        <p className="text-[11.5px] font-semibold tracking-wide text-ink-soft mb-1.5 flex items-center gap-1.5">
                            <KeyRound size={12} />{oauthAvailable ? '或使用驗證碼綁定' : '驗證碼綁定'}
                        </p>
                        <p className="text-[11.5px] text-ink-soft leading-relaxed mb-2">
                            到本平台的{' '}
                            <a href={siteConfig.links.lineOfficialAdd} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-primary font-semibold hover:underline underline-offset-2">
                                LINE 獎學金助理<ExternalLink size={11} aria-hidden="true" />
                            </a>
                            {' '}輸入「<b className="text-ink">帳號綁定</b>」（或點選聊天室底部選單的「帳號綁定」），將收到 6 位數驗證碼（10 分鐘內有效），輸入於下方即可完成。
                        </p>
                        <div className="flex gap-2">
                            <input
                                value={codeInput}
                                onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric" placeholder="6 位數驗證碼" aria-label="LINE 綁定驗證碼"
                                className="flex-1 bg-surface text-ink border border-line-strong rounded-lg px-3.5 py-2 text-sm tracking-[0.2em] tabular-nums focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-150"
                            />
                            <button onClick={handleCodeSubmit} disabled={isBusy || codeInput.length !== 6}
                                className="px-4 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50">
                                {isBusy ? <Loader2 size={14} className="animate-spin" /> : '綁定'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
