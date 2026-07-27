'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, MonitorSmartphone } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';
import PlayStoreGuideModal, { GooglePlayBadge } from '@/components/PlayStoreGuideModal';

export default function AndroidInstallPrompt() {
    const [showPrompt, setShowPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showPlayGuide, setShowPlayGuide] = useState(false);

    useEffect(() => {
        // Only run on client side
        if (typeof window === 'undefined') return;

        // 1. Check if Android
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (!isAndroid) return;

        // 2. Check if already PWA (standalone mode)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        if (isStandalone) return;

        // 3. Check if already shown in this session
        if (sessionStorage.getItem('android-install-prompt-dismissed')) return;

        // 4. Listen for beforeinstallprompt
        const handleBeforeInstallPrompt = (e) => {
            if (sessionStorage.getItem('android-install-prompt-dismissed')) return;
            e.preventDefault();
            setDeferredPrompt(e);
            setShowPrompt(true);
            sessionStorage.setItem('android-install-prompt-dismissed', 'true');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Fallback: Show prompt after 5 seconds to guide manual installation if beforeinstallprompt doesn't fire
        const timer = setTimeout(() => {
            if (sessionStorage.getItem('android-install-prompt-dismissed')) return;
            setShowPrompt(true);
            sessionStorage.setItem('android-install-prompt-dismissed', 'true');
        }, 5000);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            clearTimeout(timer);
        };
    }, []);

    const handleInstallPwa = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
                setShowPrompt(false);
                sessionStorage.setItem('android-install-prompt-dismissed', 'true');
            }
        } else {
            alert('請點擊瀏覽器選單 (⋮) 並選擇「安裝應用程式」或「加到主畫面」。');
            sessionStorage.setItem('android-install-prompt-dismissed', 'true');
        }
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        sessionStorage.setItem('android-install-prompt-dismissed', 'true');
    };

    // Play 商店為封閉測試，直接連商店會顯示找不到項目，因此改開安裝指引（含三步驟連結）
    const handleOpenPlayGuide = () => {
        setShowPrompt(false);
        sessionStorage.setItem('android-install-prompt-dismissed', 'true');
        setShowPlayGuide(true);
    };

    return (
        <>
        <AnimatePresence>
            {showPrompt && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 pointer-events-none">
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleDismiss}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: '100%', opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative bg-surface w-full max-w-sm sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 pointer-events-auto overflow-hidden"
                    >
                         {/* Decorative Background Shape */}
                         <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-tint rounded-full blur-2xl opacity-50 pointer-events-none"></div>
                         <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary-tint rounded-full blur-2xl opacity-50 pointer-events-none"></div>

                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary-tint text-primary rounded-xl">
                                    <Smartphone size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-ink leading-tight">
                                        安裝 App
                                    </h3>
                                    <p className="text-sm text-ink-soft mt-0.5">
                                        本平台已上架 Google Play，安裝 App 可獲得最佳體驗
                                    </p>
                                </div>
                            </div>
                            <IconButton 
                                onClick={handleDismiss} 
                                className="text-ink-soft/60 hover:text-ink -mr-2 -mt-2"
                                aria-label="關閉"
                            >
                                <X size={20} />
                            </IconButton>
                        </div>

                        <div className="space-y-3 relative z-10">
                            <div className="flex justify-center">
                                <GooglePlayBadge onClick={handleOpenPlayGuide} className="h-12" label="前往 Google Play 安裝 App" />
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-ink-soft/60">
                                <span className="h-px flex-1 bg-line" />
                                或
                                <span className="h-px flex-1 bg-line" />
                            </div>

                            <button
                                onClick={handleInstallPwa}
                                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-line-strong text-ink font-medium rounded-xl transition-all active:scale-[0.98] hover:bg-surface-hover"
                            >
                                <MonitorSmartphone size={20} />
                                <span>安裝網頁版（加到主畫面）</span>
                            </button>

                            {!deferredPrompt && (
                                <p className="text-xs text-center text-ink-soft/60 mt-2">
                                    若網頁版安裝無反應，請使用瀏覽器選單「加到主畫面」
                                </p>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        <PlayStoreGuideModal isOpen={showPlayGuide} onClose={() => setShowPlayGuide(false)} />
        </>
    );
}
