"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";
import { Loader2, Sparkles, Mail, BellRing } from 'lucide-react';
import Toast from '@/components/ui/Toast';
import logo from "@/app/assets/logo.png";
import { siteConfig } from '@/lib/siteConfig';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const FEATURES = [
    { icon: Sparkles, text: 'AI 獎學金助理：以自然語言詢問公告內容與申請條件' },
    { icon: Mail, text: '一鍵將公告詳情寄送至個人信箱' },
    { icon: BellRing, text: '獎學金截止提醒與即時推播通知' },
];

/**
 * GIS One Tap 需要 nonce 防重放：
 * initialize 用 SHA-256 雜湊值、signInWithIdToken 用原始值。
 */
async function generateNoncePair() {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hashed = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return [raw, hashed];
}

/** 載入 Google Identity Services script（只載一次） */
function loadGisScript() {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const existing = document.getElementById('google-gsi-client');
        if (existing) {
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.id = 'google-gsi-client';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * 登入頁 — Google 單一登入
 * 現代化流程：Google Identity Services 原頁登入（One Tap 浮層 + 官方彈窗按鈕），
 * 未設定 NEXT_PUBLIC_GOOGLE_CLIENT_ID 時自動退回 OAuth 整頁跳轉。
 */
function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { signInWithGoogle, isAuthenticated, loading } = useAuth();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [gisReady, setGisReady] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => setToast({ show: true, message, type });
    const hideToast = () => setToast(prev => ({ ...prev, show: false }));

    const gisButtonRef = useRef(null);
    const nonceRef = useRef(null);

    useEffect(() => {
        if (isAuthenticated) {
            router.push(searchParams.get('redirect') || '/profile');
        }
    }, [isAuthenticated, router, searchParams]);

    // ===== Google Identity Services：One Tap + 原頁彈窗按鈕 =====
    useEffect(() => {
        if (!GOOGLE_CLIENT_ID || isAuthenticated) return;
        let cancelled = false;

        const handleCredential = async (response) => {
            setIsSubmitting(true);
            try {
                const { error } = await supabase.auth.signInWithIdToken({
                    provider: 'google',
                    token: response.credential,
                    nonce: nonceRef.current,
                });
                if (error) throw error;
                // session 建立後由 AuthContext 觸發 isAuthenticated → 自動導向
            } catch (error) {
                console.error('GIS sign-in failed:', error);
                showToast('Google 登入失敗，請改用下方按鈕重試', 'error');
                setIsSubmitting(false);
            }
        };

        const init = async () => {
            try {
                const [rawNonce, hashedNonce] = await generateNoncePair();
                nonceRef.current = rawNonce;
                await loadGisScript();
                if (cancelled || !window.google?.accounts?.id) return;

                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleCredential,
                    nonce: hashedNonce,
                    context: 'signin',
                    ux_mode: 'popup',
                    use_fedcm_for_prompt: true,
                });

                // 官方按鈕：popup 模式，在原頁完成登入
                if (gisButtonRef.current) {
                    gisButtonRef.current.innerHTML = '';
                    window.google.accounts.id.renderButton(gisButtonRef.current, {
                        type: 'standard', theme: 'outline', size: 'large',
                        text: 'continue_with', shape: 'pill', logo_alignment: 'left',
                        width: 336, locale: 'zh_TW',
                    });
                    setGisReady(true);
                }

                // 註：不呼叫 window.google.accounts.id.prompt()。
                // One Tap 浮層在部分瀏覽器（未啟用 FedCM 時）會退回固定於右上角的 iframe，
                // 於較窄視窗會被裁切、其「登入中…」狀態溢出版面（爆版）。
                // 改為僅使用卡片內的官方按鈕（renderButton），登入流程完全相同。
            } catch (e) {
                console.warn('GIS unavailable, falling back to redirect OAuth:', e?.message);
            }
        };

        init();
        return () => {
            cancelled = true;
            window.google?.accounts?.id?.cancel?.();
        };
    }, [isAuthenticated]);

    // 降級路徑：整頁跳轉 OAuth
    const handleRedirectLogin = async () => {
        setIsSubmitting(true);
        try {
            const result = await signInWithGoogle();
            if (!result.success) {
                showToast(result.error || "Google 登入失敗，請稍後再試", 'error');
                setIsSubmitting(false);
            }
        } catch (err) {
            showToast("發生無法預期的錯誤，請稍後再試", 'error');
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={hideToast} />

            <div className="mx-auto w-full max-w-md my-10 sm:my-20 motion-safe:animate-[rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
                <style>{`@keyframes rise{from{opacity:0;transform:translateY(14px)}}`}</style>

                <div className="bg-surface border border-line rounded-2xl px-6 py-10 sm:px-10 select-none">
                    <div className="text-center">
                        <Image src={logo} alt="NCUE Logo" width={64} height={64} className="h-16 w-16 rounded-full mx-auto mb-5" priority />
                        <h1 className="text-2xl font-bold tracking-tight text-ink">登入{siteConfig.shortName}</h1>
                        <p className="mt-2 text-sm leading-6 text-ink-soft text-pretty">
                            使用 Google 帳號一鍵登入或註冊，解鎖完整功能。
                        </p>
                    </div>

                    <div className="mt-8 min-h-12 flex flex-col items-center justify-center">
                        {isSubmitting ? (
                            <div className="flex items-center gap-2.5 h-12 text-ink-soft text-sm">
                                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />登入中…
                            </div>
                        ) : (
                            <>
                                {/* GIS 官方按鈕（原頁彈窗登入） */}
                                <div ref={gisButtonRef} className={gisReady ? 'flex justify-center' : 'hidden'} />

                                {/* 降級：整頁跳轉 OAuth（未設定 Client ID 或 GIS 載入失敗時顯示） */}
                                {!gisReady && (
                                    <button
                                        onClick={handleRedirectLogin}
                                        disabled={loading}
                                        className="flex w-full items-center justify-center gap-3 rounded-full bg-surface h-12 text-base font-semibold text-ink
                                            ring-1 ring-inset ring-line-strong hover:bg-surface-hover hover:ring-primary/60
                                            active:scale-[0.98] transition-[background-color,box-shadow,transform] duration-150
                                            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                                            disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                        </svg>
                                        使用 Google 帳號繼續
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-line">
                        <p className="text-[11.5px] font-semibold tracking-widest text-ink-soft mb-3">登入後即可使用</p>
                        <ul className="space-y-2.5">
                            {FEATURES.map(({ icon: Icon, text }) => (
                                <li key={text} className="flex items-start gap-2.5 text-sm text-ink-soft leading-relaxed">
                                    <Icon size={15} className="text-primary mt-1 flex-shrink-0" aria-hidden="true" />
                                    {text}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <p className="mt-5 text-center text-xs text-ink-soft">
                    登入即表示您同意本平台的
                    <Link href="/terms-and-privacy" className="text-primary hover:underline underline-offset-2 mx-0.5">服務條款與隱私權政策</Link>
                </p>
            </div>
        </>
    );
}

export default function Login() {
    return (
        <Suspense fallback={
            <div className="w-full flex items-center justify-center p-4">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
                    <p className="text-ink-soft mt-4">正在載入登入頁面...</p>
                </div>
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}
