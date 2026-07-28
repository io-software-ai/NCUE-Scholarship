"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authFetch } from '@/lib/authFetch';
import { deriveStudentIdFromEmail } from '@/lib/studentId';
import GeminiKeyForm from '@/components/ai-key/GeminiKeyForm';
import { Loader2, AlertCircle, LogOut, ShieldCheck, Mail, KeyRound, GraduationCap, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 身分驗證（初次登入強制）
 *
 * 登入一律走 Google OAuth，之後依身分分流：
 * - 彰師大學生：以 @mail.ncue.edu.tw / @gm.ncue.edu.tw 登入自動通過（學號由信箱推導）；
 *   用其他信箱登入者，在此輸入學校信箱收 6 位數驗證碼綁定學號。
 * - 校外使用者：沒有學校信箱，改為自備 Google AI Studio 的 Gemini 金鑰完成註冊，
 *   AI 功能一律以其本人的金鑰呼叫（用量與費用歸使用者本人）。
 */
export default function ProfileCompletionModal() {
    const { user, needsProfileCompletion, signOut, refreshUserData } = useAuth();

    const [step, setStep] = useState('choose'); // choose | school | byok
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

    const goChoose = () => {
        setStep('choose');
        setErrorMessage('');
        setCodeSent(false);
        setCode('');
    };

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

    const handleKeySaved = async () => {
        await refreshUserData?.();
        window.location.reload();
    };

    const heading = step === 'school' ? '彰師大學生驗證' : step === 'byok' ? '校外使用者註冊' : '選擇你的身分';
    const subheading = step === 'school'
        ? '輸入你的學校信箱收取 6 位數驗證碼，驗證後自動綁定學號（教職員信箱則綁定信箱帳號）。'
        : step === 'byok'
            ? '提供自己的 Gemini 金鑰即可完成註冊，功能與校內使用者相同。'
            : '平台同時開放彰師大學生與校外使用者，請先選擇你的身分。';

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
                    className="bg-surface rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden relative z-10 select-none my-auto"
                >
                    {/* 內容區可獨立捲動：金鑰設定步驟較長，避免在小視窗撐破畫面 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-7 pt-7 sm:pt-8">
                        <div className="text-center mb-5 sm:mb-6">
                            <div className="inline-flex items-center justify-center w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-primary-tint text-primary mb-3">
                                {step === 'byok'
                                    ? <Globe className="w-5 h-5 sm:w-7 sm:h-7" />
                                    : <ShieldCheck className="w-5 h-5 sm:w-7 sm:h-7" />}
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black text-ink tracking-tight">{heading}</h2>
                            <p className="text-ink-soft text-[12.5px] sm:text-sm mt-1.5 font-medium px-2 leading-relaxed">
                                {subheading}
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

                            {/* ── 身分分流 ── */}
                            {step === 'choose' && (
                                <div className="space-y-3">
                                    <IdentityOption
                                        icon={GraduationCap}
                                        title="我是彰師大學生"
                                        description="以學校信箱（@mail.ncue.edu.tw／@gm.ncue.edu.tw）收驗證碼綁定學號，AI 功能由平台提供。"
                                        onSelect={() => { setStep('school'); setErrorMessage(''); }}
                                    />
                                    <IdentityOption
                                        icon={Globe}
                                        title="我不是彰師大學生"
                                        description="自備 Google AI Studio 的 Gemini 金鑰即可註冊，同樣能使用 AI 助理、公告訂閱等完整功能。"
                                        onSelect={() => { setStep('byok'); setErrorMessage(''); }}
                                    />
                                </div>
                            )}

                            {/* ── 彰師大學生：校信箱驗證碼 ── */}
                            {step === 'school' && (!codeSent ? (
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
                            ))}

                            {/* ── 校外使用者：自備 Gemini 金鑰 ── */}
                            {step === 'byok' && (
                                <GeminiKeyForm onSaved={handleKeySaved} submitLabel="驗證金鑰，完成註冊" />
                            )}

                            {/* 返回與登出併為一列，省下一整行高度 */}
                            <div className="flex items-center justify-center gap-3 pt-1 text-[13px] font-semibold">
                                {step !== 'choose' && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={goChoose}
                                            className="flex items-center gap-1 py-1.5 text-ink-soft transition-colors hover:text-primary"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            重新選擇身分
                                        </button>
                                        <span className="text-line" aria-hidden="true">|</span>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => signOut()}
                                    className="flex items-center gap-1.5 py-1.5 text-ink-soft/60 transition-colors hover:text-danger"
                                >
                                    <LogOut className="w-4 h-4" />
                                    登出
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="shrink-0 bg-page px-5 py-3 sm:px-6 sm:py-3.5 border-t border-line">
                        <div className="flex gap-2.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-ink-soft/60 shrink-0 mt-0.5" />
                            <p className="text-[10.5px] text-ink-soft/60 leading-relaxed font-medium">
                                {step === 'byok'
                                    ? '校外帳號沒有學號，AI 一律以你提供的金鑰呼叫，可隨時在「個資管理」更換或清除。'
                                    : '驗證僅用於確認在學身分並綁定學號，資料依平台隱私權政策保護。若以學校 Google 帳號登入則自動通過驗證。'}
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

function IdentityOption({ icon: Icon, title, description, onSelect }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className="group w-full flex items-start gap-3.5 p-4 rounded-2xl border border-line bg-page/60 hover:border-primary hover:bg-primary-tint/40 transition-colors text-left"
        >
            <span className="mt-0.5 p-2 rounded-xl bg-surface text-primary border border-line group-hover:border-primary/30">
                <Icon size={17} />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-bold text-ink">{title}</span>
                <span className="block mt-1 text-[12.5px] text-ink-soft leading-relaxed">{description}</span>
            </span>
            <ChevronRight size={16} className="mt-1 text-ink-soft/50 group-hover:text-primary transition-colors" />
        </button>
    );
}
