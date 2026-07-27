"use client";

import Link from "next/link";
import { useState } from 'react';
import { School, Mail, MessageSquare, Sparkles, Rss } from 'lucide-react';
import { usePathname } from 'next/navigation';
import FeedbackModal from './FeedbackModal';
import PlayStoreGuideModal, { GooglePlayBadge } from './PlayStoreGuideModal';
import { siteConfig } from '@/lib/siteConfig';

export default function Footer() {
    const pathname = usePathname();
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [isPlayGuideOpen, setIsPlayGuideOpen] = useState(false);

    // AI 助理頁（全螢幕體驗）與管理後台不顯示 Footer
    if (pathname?.startsWith('/ai-assistant') || pathname?.startsWith('/manage')) return null;

    return (
        <>
            <style jsx global>{`
                
                .footer-link-underline {
                    position: relative;
                    display: inline-block;
                }
                .footer-link-underline::after {
                    content: '';
                    position: absolute;
                    width: 0;
                    height: 1px;
                    display: block;
                    margin-top: 2px;
                    right: 0;
                    background: #66ABDF;
                    transition: width .3s ease;
                    -webkit-transition: width .3s ease;
                }
                .group:hover .footer-link-underline::after {
                    width: 100%;
                    left: 0;
                    background-color: #66ABDF;
                }
            `}</style>

            <footer className="bg-footer border-t border-white/5 text-white py-8 sm:py-10 select-none">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

                        {/* --- 關於平台 --- */}
                        <div className="text-center sm:text-left">
                            <div className="inline-block mb-3 sm:mb-4">
                                <h3 className="text-lg font-bold text-white">
                                    關於平台
                                </h3>
                                <div className="w-12 h-0.5 bg-footer-accent mt-2 mx-auto sm:mx-0"></div>
                            </div>
                            <p className="text-white/70 text-sm sm:text-base leading-relaxed">
                                An AI-native scholarship platform. AI now assists the entire announcement lifecycle, streamlining the work for staff and students alike. A built-in assistant helps students refine their applications (Beta), and our LINE official account brings it to iOS.
                            </p>
                            <p className="text-white/55 text-xs sm:text-sm mt-3 sm:mt-4 leading-relaxed">
                                Open source under PolyForm Noncommercial · Built with industry partners · Exhibited at COMPUTEX
                            </p>
                            <p className="text-white/55 text-xs sm:text-sm mt-2">
                                LLM powered by <span className="font-medium text-white/70">Gemini 3.6 Flash</span>
                            </p>
                        </div>

                        {/* --- 相關資源 --- */}
                        <div className="text-center sm:text-left">
                            <div className="inline-block mb-3 sm:mb-4">
                                <h3 className="text-lg font-bold text-white">
                                    相關資源
                                </h3>
                                <div className="w-12 h-0.5 bg-footer-accent mt-2 mx-auto sm:mx-0"></div>
                            </div>
                            <div className="space-y-2 sm:space-y-2.5">
                                <Link href={siteConfig.links.studentAffairs} className="group flex items-center justify-center sm:justify-start gap-3 text-white/70 hover:text-white transition-all duration-300 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-footer-accent focus-visible:ring-offset-2 focus-visible:ring-offset-footer rounded-lg p-1" target="_blank" rel="noopener noreferrer">
                                    <School className="w-5 h-5 flex-shrink-0" />
                                    <span className="footer-link-underline text-sm sm:text-base">彰師 生輔組首頁</span>
                                </Link>
                                <Link href="https://www.facebook.com/ncuestuser" className="group flex items-center justify-center sm:justify-start gap-3 text-white/70 hover:text-white transition-all duration-300 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-footer-accent focus-visible:ring-offset-2 focus-visible:ring-offset-footer rounded-lg p-1" target="_blank" rel="noopener noreferrer">
                                    <svg className="w-5 h-5 flex-shrink-0" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                        <title>Facebook</title>
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                    </svg>
                                    <span className="footer-link-underline text-sm sm:text-base">彰師 生輔組 FB</span>
                                </Link>
                                <Link href={siteConfig.links.lineCommunity} className="group flex items-center justify-center sm:justify-start gap-3 text-white/70 hover:text-white transition-all duration-300 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-footer-accent focus-visible:ring-offset-2 focus-visible:ring-offset-footer rounded-lg p-1" target="_blank" rel="noopener noreferrer">
                                    <svg className="w-5 h-5 flex-shrink-0" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">
                                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                                    </svg>
                                    <span className="footer-link-underline text-sm sm:text-base">生輔組獎學金社群</span>
                                </Link>
                                <Link href={siteConfig.links.lineOfficialAdd} className="group flex items-center justify-center sm:justify-start gap-3 text-white/70 hover:text-white transition-all duration-300 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-footer-accent focus-visible:ring-offset-2 focus-visible:ring-offset-footer rounded-lg p-1" target="_blank" rel="noopener noreferrer">
                                    <Sparkles className="w-5 h-5 flex-shrink-0" />
                                    <span className="footer-link-underline text-sm sm:text-base">LINE 獎學金助理 <span className="text-white/50 text-xs">@622iaadg</span></span>
                                </Link>
                                {/* RSS 訂閱源：XML 資源，用原生 a（避免 Next Link 預取/客端導航） */}
                                <a href="/rss.xml" className="group flex items-center justify-center sm:justify-start gap-3 text-white/70 hover:text-white transition-all duration-300 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-footer-accent focus-visible:ring-offset-2 focus-visible:ring-offset-footer rounded-lg p-1" target="_blank" rel="noopener noreferrer" title="以 RSS 閱讀器訂閱最新獎助學金公告">
                                    <Rss className="w-5 h-5 flex-shrink-0" />
                                    <span className="footer-link-underline text-sm sm:text-base">公告 RSS 訂閱</span>
                                </a>
                            </div>
                        </div>

                        {/* --- 平台開發與維護 --- */}
                        <div className="text-center sm:text-left sm:col-span-2 lg:col-span-1">
                            <div className="inline-block mb-3 sm:mb-4">
                                <h3 className="text-lg font-bold text-white">
                                    平台開發與維護
                                </h3>
                                <div className="w-12 h-0.5 bg-footer-accent mt-2 mx-auto sm:mx-0"></div>
                            </div>
                            <div className="space-y-4 w-full">
                                <div className="text-white/70">
                                    <Link href={siteConfig.developer.url} target="_blank" rel="noopener noreferrer" aria-label={`${siteConfig.developer.name} 官方網站`}
                                        className="inline-block mb-4 mx-auto sm:mx-0 rounded-lg outline-none transition-opacity duration-200 hover:opacity-100 opacity-90 focus-visible:ring-2 focus-visible:ring-footer-accent focus-visible:ring-offset-2 focus-visible:ring-offset-footer">
                                        <img src="/logo_transparent.svg" alt="io Software Logo" className="h-9 sm:h-11 w-auto max-w-full" />
                                    </Link>
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-8 gap-y-4 mt-2">
                                        <button type="button" onClick={() => setIsFeedbackOpen(true)} className="group flex items-center gap-2.5 hover:text-white transition-all duration-300 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-footer-accent focus-visible:ring-offset-2 focus-visible:ring-offset-footer rounded-lg p-1 cursor-pointer">
                                            <MessageSquare className="w-5 h-5 text-footer-accent" />
                                            <span className="text-sm sm:text-base font-medium text-white/70 group-hover:text-white footer-link-underline">平台問題回報</span>
                                        </button>
                                    </div>
                                    <div className="mt-5 flex justify-center sm:justify-start">
                                        <GooglePlayBadge
                                            onClick={() => setIsPlayGuideOpen(true)}
                                            className="h-11"
                                            ringClass="focus-visible:ring-footer-accent focus-visible:ring-offset-footer"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/10 mt-6 sm:mt-8 pt-5 text-center text-xs sm:text-sm">
                        <p className="text-white/55" translate="no">
                            © {new Date().getFullYear()} {siteConfig.name}.<br className="sm:hidden" /> All Rights Reserved.
                        </p>
                    </div>
                </div>
            </footer>

            <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
            <PlayStoreGuideModal isOpen={isPlayGuideOpen} onClose={() => setIsPlayGuideOpen(false)} />
        </>
    );
}