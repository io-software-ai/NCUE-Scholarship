"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FaqAnswer from '@/components/FaqAnswer';
import { DEFAULT_FAQS } from '@/lib/faqSeed';
import { siteConfig } from '@/lib/siteConfig';
import { School, Globe, ChevronDown, HelpCircle, BookOpen, Sparkles } from 'lucide-react';

// --- 子元件區塊 ---

// LINE 圖示 SVG 元件
const LineIcon = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 50 50"
        className={className}
        fill="currentColor"
    >
        <path d="M12.5,42h23c3.59,0,6.5-2.91,6.5-6.5v-23C42,8.91,39.09,6,35.5,6h-23C8.91,6,6,8.91,6,12.5v23C6,39.09,8.91,42,12.5,42z" style={{ fill: '#00c300' }}></path>
        <path d="M37.113,22.417c0-5.865-5.88-10.637-13.107-10.637s-13.108,4.772-13.108,10.637c0,5.258,4.663,9.662,10.962,10.495c0.427,0.092,1.008,0.282,1.155,0.646c0.132,0.331,0.086,0.85,0.042,1.185c0,0-0.153,0.925-0.187,1.122c-0.057,0.331-0.263,1.296,1.135,0.707c1.399-0.589,7.548-4.445,10.298-7.611h-0.001C36.203,26.879,37.113,24.764,37.113,22.417z M18.875,25.907h-2.604c-0.379,0-0.687-0.308-0.687-0.688V20.01c0-0.379,0.308-0.687,0.687-0.687c0.379,0,0.687,0.308,0.687,0.687v4.521h1.917c0.379,0,0.687,0.308,0.687,0.687C19.562,25.598,19.254,25.907,18.875,25.907z M21.568,25.219c0,0.379-0.308,0.688-0.687,0.688s-0.687-0.308-0.687-0.688V20.01c0-0.379,0.308-0.687,0.687-0.687s0.687,0.308,0.687,0.687V25.219z M27.838,25.219c0,0.297-0.188,0.559-0.47,0.652c-0.071,0.024-0.145,0.036-0.218,0.036c-0.215,0-0.42-0.103-0.549-0.275l-2.669-3.635v3.222c0,0.379-0.308,0.688-0.688,0.688c-0.379,0-0.688-0.308-0.688-0.688V20.01c0-0.296,0.189-0.558,0.47-0.652c0.071-0.024,0.144-0.035,0.218-0.035c0.214,0,0.42,0.103,0.549,0.275l2.67,3.635V20.01c0-0.379,0.309-0.687,0.688-0.687c0.379,0,0.687,0.308,0.687,0.687V25.219z M32.052,21.927c0.379,0,0.688,0.308,0.688,0.688c0,0.379-0.308,0.687-0.688,0.687h-1.917v1.23h1.917c0.379,0,0.688,0.308,0.688,0.687c0,0.379-0.309,0.688-0.688,0.688h-2.604c-0.378,0-0.687-0.308-0.687-0.688v-2.603c0-0.001,0-0.001,0-0.001c0,0,0-0.001,0-0.001v-2.601c0-0.001,0-0.001,0-0.002c0-0.379,0.308-0.687,0.687-0.687h2.604c0.379,0,0.688,0.308,0.688,0.687s-0.308,0.687-0.688,0.687h-1.917v1.23H32.052z" style={{ fill: '#fff' }}></path>
    </svg>
);

// 外部資源連結卡片
const ResourceCard = ({ icon, title, description, href, linkText }) => (
    <motion.a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col h-full p-6 bg-surface rounded-2xl border border-line hover:border-primary/40 hover:bg-surface-hover transition-colors duration-200"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
    >
        <div className="flex-grow">
            <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-primary-tint border border-primary/15">
                    {icon}
                </div>
                <h3 className="text-lg font-bold text-ink leading-snug">{title}</h3>
            </div>
            <p className="text-[15px] leading-relaxed text-ink-soft">{description}</p>
        </div>
        <div className="text-right mt-6">
            <span className="text-sm font-bold text-primary">
                {linkText}
                <span className="inline-block ml-0.5 transition-transform duration-300 ease-in-out group-hover:translate-x-1.5" aria-hidden="true">&rarr;</span>
            </span>
        </div>
    </motion.a>
);

// FAQ 問答項目（手風琴）
const FaqItem = ({ question, isOpen, onToggle, children }) => (
    <div className="border-b border-line last:border-b-0">
        <button
            type="button"
            className="w-full flex justify-between items-center py-4 sm:py-5 text-left gap-4 group"
            onClick={onToggle}
            aria-expanded={isOpen}
        >
            <span className={`text-base sm:text-lg font-semibold transition-colors ${isOpen ? 'text-primary' : 'text-ink group-hover:text-primary'}`}>
                {question}
            </span>
            <ChevronDown
                className={`h-5 w-5 flex-shrink-0 transform transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : 'text-ink-soft'}`}
                aria-hidden="true"
            />
        </button>
        <AnimatePresence initial={false}>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: 'easeInOut' }}
                    className="overflow-hidden"
                >
                    <div className="pb-5 pr-1">{children}</div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);

// --- 主要頁面元件 ---

const SECTIONS = [
    { key: 'resources', label: '相關資源', icon: Globe },
    { key: 'faq', label: '常見問答', icon: HelpCircle },
    { key: 'manual', label: '使用手冊', icon: BookOpen },
];

const cardData = [
    { icon: <School className="h-7 w-7 text-primary" />, title: '彰師大獎助學金專區', description: '提供全校各單位之校內外獎助學金、揚鷹獎勵金之公告訊息，並有校園餐券及校內外急難扶助金等申請資訊！', href: siteConfig.links.scholarshipZone, linkText: '前往瞭解' },
    { icon: <LineIcon className="h-7 w-7" />, title: '加入 LINE 官方社群', description: '歡迎加入生輔組 LINE「彰師多元關懷社群」，及時掌握獎助學金、獎勵金及學雜費減免等訊息！', href: siteConfig.links.lineCommunity, linkText: '立即加入' },
    { icon: <Sparkles className="h-7 w-7 text-primary" />, title: 'LINE 獎學金助理', description: '加入官方帳號並完成綁定，直接在 LINE 與 AI 獎學金助理對話，隨時查詢公告與申請條件！', href: siteConfig.links.lineOfficialAdd, linkText: '加入好友' },
    { icon: <Globe className="h-7 w-7 text-primary" />, title: '教育部圓夢助學網', description: '教育部提供的全國性獎學金資源查詢平台，彙整中央各部會及各大專校院的獎助學金資源。', href: siteConfig.links.helpDreams, linkText: '探索更多' },
];

export default function RelatedLinksPage() {
    const [activeSection, setActiveSection] = useState('resources');
    const [openFaq, setOpenFaq] = useState(null);
    // 先以內建預設 FAQ 顯示，載入後以資料庫內容覆寫（後台可維護）
    const [faqList, setFaqList] = useState(
        DEFAULT_FAQS.map((f, i) => ({ id: `seed-${i}`, question: f.question, answer: f.answer }))
    );

    // 舊版連結相容：#section2 直達常見問答
    useEffect(() => {
        if (window.location.hash === '#section2') setActiveSection('faq');
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/faqs')
            .then(res => res.json())
            .then(data => {
                if (!cancelled && Array.isArray(data?.faqs) && data.faqs.length > 0) {
                    setFaqList(data.faqs);
                }
            })
            .catch(() => { /* 保留內建預設內容 */ });
        return () => { cancelled = true; };
    }, []);

    const handleFaqToggle = (id) => setOpenFaq(openFaq === id ? null : id);

    return (
        <div className="w-full bg-page min-h-screen py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                {/* 頁面標題（緊湊） */}
                <motion.div
                    className="text-center mb-8"
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">相關資源與常見問答</h1>
                    <p className="mt-2 text-[15px] text-ink-soft">常用資源連結、申請常見問題與平台操作說明。</p>
                </motion.div>

                {/* 分頁導覽 */}
                <div className="flex justify-center mb-10">
                    <div className="inline-flex items-center gap-1 p-1 bg-surface border border-line rounded-full" role="tablist" aria-label="頁面分區">
                        {SECTIONS.map(({ key, label, icon: Icon }) => {
                            const active = activeSection === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setActiveSection(key)}
                                    className={`relative flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? 'text-white dark:text-[#10151B]' : 'text-ink-soft hover:text-ink'}`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="resource-tab-pill"
                                            className="absolute inset-0 bg-primary rounded-full"
                                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                                        />
                                    )}
                                    <Icon size={16} className="relative" aria-hidden="true" />
                                    <span className="relative">{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {/* 相關資源 */}
                    {activeSection === 'resources' && (
                        <motion.div
                            key="resources"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.25 }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6"
                        >
                            {cardData.map((card) => (
                                <ResourceCard key={card.title} {...card} />
                            ))}
                        </motion.div>
                    )}

                    {/* 常見問答 */}
                    {activeSection === 'faq' && (
                        <motion.div
                            key="faq"
                            id="section2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.25 }}
                            className="max-w-4xl mx-auto"
                        >
                            <div className="bg-surface rounded-2xl border border-line px-5 sm:px-7 py-2">
                                {faqList.map((item) => (
                                    <FaqItem
                                        key={item.id}
                                        question={item.question}
                                        isOpen={openFaq === item.id}
                                        onToggle={() => handleFaqToggle(item.id)}
                                    >
                                        <FaqAnswer blocks={item.answer} />
                                    </FaqItem>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* 使用手冊 */}
                    {activeSection === 'manual' && (
                        <motion.div
                            key="manual"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.25 }}
                        >
                            <div className="w-full bg-surface rounded-2xl border border-line overflow-hidden h-[75vh] min-h-[480px]">
                                <iframe
                                    src={siteConfig.links.manual}
                                    width="100%"
                                    height="100%"
                                    title="平台使用手冊"
                                    allowFullScreen
                                    className="w-full h-full"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
