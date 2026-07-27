"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle, Loader2, ArrowRight, ShieldCheck, Database, UserCheck, Mail, Globe2, Scale } from 'lucide-react';
import { siteConfig } from '@/lib/siteConfig';

// --- 文件版本資訊（單一來源） ---
const EFFECTIVE_DATE = '2026 年 5 月 11 日';
const LAST_UPDATED = '2026 年 7 月 27 日';
const CONTACT_EMAIL = 'contact@iosoftware.ai';

// --- 動畫設定 ---
const containerVariants = {
    hidden: {},
    visible: {
        transition: {
            staggerChildren: 0.05,
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: "easeOut" }
    }
};

// --- 目錄結構 ---
const SECTIONS_DATA = [
    {
        id: 'tos', title: '第一部分：服務條款', articles: [
            { id: 'tos_1', title: '第一條、認知與接受條款' },
            { id: 'tos_2', title: '第二條、服務說明' },
            { id: 'tos_3', title: '第三條、帳號註冊與安全' },
            { id: 'tos_4', title: '第四條、使用者行為與義務' },
            { id: 'tos_5', title: '第五條、智慧財產權' },
            { id: 'tos_6', title: '第六條、服務之中斷或變更' },
            { id: 'tos_7', title: '第七條、責任限制與免責聲明' },
        ]
    },
    {
        id: 'privacy', title: '第二部分：隱私權政策', articles: [
            { id: 'privacy_8', title: '第八條、個人資料之蒐集類別與目的' },
            { id: 'privacy_9', title: '第九條、個人資料之處理與利用' },
            { id: 'privacy_10', title: '第十條、第三方服務與國際傳輸' },
            { id: 'privacy_11', title: '第十一條、Cookie 與類似技術' },
            { id: 'privacy_12', title: '第十二條、資料保存期限與刪除' },
            { id: 'privacy_13', title: '第十三條、當事人權利與行使方式' },
            { id: 'privacy_14', title: '第十四條、資料安全維護措施' },
            { id: 'privacy_15', title: '第十五條、未成年人保護' },
            { id: 'privacy_16', title: '第十六條、資料事故通知' },
            { id: 'privacy_17', title: '第十七條、政策修訂與通知' },
        ]
    },
    {
        id: 'general', title: '第三部分：一般條款', articles: [
            { id: 'general_18', title: '第十八條、準據法與管轄法院' },
            { id: 'general_19', title: '第十九條、聯絡資訊' },
        ]
    },
];

// --- 子元件 ---

// 目錄元件
const TableOfContents = ({ sections, activeId, onLinkClick }) => {
    const isSectionActive = useCallback((section) => {
        if (!activeId) return false;
        const sectionPrefix = section.id.split('_')[0];
        return activeId.startsWith(sectionPrefix);
    }, [activeId]);

    return (
        <nav className="sticky top-24 hidden lg:block">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft mb-3">條款目錄</h3>
            <ul className="space-y-2.5">
                {sections.map(section => (
                    <li key={section.id}>
                        <a
                            href={`#${section.id}`}
                            onClick={(e) => {
                                e.preventDefault();
                                const targetId = section.articles.length > 0 ? section.articles[0].id : section.id;
                                onLinkClick(targetId);
                            }}
                            className={`flex items-center text-[13px] transition-colors duration-200 ${isSectionActive(section)
                                ? 'font-bold text-ink'
                                : 'text-ink-soft hover:text-ink'
                                }`}
                        >
                            {section.title}
                        </a>
                        {section.articles.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 pl-2 border-l border-line">
                                {section.articles.map(article => (
                                    <li key={article.id} className="relative">
                                        <a
                                            href={`#${article.id}`}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                onLinkClick(article.id);
                                            }}
                                            className={`block py-[3px] pl-3 pr-2 text-[12.5px] leading-snug transition-colors duration-200 relative ${activeId === article.id
                                                ? 'font-semibold text-primary'
                                                : 'text-ink-soft hover:text-primary'
                                                }`}
                                        >
                                            {article.title}
                                            {activeId === article.id && (
                                                <motion.div
                                                    layoutId="active-toc-indicator"
                                                    className="absolute left-[-1px] top-0 bottom-0 w-0.5 bg-primary/70 rounded-full"
                                                    transition={{ duration: 0.3 }}
                                                />
                                            )}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>
        </nav>
    );
};

// 內容區塊（滾動位置僅驅動目錄高亮，內文本身不套用高亮效果）
const ContentSection = ({ id, title, titleAs: TitleComponent = 'h3', children }) => (
    <motion.section
        variants={itemVariants}
        id={id}
        className="scroll-mt-28 py-6 border-b border-line/60 last:border-b-0"
    >
        {title && (
            <TitleComponent className="text-lg sm:text-xl font-bold text-ink tracking-tight">
                {title}
            </TitleComponent>
        )}
        <article className="prose prose-slate prose-sm sm:prose-base max-w-none mt-3 prose-p:leading-relaxed prose-a:text-primary hover:prose-a:underline">
            {children}
        </article>
    </motion.section>
);

// 資料類別表格列
const DataRow = ({ category, items, source }) => (
    <div className="grid sm:grid-cols-[160px_1fr_150px] gap-1 sm:gap-4 py-3 border-b border-line last:border-b-0 text-sm">
        <div className="font-semibold text-ink">{category}</div>
        <div className="text-ink-soft leading-relaxed">{items}</div>
        <div className="text-ink-soft/80 text-xs sm:text-sm sm:text-right">{source}</div>
    </div>
);

// 重點摘要卡片
const SummaryCard = ({ icon: Icon, title, children }) => (
    <div className="bg-page rounded-xl border border-line p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
            <Icon size={16} className="text-primary flex-shrink-0" aria-hidden="true" />
            <h4 className="font-bold text-ink text-sm">{title}</h4>
        </div>
        <p className="text-[13px] text-ink-soft leading-relaxed">{children}</p>
    </div>
);

// --- 主頁面元件---
export default function TermsAndPrivacyPage() {
    const { isAuthenticated, hasAgreedToTerms, agreeToTerms } = useAuth();
    const [isAgreeing, setIsAgreeing] = useState(false);
    const [activeId, setActiveId] = useState('tos_1');
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const isClickScrolling = useRef(false);
    const scrollTimeout = useRef(null);
    const observerRef = useRef(null);
    const bottomRef = useRef(null);

    const sections = useMemo(() => SECTIONS_DATA, []);

    // 頂部閱讀進度條
    const { scrollYProgress } = useScroll();
    const progressScaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleLinkClick = useCallback((id) => {
        isClickScrolling.current = true;
        setActiveId(id);

        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        window.history.pushState(null, '', `#${id}`);

        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

        scrollTimeout.current = setTimeout(() => {
            isClickScrolling.current = false;
        }, 1000);
    }, []);

    const handleAgree = async () => {
        if (!hasScrolledToBottom || isAgreeing) return;
        setIsAgreeing(true);
        try {
            const result = await agreeToTerms();
            if (result.success) {
                window.location.href = '/';
            } else {
                alert('同意失敗，請稍後再試');
                setIsAgreeing(false);
            }
        } catch (e) {
            console.error(e);
            setIsAgreeing(false);
        }
    };

    // 處理底部滾動偵測
    useEffect(() => {
        if (!isMounted) return;

        const bottomObserver = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setHasScrolledToBottom(true);
                    if (bottomRef.current) {
                        bottomObserver.unobserve(bottomRef.current);
                    }
                }
            },
            {
                root: null,
                rootMargin: '0px',
                threshold: 1.0
            }
        );

        if (bottomRef.current) {
            bottomObserver.observe(bottomRef.current);
        }

        const handleScrollBackup = () => {
            if (hasScrolledToBottom) return;
            const scrollPosition = window.innerHeight + window.scrollY;
            const threshold = document.documentElement.scrollHeight - 100;
            if (scrollPosition >= threshold) {
                setHasScrolledToBottom(true);
            }
        };

        window.addEventListener('scroll', handleScrollBackup, { passive: true });
        handleScrollBackup();

        return () => {
            bottomObserver.disconnect();
            window.removeEventListener('scroll', handleScrollBackup);
        };
    }, [hasScrolledToBottom, isMounted]);

    // 處理目錄高亮偵測
    useEffect(() => {
        if (!isMounted) return;

        const handleManualScroll = () => {
            if (isClickScrolling.current) {
                isClickScrolling.current = false;
                if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
            }
        };

        window.addEventListener('wheel', handleManualScroll, { passive: true });
        window.addEventListener('touchmove', handleManualScroll, { passive: true });

        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (isClickScrolling.current) return;

                const intersectingEntries = entries.filter(entry => entry.isIntersecting);

                if (intersectingEntries.length > 0) {
                    const topEntry = intersectingEntries.sort(
                        (a, b) => Math.abs(a.boundingClientRect.top - window.innerHeight / 2) - Math.abs(b.boundingClientRect.top - window.innerHeight / 2)
                    )[0];
                    setActiveId(topEntry.target.id);
                }
            },
            {
                rootMargin: `-40% 0px -40% 0px`,
            }
        );

        const allArticleElements = sections.flatMap(s => s.articles.map(a => document.getElementById(a.id))).filter(Boolean);
        allArticleElements.forEach(el => {
            if (el) observerRef.current.observe(el);
        });

        return () => {
            window.removeEventListener('wheel', handleManualScroll);
            window.removeEventListener('touchmove', handleManualScroll);
            if (observerRef.current) observerRef.current.disconnect();
            if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        };
    }, [sections, isMounted]);

    if (!isMounted) {
        return <div className="bg-page min-h-screen" />;
    }

    return (
        <div className="bg-page text-ink select-none relative">
            {/* 頁面閱讀進度條 */}
            <motion.div
                aria-hidden="true"
                className="fixed top-0 left-0 right-0 h-1 bg-primary origin-left z-[70]"
                style={{ scaleX: progressScaleX }}
            />
            <div className="container mx-auto px-0 sm:px-6 lg:px-8 py-8 sm:py-16">
                <div className="flex flex-col lg:flex-row justify-center gap-x-16">
                    <div className="w-full lg:w-64 lg:flex-shrink-0 mb-8 lg:mb-0 px-4 sm:px-0">
                        <TableOfContents sections={sections} activeId={activeId} onLinkClick={handleLinkClick} />
                    </div>
                    <main className="w-full max-w-4xl min-w-0">
                        <motion.div
                            className="bg-transparent sm:bg-surface p-4 sm:p-12 rounded-none sm:rounded-2xl sm:shadow-sm"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <motion.h1 variants={itemVariants} className="text-2xl sm:text-4xl font-extrabold tracking-tight text-ink leading-tight px-2 sm:px-0">
                                服務條款暨隱私權政策
                            </motion.h1>

                            <motion.div variants={itemVariants} className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs sm:text-sm text-ink-soft px-2 sm:px-0">
                                <span>生效日期：<strong className="text-ink">{EFFECTIVE_DATE}</strong></span>
                                <span>最後更新：<strong className="text-ink">{LAST_UPDATED}</strong></span>
                            </motion.div>

                            <motion.div variants={itemVariants} className="mt-6 space-y-4 text-sm sm:text-base leading-relaxed text-ink-soft px-2 sm:px-0">
                                <p>
                                    歡迎您使用由 <strong>國立彰化師範大學學生事務處生活輔導組</strong>（以下簡稱「本組」）委託 <strong>io Software</strong>（以下簡稱「開發團隊」）開發與維護之「{siteConfig.name}」（以下簡稱「本平台」）。
                                </p>
                                <p>
                                    為保障您的權益，請於使用本平台服務前詳細閱讀以下條款。當您完成登入程序或開始使用本平台服務時，即視為您已<strong>閱讀、理解並完全同意</strong>接受本服務條款暨隱私權政策（以下合稱「本條款」）之所有內容。本隱私權政策依據中華民國《個人資料保護法》（下稱「個資法」）制定，並參考歐盟《一般資料保護規則》（GDPR）之原則設計。
                                </p>
                            </motion.div>

                            {/* 重點摘要 */}
                            <motion.div variants={itemVariants} className="mt-8 px-2 sm:px-0">
                                <h2 className="text-sm font-bold text-ink-soft tracking-wider mb-3">隱私權重點摘要</h2>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <SummaryCard icon={Database} title="我們蒐集什麼">
                                        Google 帳號基本資料（姓名、Email）、您填寫的學籍資料、綁定後的 LINE 識別碼與對話、以及必要的系統使用紀錄。
                                    </SummaryCard>
                                    <SummaryCard icon={ShieldCheck} title="我們如何使用">
                                        僅用於提供獎學金資訊服務、AI 助理回覆、訂閱提醒與帳號管理。絕不出售或出租您的個人資料。
                                    </SummaryCard>
                                    <SummaryCard icon={UserCheck} title="您的權利">
                                        您可隨時查詢、更正、下載或刪除您的資料；「個資管理」頁面可自助管理訂閱、LINE 綁定與註銷帳戶。
                                    </SummaryCard>
                                    <SummaryCard icon={Mail} title="聯絡窗口">
                                        隱私權相關請求請來信 {CONTACT_EMAIL}，我們將於法定期限內處理與回覆。
                                    </SummaryCard>
                                </div>
                            </motion.div>

                            <hr className="my-8 sm:my-10 border-line mx-2 sm:mx-0" />

                            <motion.h2 variants={itemVariants} className="text-xl sm:text-3xl font-bold border-b border-line pb-4 mt-10 sm:mt-12 mb-2 text-ink px-2 sm:px-0">第一部分：服務條款</motion.h2>

                            <ContentSection id="tos_1" activeId={activeId} title="第一條、認知與接受條款">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>條款效力</strong>：本條款構成您與本組及開發團隊之間關於使用本平台之完整合意。</li>
                                    <li><strong>條款修訂</strong>：因應法令變更或服務調整，我們保留隨時修改本條款之權利。所有修改將於本平台公告後即刻生效。若您於條款修改後繼續使用本服務，即視為您已接受該等修改；重大變更將依第十七條另行通知。</li>
                                    <li><strong>未成年人使用</strong>：若您為未滿十八歲之未成年人，應請您的法定代理人（如父母或監護人）詳閱、理解並同意本條款之所有內容後，方得使用本平台。當您使用本服務時，即推定您的法定代理人已同意您接受本條款之拘束。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="tos_2" activeId={activeId} title="第二條、服務說明">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>服務內容</strong>：本平台提供整合式獎學金資訊服務，功能包含但不限於：
                                        <ul className="list-disc pl-5 space-y-2 mt-2">
                                            <li>校外獎學金公告之彙整、分類、搜尋與展示。</li>
                                            <li>運用人工智慧（AI）技術，針對獎學金辦法（如 PDF 文件、網頁連結）進行自動化分析，生成重點摘要及提取關鍵欄位（如申請資格、金額、期限）。</li>
                                            <li>AI 獎學金助理問答服務（網頁版與 LINE 官方帳號）。</li>
                                            <li>公告訂閱與截止日 Email 提醒、Google 日曆整合。</li>
                                        </ul>
                                    </li>
                                    <li className="bg-warn/10 p-4 rounded-lg border border-warn/30 text-warn mt-4">
                                        <strong>【重要聲明：AI 生成內容免責】</strong>
                                        <p className='mt-2 text-sm leading-relaxed'>
                                            您明確了解並同意，本平台所使用之 AI 模型（包括但不限於 Google Gemini 系列）所生成之任何摘要、結構化資料及對話回應，僅供輔助參考，<strong>不保證其絕對正確性、完整性或即時性</strong>。
                                            <br /><br />
                                            <strong>所有獎學金之申請資格、期限、金額及應備文件，均應以獎學金提供單位之原始公告為準。</strong>本組及開發團隊不對因信賴 AI 生成內容而產生之任何直接或間接損害（包括但不限於申請逾期、資格不符等）承擔法律責任。
                                        </p>
                                    </li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="tos_3" activeId={activeId} title="第三條、帳號註冊與安全">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>登入方式</strong>：本平台採用 Google 帳號授權登入（OAuth 2.0），<strong>不設置、亦不儲存任何平台密碼</strong>。您的身分驗證由 Google 完成。</li>
                                    <li><strong>真實資料義務</strong>：您同意提供正確、最新且完整之個人資料（如姓名、學號）。若發現有不實登錄，本組有權暫停或終止您的帳號。</li>
                                    <li><strong>帳號保管責任</strong>：您有義務妥善保管您的 Google 帳號安全（建議啟用兩步驟驗證）。任何以該帳號登入本平台後之行為，均視為該帳號持有者之行為。</li>
                                    <li><strong>安全通報</strong>：若您發現帳號遭盜用或有其他安全問題，應立即透過第十九條之聯絡方式通知我們。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="tos_4" activeId={activeId} title="第四條、使用者行為與義務">
                                <p>您承諾遵守中華民國相關法規及網際網路國際慣例，絕不為任何非法目的或以任何非法方式使用本服務。您同意並保證不得利用本平台從事下列行為：</p>
                                <ol className="list-decimal pl-5 space-y-3 mt-4">
                                    <li>侵害他人名譽、隱私權、營業秘密、商標權、著作權、專利權、其他智慧財產權及其他權利。</li>
                                    <li>上傳、張貼、傳輸或散布任何含有電腦病毒、木馬程式、惡意程式碼之資料，或從事任何可能干擾、破壞或限制本平台軟硬體功能之行為。</li>
                                    <li>利用自動化程式（如 Spider、Robot、Crawler 等）大量讀取、擷取本平台資料，致生伺服器負擔。</li>
                                    <li>冒用他人名義使用本服務，或於 AI 對話中蓄意誘導產生違法內容。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="tos_5" activeId={activeId} title="第五條、智慧財產權">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>平台內容</strong>：本平台呈現之所有內容（包括但不限於程式碼、介面設計、文字敘述、圖片、資料庫結構），除原始獎學金公告內容屬原權利人所有外，均由本組或開發團隊依法擁有智慧財產權。非經事前書面同意，不得任意重製、散布、改作或進行還原工程。</li>
                                    <li><strong>授權利用</strong>：管理員上傳之獎學金相關檔案與資訊，視為授權本平台於服務目的範圍內進行必要之重製、編輯、轉換（如 AI 分析）與公開傳輸。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="tos_6" activeId={activeId} title="第六條、服務之中斷或變更">
                                <p>本組將維持本平台之正常運作，但於下列情形發生時，有權暫停或中斷本服務之全部或一部，且對使用者任何直接或間接之損害，<strong>不負賠償責任</strong>：</p>
                                <ul className="list-disc pl-5 space-y-2 mt-4">
                                    <li>對本服務相關軟硬體設備進行搬遷、更換、升級、保養或維修時。</li>
                                    <li>使用者有任何違反政府法令或本使用條款情形。</li>
                                    <li>天災或其他不可抗力之因素所致之服務停止或中斷。</li>
                                    <li>非本組或開發團隊所得控制之事由而致本服務資訊顯示不正確、或遭偽造、竄改、刪除或擷取、或致系統中斷或不能正常運作時。</li>
                                </ul>
                            </ContentSection>

                            <ContentSection id="tos_7" activeId={activeId} title="第七條、責任限制與免責聲明">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>非保證條款</strong>：本平台係依「現況」及「現有」之基礎提供，本組及開發團隊不保證服務內容將完全符合您的需求，亦不保證服務之及時性、安全性、準確性或不會中斷。</li>
                                    <li><strong>第三方連結</strong>：本平台可能包含連結至其他網站。該等網站均由各該業者自行經營，不屬本組或開發團隊控制及負責範圍之內。</li>
                                </ol>
                            </ContentSection>

                            <hr className="my-8 sm:my-10 border-line mx-2 sm:mx-0" />

                            <motion.h2 variants={itemVariants} className="text-xl sm:text-3xl font-bold border-b border-line pb-4 mt-10 sm:mt-12 mb-2 text-ink px-2 sm:px-0">第二部分：隱私權政策</motion.h2>

                            <ContentSection id="privacy_8" activeId={activeId} title="第八條、個人資料之蒐集類別與目的">
                                <p>本平台為個資法所定之非公務機關資料蒐集者，由本組擔任資料管理者、開發團隊擔任受託處理者。我們僅蒐集提供服務所必要之最少資料（資料最小化原則）：</p>
                                <div className="mt-4 bg-page rounded-xl border border-line px-4 sm:px-5 py-1 not-prose">
                                    <div className="hidden sm:grid grid-cols-[160px_1fr_150px] gap-4 py-2.5 border-b border-line text-xs font-bold text-ink-soft tracking-wider">
                                        <span>類別</span><span>內容</span><span className="text-right">來源</span>
                                    </div>
                                    <DataRow category="帳號識別資料" items="姓名（顯示名稱）、電子郵件地址、大頭貼（個資法類別 C001 辨識個人者）" source="Google 帳號授權" />
                                    <DataRow category="學籍補充資料" items="學號、系所、年級等您自行填寫之資料（C011 個人描述）" source="您主動填寫" />
                                    <DataRow category="LINE 整合資料" items="LINE 使用者識別碼、顯示名稱、您與官方帳號之對話訊息" source="您主動綁定 LINE 後" />
                                    <DataRow category="AI 背景資料（記憶庫）" items="供 AI 助理個人化推薦參考之背景說明（身分別、系所年級、需求描述等，均為選填）" source="您主動填寫，或由 AI 助理就您對話中提供之內容提出建議、經您逐次同意後寫入（可隨時修改或清除）" />
                                    <DataRow category="服務使用紀錄" items="AI 對話紀錄、公告訂閱與通知設定、問題回報內容與附圖" source="您使用服務時" />
                                    <DataRow category="系統與安全紀錄" items="IP 位址、登入紀錄、瀏覽與點選紀錄、裝置與瀏覽器資訊" source="系統自動產生" />
                                </div>
                                <p className="mt-4"><strong>蒐集之特定目的</strong>（法務部公告代號）：090 消費者、客戶管理與服務；135 資（通）訊服務；157 調查、統計與研究分析；158 學生資料管理。</p>
                                <p className="mt-2"><strong>法律依據</strong>：契約之履行（提供您請求之服務）、您的同意（如 LINE 綁定、訂閱通知），以及維護資訊安全之正當利益（如安全日誌）。</p>
                            </ContentSection>

                            <ContentSection id="privacy_9" activeId={activeId} title="第九條、個人資料之處理與利用">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>利用期間</strong>：自您首次登入之日起，至您註銷帳戶、或本平台終止服務之日止（法令另有保存義務者除外，詳第十二條）。</li>
                                    <li><strong>利用地區</strong>：中華民國領域內，及第十條所列雲端服務供應商之伺服器所在地。</li>
                                    <li><strong>利用對象</strong>：僅限本組、開發團隊，及為提供服務所必要之受託雲端服務商；各受託者均僅得於委託範圍內處理資料。</li>
                                    <li><strong>利用方式</strong>：以自動化系統於前述目的範圍內處理與利用，不進行造成法律效果之純自動化決策。</li>
                                    <li><strong>AI 對話處理</strong>：您與 AI 助理之對話內容（含經您綁定後之 LINE 對話）會傳送至 Google Gemini API 以生成回覆。依 Google 之 API 資料使用政策，透過付費 API 提交之內容<strong>不會被用於訓練其公開模型</strong>；本平台亦不會將您的帳號識別資料（如 Email、學號）附加於 AI 請求中。請避免於對話中提供病歷、犯罪前科等特種個人資料或無關之第三人個資。</li>
                                    <li><strong>AI 背景資料與對話中上傳之文件</strong>：您於「個資管理」自填之背景資料，會於每次 AI 對話（含 LINE）自動提供給模型作為個人化推薦依據，您可隨時修改或清除，清除後即不再使用。您於 AI 對話中上傳之文件（如自傳、計畫書、公文）僅用於<strong>當次對話</strong>之分析與建議，內容經模型處理後即不留存原始檔案，亦不用於模型訓練。</li>
                                    <li><strong>AI 助理提議之背景資料（記憶庫）</strong>：當您於對話中主動提供可長期沿用的背景（如系所年級、身分別、需求方向），AI 助理可能<strong>建議</strong>將其加入您的 AI 背景資料，使後續對話無需重複說明。此項採<strong>逐次明確同意</strong>制：助理會先列出擬記錄之項目，僅在您於介面點選同意（或於 LINE 以文字明確同意）後才寫入；您未同意即不寫入，亦不影響其他功能之使用。寫入時僅就您既有內容<strong>整理增補、不覆蓋</strong>，寫入後之完整內容可於「個資管理」頁面隨時查看、修改或清除。助理不會記錄您未提供之推測資訊，亦不會將病歷、犯罪前科等特種個人資料納入建議；若不慎出現，請逕行於該頁面刪除。</li>
                                    <li><strong>絕不出售</strong>：除法律另有規定或配合司法機關依法調查外，我們絕不會將您的個人資料出售、交換、出租或以其他方式提供給任何無關之第三人，亦不進行跨平台廣告追蹤。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="privacy_10" activeId={activeId} title="第十條、第三方服務與國際傳輸">
                                <p>本平台使用下列第三方服務以提供功能，您的部分資料將依各服務之用途傳輸至其伺服器（可能位於中華民國境外）處理：</p>
                                <ul className="list-disc pl-5 space-y-2 mt-4">
                                    <li><strong>Supabase</strong>（資料庫、身分驗證、檔案儲存）：儲存您的帳號與服務資料。</li>
                                    <li><strong>Google</strong>（OAuth 登入、Gemini AI、Google 日曆連結）：身分驗證與 AI 回覆生成。</li>
                                    <li><strong>LINE（LY Corporation）</strong>（官方帳號訊息服務）：於您綁定或加入官方帳號後處理訊息往來。</li>
                                    <li><strong>Email 寄送服務（SMTP）</strong>：寄送訂閱提醒與系統通知信。</li>
                                </ul>
                                <p className="mt-4">上述服務均受其各自隱私權政策約束，且多數已採行國際公認之資料保護標準（如 GDPR、SOC 2）。本平台就國際傳輸依個資法第 21 條辦理；若中央目的事業主管機關限制特定傳輸，我們將遵循其命令。您使用本平台即表示知悉並同意上述必要之跨境資料傳輸。</p>
                            </ContentSection>

                            <ContentSection id="privacy_11" activeId={activeId} title="第十一條、Cookie 與類似技術">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>必要性 Cookie</strong>：用於維持登入狀態與安全驗證（session），為提供服務所不可或缺，無法停用。</li>
                                    <li><strong>功能性儲存</strong>：使用瀏覽器 localStorage 記錄您的介面偏好（如深淺主題），僅存於您的裝置。</li>
                                    <li><strong>不使用廣告追蹤</strong>：本平台不使用任何第三方廣告或跨站追蹤 Cookie。</li>
                                    <li>您可於瀏覽器設定中管理或清除 Cookie，惟停用必要性 Cookie 將導致無法登入使用本平台。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="privacy_12" activeId={activeId} title="第十二條、資料保存期限與刪除">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li><strong>帳號資料</strong>：保存至您註銷帳戶為止。您可隨時於「個資管理」頁面自助執行「註銷帳戶」，帳號資料（含個人資料、AI 對話紀錄、訂閱設定）將隨即刪除或去識別化。</li>
                                    <li><strong>LINE 資料</strong>：解除綁定後，您的 LINE 對話即不再與平台帳號關聯；封鎖或刪除官方帳號好友後，我們不再接收您的新訊息。</li>
                                    <li><strong>安全日誌</strong>：為資安事件調查之必要，系統紀錄（如 IP、登入紀錄）最長保存十二個月後刪除。</li>
                                    <li><strong>法定保存</strong>：法令要求保存之紀錄（如依法配合調查之資料），依各該法令規定之期限辦理。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="privacy_13" activeId={activeId} title="第十三條、當事人權利與行使方式">
                                <p>依個資法第 3 條，並參考 GDPR 所保障之當事人權利，您得就您的個人資料行使下列權利：</p>
                                <ul className="list-disc pl-5 space-y-2 mt-4">
                                    <li><strong>查詢與閱覽</strong>：查詢、請求閱覽或請求製給複製本（我們得酌收必要成本費用）。</li>
                                    <li><strong>補充或更正</strong>：可直接於「個資管理」頁面更新您的資料。</li>
                                    <li><strong>停止蒐集、處理或利用</strong>：包含隨時取消公告訂閱、解除 LINE 綁定、撤回先前之同意。</li>
                                    <li><strong>刪除（被遺忘權）</strong>：透過「註銷帳戶」自助刪除，或來信請求刪除特定資料。</li>
                                    <li><strong>資料可攜</strong>：請求以結構化、通用機器可讀格式取得您提供之資料。</li>
                                </ul>
                                <p className="mt-4 p-4 bg-page rounded-lg border border-line not-prose text-sm leading-relaxed">
                                    行使方式：登入後至「個資管理」頁面自助操作，或以您的註冊信箱來信 <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline font-semibold">{CONTACT_EMAIL}</a>（為保護您的權益，我們將先確認您的身分）。我們將於收到請求後 <strong className="text-ink">15 日內</strong>處理查詢閱覽請求、<strong className="text-ink">30 日內</strong>處理其他請求；必要時得依法延長並敘明理由通知您。若您認為權利受侵害，並有權向我國個人資料保護委員會（或各目的事業主管機關）提出申訴。
                                </p>
                            </ContentSection>

                            <ContentSection id="privacy_14" activeId={activeId} title="第十四條、資料安全維護措施">
                                <ul className="list-disc pl-5 space-y-2">
                                    <li><strong>無密碼架構</strong>：採 Google OAuth 授權登入，平台不儲存任何密碼，從源頭消除密碼外洩風險。</li>
                                    <li><strong>傳輸加密</strong>：全站採用 TLS/HTTPS 加密連線，確保資料傳輸過程不被竊取或竄改。</li>
                                    <li><strong>存取控制</strong>：資料庫實施列級安全性（Row Level Security），使用者僅能存取自身資料；管理權限採最小權限原則，僅限必要人員於權限範圍內存取。</li>
                                    <li><strong>金鑰管理</strong>：服務金鑰集中控管，不置於前端程式碼中。</li>
                                    <li><strong>定期備份</strong>：資料每日備份，確保災難復原能力。</li>
                                </ul>
                            </ContentSection>

                            <ContentSection id="privacy_15" activeId={activeId} title="第十五條、未成年人保護">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li>本平台服務對象為大專校院學生。未滿十八歲之使用者，應經法定代理人閱覽、理解並同意本條款後方得使用。</li>
                                    <li>本平台不主動蒐集特種個人資料（如病歷、醫療、基因、性生活、健康檢查及犯罪前科）。若獎學金申請涉及該等文件，請逕向獎學金提供單位辦理，勿上傳或於 AI 對話中提供。</li>
                                    <li>若我們發現於未經法定代理人同意下蒐集了未成年人之個人資料，將儘速刪除。</li>
                                </ol>
                            </ContentSection>

                            <ContentSection id="privacy_16" activeId={activeId} title="第十六條、資料事故通知">
                                <p>若不幸發生個人資料被竊取、洩漏、竄改或其他侵害事故，我們將依個資法第 12 條規定：</p>
                                <ul className="list-disc pl-5 space-y-2 mt-4">
                                    <li>於知悉後立即啟動應變處置，查明事故範圍與影響。</li>
                                    <li>以電子郵件、平台公告或其他適當方式，儘速（原則上不逾七十二小時）通知受影響之當事人，說明事故內容與已採取之因應措施。</li>
                                    <li>依法通報目的事業主管機關，並配合後續調查。</li>
                                </ul>
                            </ContentSection>

                            <ContentSection id="privacy_17" activeId={activeId} title="第十七條、政策修訂與通知">
                                <ol className="list-decimal pl-5 space-y-3">
                                    <li>本政策將因應法令變更或服務調整隨時修正，修正後刊登於本頁面並更新「最後更新」日期，公告後生效。</li>
                                    <li><strong>重大變更</strong>（如蒐集項目擴增、利用目的變更）將另以電子郵件或平台顯著公告通知您；若您於通知後繼續使用本服務，視為同意修訂後之政策。</li>
                                </ol>
                            </ContentSection>

                            <hr className="my-8 sm:my-10 border-line mx-2 sm:mx-0" />

                            <motion.h2 variants={itemVariants} className="text-xl sm:text-3xl font-bold border-b border-line pb-4 mt-10 sm:mt-12 mb-2 text-ink px-2 sm:px-0">第三部分：一般條款</motion.h2>

                            <ContentSection id="general_18" activeId={activeId} title="第十八條、準據法與管轄法院">
                                <p>本條款之解釋與適用，以及與本條款有關的爭議，均應依照<strong>中華民國法律</strong>予以處理。若產生任何訴訟，雙方同意以<strong>臺灣彰化地方法院</strong>為第一審管轄法院；若您依所在地強行法規享有其他管轄保障，不在此限。</p>
                            </ContentSection>

                            <ContentSection id="general_19" activeId={activeId} title="第十九條、聯絡資訊">
                                <div className="not-prose px-2 sm:px-0">
                                    <div className="bg-page p-6 rounded-xl border border-line max-w-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Scale size={16} className="text-primary" aria-hidden="true" />
                                            <h4 className="font-bold text-ink">平台技術、帳號與隱私權事務</h4>
                                        </div>
                                        <p className="text-sm text-ink-soft mb-4 leading-relaxed">
                                            若您對平台操作、帳號問題、本條款或個人資料保護有任何疑問，或欲行使第十三條之當事人權利，請聯繫開發團隊（io Software）：
                                        </p>
                                        <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-primary font-semibold hover:underline">
                                            <Mail size={15} aria-hidden="true" />
                                            {CONTACT_EMAIL}
                                        </a>
                                        <p className="text-xs text-ink-soft/70 mt-4 flex items-center gap-1.5">
                                            <Globe2 size={12} aria-hidden="true" />
                                            獎學金申請資格、期限等業務問題，請逕洽學務處生活輔導組。
                                        </p>
                                    </div>
                                </div>
                            </ContentSection>

                            <motion.div variants={itemVariants} className="border-t border-line mt-12 pt-6 px-2 sm:px-0">
                                <div className="flex justify-end">
                                    <a href={siteConfig.developer.url} target="_blank" rel="noopener noreferrer" aria-label="io Software 官方網站">
                                        {/* 透明 logo 為白色線稿：淺色模式反轉為深色，深色模式原樣 */}
                                        <img src="/logo_transparent.svg" alt="io Software Logo" className="h-12 sm:h-14 w-auto invert dark:invert-0 opacity-85 hover:opacity-100 transition-opacity" />
                                    </a>
                                </div>
                            </motion.div>

                            <div ref={bottomRef} className="h-1 w-full" aria-hidden="true" />
                        </motion.div>
                    </main>
                </div>
            </div>

            {isAuthenticated && !hasAgreedToTerms && (
                <footer className="sticky bottom-0 bg-surface/80 backdrop-blur-sm border-t border-line z-10">
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-20 max-w-4xl mx-auto lg:pl-80">
                            <p className="text-sm text-ink-soft hidden sm:block">最新修訂：{LAST_UPDATED}</p>

                            <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
                                <button
                                    onClick={handleAgree}
                                    disabled={isAgreeing || !hasScrolledToBottom}
                                    className={`inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white dark:text-[#10151B] shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary group
                                        ${hasScrolledToBottom
                                            ? 'bg-primary hover:bg-primary-hover active:scale-95 cursor-pointer'
                                            : 'bg-line-strong cursor-not-allowed'}
                                    `}
                                    title={!hasScrolledToBottom ? '請先將條款滑動至底部以啟用同意按鈕' : ''}
                                >
                                    {isAgreeing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <CheckCircle className="w-4 h-4" />
                                    )}
                                    {hasScrolledToBottom ? '我已閱讀並同意以上條款' : '請先滑動閱讀所有條款'}
                                    {hasScrolledToBottom && !isAgreeing && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </footer>
            )}
        </div>
    );
}
