"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authFetch } from '@/lib/authFetch';
import { deriveStudentIdFromEmail } from '@/lib/studentId';
import { Loader2, AlertCircle, LogOut, ShieldCheck, Mail, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 校園身分驗證（初次登入強制）
 *
 * 登入一律走 Google OAuth；但首次登入須通過學校信箱驗證才可使用平台：
 * - 以 @mail.ncue.edu.tw / @gm.ncue.edu.tw 的 Google 帳號登入 → 自動通過（學號由信箱推導）
 * - 以其他信箱登入 → 於此輸入學校信箱收取 6 位數驗證碼完成綁定
 */
export default function ProfileCompletionModal() {
    const { user, needsProfileCompletion, signOut, refreshUserData } = useAuth();

    const [schoolEmail, setSchoolEmail] = useState('');
    const [code, setCode] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (needsProfileCompletion) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => document.body.classList.remove('modal-open');
    }, [needsProfileCompletion]);

    if (!needsProfileCompletion) return null;

    const handleSend = async () => {
        setErrorMessage('');
        if (!deriveStudentIdFromEmail(schoolEmail)) {
            setErrorMessage('請輸入正確的學校信箱（帳號@mail.ncue.edu.tw 或 @gm.ncue.edu.tw）');
            return;
        }
        setIsBusy(true);
        try {
            const res = await authFetch('/api/verify-school-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send', email: schoolEmail }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '寄送失敗，請稍後再試');
            setCodeSent(true);
        } catch (e) {
            setErrorMessage(e.message);
        } finally {
            setIsBusy(false);
        }
    };

    const handleConfirm = async () => {
        setErrorMessage('');
        setIsBusy(true);
        try {
            const res = await authFetch('/api/verify-school-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'confirm', code }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '驗證失敗');
            await refreshUserData?.();
            window.location.reload();
        } catch (e) {
            setErrorMessage(e.message);
            setIsBusy(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[2000] flex items-start md:items-center justify-center p-4 overflow-y-auto pt-6 md:pt-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
                />

                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    className="bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative z-10 select-none my-auto"
                >
                    <div className="p-5 sm:p-8 pt-8 sm:pt-10">
                        <div className="text-center mb-6 sm:mb-8">
                            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary-tint text-primary mb-3 sm:mb-4">
                                <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black text-ink tracking-tight">校園身分驗證</h2>
                            <p className="text-ink-soft text-xs sm:text-sm mt-1.5 sm:mt-2 font-medium px-2 leading-relaxed">
                                初次登入需驗證您的學校信箱（@mail.ncue.edu.tw 或 @gm.ncue.edu.tw），驗證後即可使用平台完整功能，學號將自動綁定。
                            </p>
                        </div>

                        <div className="space-y-4">
                            {errorMessage && (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-start gap-3 p-3 sm:p-4 bg-danger/10 text-danger rounded-2xl border border-danger/20 text-sm"
                                >
                                    <AlertCircle className="h-5 w-5 shrink-0" />
                                    <p className="font-medium leading-tight">{errorMessage}</p>
                                </motion.div>
                            )}

                            {!codeSent ? (
                                <div className="space-y-1.5 sm:space-y-2">
                                    <label className="text-[10px] sm:text-xs font-bold text-ink-soft uppercase tracking-widest flex items-center gap-2 ml-1">
                                        <Mail className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                                        學校信箱
                                    </label>
                                    <input
                                        type="email"
                                        value={schoolEmail}
                                        onChange={(e) => setSchoolEmail(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                        className="w-full px-4 sm:px-5 py-3 sm:py-4 rounded-2xl border border-line bg-page focus:bg-surface focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none font-semibold text-ink text-sm sm:text-base"
                                        placeholder="s1234567@mail.ncue.edu.tw"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSend}
                                        disabled={isBusy}
                                        className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 sm:py-4 border border-primary bg-primary hover:bg-primary-hover disabled:opacity-60 text-white dark:text-[#10151B] font-bold rounded-2xl shadow-lg transition-colors text-sm sm:text-base"
                                    >
                                        {isBusy ? <Loader2 className="animate-spin h-5 w-5" /> : <Mail className="h-5 w-5" />}
                                        寄送驗證碼
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-1.5 sm:space-y-2">
                                    <label className="text-[10px] sm:text-xs font-bold text-ink-soft uppercase tracking-widest flex items-center gap-2 ml-1">
                                        <KeyRound className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                                        驗證碼（已寄至 {schoolEmail}）
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleConfirm()}
                                        className="w-full px-4 sm:px-5 py-3 sm:py-4 rounded-2xl border border-line bg-page focus:bg-surface focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none font-bold text-ink text-lg tracking-[0.4em] text-center tabular-nums"
                                        placeholder="──────"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleConfirm}
                                        disabled={isBusy || code.length !== 6}
                                        className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 sm:py-4 border border-primary bg-primary hover:bg-primary-hover disabled:opacity-60 text-white dark:text-[#10151B] font-bold rounded-2xl shadow-lg transition-colors text-sm sm:text-base"
                                    >
                                        {isBusy ? <Loader2 className="animate-spin h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                                        完成驗證，進入平台
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setCodeSent(false); setCode(''); setErrorMessage(''); }}
                                        className="w-full py-1.5 text-[12px] text-ink-soft hover:text-primary font-semibold transition-colors"
                                    >
                                        重新輸入信箱 / 重寄驗證碼
                                    </button>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() => signOut()}
                                className="w-full py-2 text-ink-soft/60 hover:text-danger text-[13px] sm:text-sm font-bold transition-colors flex items-center justify-center gap-2"
                            >
                                <LogOut className="w-4 h-4" />
                                登出
                            </button>
                        </div>
                    </div>

                    <div className="bg-page p-4 sm:p-6 border-t border-line">
                        <div className="flex gap-2 sm:gap-3">
                            <ShieldCheck className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-ink-soft/60 shrink-0 mt-0.5" />
                            <p className="text-[10px] sm:text-[11px] text-ink-soft/60 leading-relaxed font-medium">
                                驗證僅用於確認在學身分並綁定學號，資料依平台隱私權政策保護。若以學校 Google 帳號登入則自動通過驗證。
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
