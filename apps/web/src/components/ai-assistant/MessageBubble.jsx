'use client';

import { useState, useEffect, useRef } from 'react';
import HtmlRenderer from '@/components/HtmlRenderer';
import AnnouncementCard from './AnnouncementCard';
import { authFetch } from '@/lib/authFetch';
import { aiKeyHeaders } from '@/lib/aiKeyClient';
import Link from 'next/link';
import { Sparkles, Bot, ChevronDown, ChevronUp, BrainCircuit, Search, Loader2, Check, Wrench, BellRing, ThumbsUp, ThumbsDown, Database, X, Paperclip } from 'lucide-react';

/**
 * AI 回覆回饋（👍 / 👎）：協助平台找出知識缺口。
 * 點擊即送出；再次點擊同一鍵可取消。回饋僅記錄提問與回覆快照，供後台歸納 FAQ。
 */
const FeedbackButtons = ({ messageKey, question, answer, sessionId }) => {
    const [rating, setRating] = useState(null); // 'up' | 'down' | null
    const [busy, setBusy] = useState(false);

    const submit = async (next) => {
        if (busy) return;
        const target = rating === next ? null : next; // 再次點擊 → 取消
        setBusy(true);
        setRating(target);
        try {
            await authFetch('/api/chat/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageKey, question, answer, rating: target, sessionId }),
            });
        } catch (e) {
            console.error('[Feedback]', e);
            setRating(rating); // 還原
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-2.5 flex items-center gap-1 select-none opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
                type="button"
                onClick={() => submit('up')}
                disabled={busy}
                aria-pressed={rating === 'up'}
                aria-label="這則回覆有幫助"
                title="有幫助"
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                    ${rating === 'up' ? 'text-ok bg-ok/10' : 'text-ink-soft/60 hover:text-ok hover:bg-ok/10'}`}
            >
                <ThumbsUp size={14} aria-hidden="true" />
            </button>
            <button
                type="button"
                onClick={() => submit('down')}
                disabled={busy}
                aria-pressed={rating === 'down'}
                aria-label="這則回覆待改進"
                title="待改進"
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                    ${rating === 'down' ? 'text-danger bg-danger/10' : 'text-ink-soft/60 hover:text-danger hover:bg-danger/10'}`}
            >
                <ThumbsDown size={14} aria-hidden="true" />
            </button>
        </div>
    );
};

/** AI 提議訂閱後的「確認訂閱」按鈕（點擊即完成訂閱，成功後轉為已訂閱狀態） */
const SubscribeConfirmButton = ({ proposal }) => {
    const [status, setStatus] = useState('idle'); // idle | loading | done | error

    const handleConfirm = async () => {
        if (status === 'loading' || status === 'done') return;
        setStatus('loading');
        try {
            const res = await authFetch('/api/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ announcementId: proposal.announcementId, daysBefore: proposal.daysBefore }),
            });
            if (!res.ok) throw new Error((await res.json())?.error || '訂閱失敗');
            setStatus('done');
        } catch (e) {
            console.error('[SubscribeConfirm]', e);
            setStatus('error');
        }
    };

    return (
        <div className="mt-3">
            {status === 'done' ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-ok/10 text-ok border border-ok/30">
                    <Check size={15} aria-hidden="true" /> 已訂閱（截止前 {proposal.daysBefore} 天提醒）
                </span>
            ) : (
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={status === 'loading'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-primary bg-primary text-white dark:text-[#10151B] hover:bg-primary-hover transition-colors duration-150 disabled:opacity-60"
                >
                    {status === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} aria-hidden="true" />}
                    確認訂閱（截止前 {proposal.daysBefore} 天提醒）
                </button>
            )}
            {status === 'error' && (
                <p className="mt-1.5 text-xs text-danger">訂閱失敗，請確認已登入後重試，或至公告詳情頁訂閱。</p>
            )}
        </div>
    );
};

/**
 * AI 提議「加入記憶庫」後的同意卡片。
 * 需使用者點擊同意才寫入；寫入為整理增補，既有背景資料不會被覆蓋。
 */
const MemoryConsentCard = ({ items }) => {
    const [status, setStatus] = useState('idle'); // idle | loading | done | error | dismissed
    const [message, setMessage] = useState('');

    const handleConfirm = async () => {
        if (status === 'loading' || status === 'done') return;
        setStatus('loading');
        try {
            const res = await authFetch('/api/users/background/merge', {
                method: 'POST',
                // 記憶庫整理也會呼叫模型：本機儲存金鑰的校外使用者需附帶金鑰
                headers: { 'Content-Type': 'application/json', ...aiKeyHeaders() },
                body: JSON.stringify({ items }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || '加入記憶庫失敗');
            setMessage(data.message || '已加入記憶庫');
            setStatus('done');
        } catch (e) {
            console.error('[MemoryConsent]', e);
            setMessage(e.message);
            setStatus('error');
        }
    };

    if (status === 'dismissed') return null;

    return (
        <div className="mt-3 rounded-xl border border-line bg-page/60 p-3.5">
            <div className="flex items-center gap-2 text-ink">
                <Database size={15} className="text-primary flex-shrink-0" aria-hidden="true" />
                <p className="text-[13px] font-semibold">
                    {status === 'done' ? '已加入記憶庫' : '要把這些資料加入記憶庫嗎？'}
                </p>
            </div>

            <ul className="mt-2 space-y-1">
                {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-ink-soft leading-relaxed">
                        <span className="text-primary/60" aria-hidden="true">•</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>

            {status === 'done' ? (
                <p className="mt-2.5 text-xs text-ink-soft">
                    {message}
                    <Link href="/profile" className="ml-1 text-primary hover:underline">前往檢視或編輯</Link>
                </p>
            ) : (
                <>
                    <p className="mt-2.5 text-[11.5px] text-ink-soft/80 leading-relaxed">
                        同意後會整理併入你的 AI 背景資料（原有內容保留，不會被覆蓋），之後對話自動帶入，可隨時到「個人資料」頁修改或刪除。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={status === 'loading'}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-primary bg-primary text-white dark:text-[#10151B] hover:bg-primary-hover transition-colors duration-150 disabled:opacity-60"
                        >
                            {status === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} aria-hidden="true" />}
                            {status === 'loading' ? '整理中…' : '同意加入'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatus('dismissed')}
                            disabled={status === 'loading'}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-line-strong text-ink hover:bg-surface-hover transition-colors duration-150 disabled:opacity-60"
                        >
                            <X size={15} aria-hidden="true" />
                            不用了
                        </button>
                    </div>
                    {status === 'error' && (
                        <p className="mt-1.5 text-xs text-danger">{message || '加入失敗，請確認已登入後重試。'}</p>
                    )}
                </>
            )}
        </div>
    );
};

/**
 * ✅ 思考計時器組件
 * 顯示 00.00 格式的快速計時 (秒.毫秒)
 */
const ThinkingTimer = ({ isStopped }) => {
    const [ms, setMs] = useState(0);
    const startTimeRef = useRef(Date.now());

    useEffect(() => {
        if (isStopped) return;
        
        const interval = setInterval(() => {
            const delta = Date.now() - startTimeRef.current;
            setMs(delta);
        }, 33); // 約 30fps 更新一次

        return () => clearInterval(interval);
    }, [isStopped]);

    const seconds = Math.floor(ms / 1000);
    const remainingMs = Math.floor((ms % 1000) / 10);
    
    return (
        <span className="font-mono tabular-nums opacity-60" aria-hidden="true">
            {seconds.toString().padStart(2, '0')}.{remainingMs.toString().padStart(2, '0')}
        </span>
    );
};

/**
 * ✅ 遞迴處理 <think> 標籤並渲染 Markdown
 */
const ThoughtSection = ({ content, reasoning, hasFormalContent, isStreaming = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const prevIsThinkingRef = useRef(false);
    const prevHasFormalContentRef = useRef(false);

    const isThinking = !!reasoning || (content && content.includes('<think>') && !content.includes('</think>')) || (isStreaming && !hasFormalContent);

    // 💡 強化版自動展開/收合邏輯
    useEffect(() => {
        // 1. 當進入「思考狀態」且還沒有正式回覆時，自動展開
        if (isThinking && !prevIsThinkingRef.current && !hasFormalContent) {
            setIsExpanded(true);
        }
        prevIsThinkingRef.current = isThinking;

        // 2. 當「正式回覆」首次出現時，自動收合
        if (hasFormalContent && !prevHasFormalContentRef.current) {
            setIsExpanded(false);
        }
        prevHasFormalContentRef.current = hasFormalContent;
    }, [isThinking, hasFormalContent]);

    const parts = [];

    if (reasoning || (isStreaming && !hasFormalContent)) {
        parts.push({ 
            type: 'thought', 
            value: reasoning || (isStreaming ? '' : ''), 
            isUnfinished: !hasFormalContent && isStreaming 
        });
    } else if (content) {
        // 解析嵌套標籤 (簡單正則提取最外層)
        const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
        let lastIndex = 0;
        let match;

        while ((match = thinkRegex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', value: content.substring(lastIndex, match.index) });
            }
            parts.push({ type: 'thought', value: match[1] });
            lastIndex = thinkRegex.lastIndex;
        }

        if (lastIndex < content.length) {
            const remaining = content.substring(lastIndex);
            if (remaining.includes('<think>')) {
                const [pre, post] = remaining.split('<think>');
                if (pre) parts.push({ type: 'text', value: pre });
                parts.push({ type: 'thought', value: post, isUnfinished: true });
            } else {
                parts.push({ type: 'text', value: remaining });
            }
        }
    }

    if (parts.length === 0) return null;

    return (
        <div className="space-y-3 mb-4 w-full">
            {parts.map((part, idx) => {
                if (part.type === 'text') {
                    return part.value.trim() ? (
                        <div key={idx} className="prose prose-sm max-w-none text-ink">
                            <HtmlRenderer content={part.value} />
                        </div>
                    ) : null;
                }

                return (
                    <div key={idx} className="w-full">
                        {/* 藥丸按鈕 */}
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            aria-expanded={isExpanded}
                            aria-controls={`thought-content-${idx}`}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-surface shadow-sm text-[11px] font-medium text-ink-soft hover:bg-primary-tint/30 transition-all select-none group"
                        >
                            <div className="relative">
                                <Search size={13} className={`text-primary ${!isExpanded && part.isUnfinished ? 'animate-pulse' : ''}`} aria-hidden="true" />
                                {!isExpanded && part.isUnfinished && (
                                    <div className="absolute inset-0 bg-primary/70 blur-md opacity-40 animate-ping rounded-full"></div>
                                )}
                            </div>
                            
                            <span className="flex items-center gap-1.5">
                                {part.isUnfinished ? 'AI 正在深度思考…' : '顯示思路'}
                                <ThinkingTimer isStopped={!part.isUnfinished} />
                            </span>

                            {isExpanded ? <ChevronUp size={13} className="opacity-50 group-hover:opacity-100" aria-hidden="true" /> : <ChevronDown size={13} className="opacity-50 group-hover:opacity-100" aria-hidden="true" />}
                        </button>
                        
                        {/* 思考內容 (支援 Markdown) */}
                        {isExpanded && (
                            <div 
                                id={`thought-content-${idx}`}
                                className="relative mt-2 pl-4 py-1 ml-2 animate-in fade-in slide-in-from-left-1 duration-500"
                            >
                                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-primary to-transparent rounded-full opacity-60"></div>
                                <div className="text-[13px] text-ink-soft/90 italic leading-relaxed prose prose-sm prose-slate prose-p:my-1 prose-pre:bg-page/50">
                                    {part.value ? <HtmlRenderer content={part.value} /> : <span className="opacity-50">正在整理思維脈絡...</span>}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

/**
 * 工具調用活動列（Claude 風格）：即時顯示 AI 正在使用哪些工具
 */
const ToolActivity = ({ tools }) => (
    <div className="w-full mb-3 space-y-1.5" role="status" aria-label="AI 工具調用狀態">
        {tools.map((tool, i) => (
            <div key={i}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-page/70 text-[12.5px] animate-in fade-in slide-in-from-bottom-1 duration-300">
                {tool.status === 'running'
                    ? <Loader2 size={13} className="animate-spin text-primary flex-shrink-0" aria-hidden="true" />
                    : <Check size={13} className="text-ok flex-shrink-0" aria-hidden="true" />}
                <Wrench size={11} className="text-ink-soft/60 flex-shrink-0" aria-hidden="true" />
                <span className="font-medium text-ink truncate">{tool.label}</span>
                {tool.status === 'done' && tool.summary && (
                    <span className="text-ink-soft ml-auto flex-shrink-0 tabular-nums">{tool.summary}</span>
                )}
                {tool.status === 'running' && (
                    <span className="text-primary/70 ml-auto flex-shrink-0">執行中…</span>
                )}
            </div>
        ))}
    </div>
);

const MessageBubble = ({ message, user, isLoading = false, isStreaming = false, sessionId = null, question = '' }) => {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // ✅ 強化版的載入中 UI (Gemini 深度思考風格)
    if (isLoading && !message) {
        return (
            <div className="flex gap-3 w-full group animate-in fade-in slide-in-from-bottom-2 duration-300" role="status">
                <span className="sr-only">AI 正在思考並準備回覆中...</span>
                <div className="flex-shrink-0 flex flex-col items-center gap-1 mt-1">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-surface border border-primary/20 text-primary shadow-sm">
                        <Sparkles size={18} aria-hidden="true" />
                    </div>
                </div>
                <div className="flex flex-col items-start max-w-[85%] sm:max-w-[75%]">
                    <div className="flex items-baseline gap-2 mb-2 px-1">
                        <span className="text-xs font-semibold text-ink-soft">AI Assistant</span>
                    </div>
                    
                    {/* 即時顯示思考藥丸 */}
                    <div className="mb-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-surface shadow-sm text-[11px] font-medium text-ink-soft select-none">
                            <div className="relative">
                                <Search size={13} className="text-primary animate-pulse" aria-hidden="true" />
                                <div className="absolute inset-0 bg-primary/70 blur-md opacity-40 animate-ping rounded-full"></div>
                            </div>
                            <span className="flex items-center gap-1.5">
                                AI 正在深度思考…
                                <ThinkingTimer isStopped={false} />
                            </span>
                        </div>
                    </div>

                    {/* 準備回應的動態點 */}
                    <div className="py-2 flex items-center gap-1.5" aria-hidden="true">
                        <div className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!message) return null;

    const isUser = message.role === 'user';
    const name = isUser ? (user?.profile?.username || user?.user_metadata?.name || 'User') : 'AI Assistant';
    const avatarChar = name.charAt(0).toUpperCase();

    let time = '';
    try {
        if (message.timestamp) {
            time = new Date(message.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
    } catch (e) { /* ignore */ }

    /**
     * 使用者訊息中的附件呈現：
     * - 新格式：「（附件：檔名）」
     * - 舊紀錄：整份抽取的文件全文（【使用者上傳文件「檔名」內容】…）→ 內文不顯示，只留檔名
     */
    const extractAttachment = (text) => {
        const legacy = text.match(/\n*【使用者上傳文件「([^」]+)」內容】[\s\S]*$/);
        if (legacy) return { name: legacy[1], text: text.slice(0, legacy.index).trim() };
        const tagged = text.match(/\n*（附件：([^）]+)）\s*$/);
        if (tagged) return { name: tagged[1], text: text.slice(0, tagged.index).trim() };
        return { name: null, text };
    };

    // Parse announcement cards
    const cardRegex = /\[ANNOUNCEMENT_CARD:([\w,-]+)\]/g;
    let rawAnnouncementIds = [];
    
    let messageContent = message.content || '';
    const attachmentInfo = isUser ? extractAttachment(messageContent) : { name: null, text: messageContent };
    messageContent = attachmentInfo.text;

    const mainContentFiltered = messageContent.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/, '').trim();

    let parsedContent = mainContentFiltered.replace(cardRegex, (match, ids) => {
        rawAnnouncementIds.push(...ids.split(','));
        return '';
    }).trim();

    // Parse subscribe-confirm marker: [SUBSCRIBE_CONFIRM:<uuid>:<days>]
    let subscribeProposal = null;
    parsedContent = parsedContent.replace(/\[SUBSCRIBE_CONFIRM:([\w-]+)(?::(\d+))?\]/g, (match, id, days) => {
        subscribeProposal = { announcementId: id, daysBefore: Math.min(14, Math.max(1, parseInt(days, 10) || 3)) };
        return '';
    }).trim();

    // Parse memory-consent marker: [MEMORY_CONFIRM:項目1|項目2]
    let memoryProposal = null;
    parsedContent = parsedContent.replace(/\[MEMORY_CONFIRM:([^\]]+)\]/g, (match, payload) => {
        const items = payload.split('|').map(s => s.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean).slice(0, 6);
        if (items.length > 0) memoryProposal = items;
        return '';
    }).trim();

    // 串流途中標記尚未閉合，先隱藏避免原始文字閃現
    parsedContent = parsedContent.replace(/\[(?:ANNOUNCEMENT_CARD|SUBSCRIBE_CONFIRM|MEMORY_CONFIRM):[^\]]*$/, '').trim();

    const announcementIds = [...new Set(rawAnnouncementIds)];

    return (
        <div className={`flex gap-3 w-full ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
            {/* Avatar */}
            <div className={`flex-shrink-0 flex flex-col items-center gap-1 ${isUser ? 'mt-1' : 'mt-1'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm text-sm font-bold select-none transition-transform group-hover:scale-105
                    ${isUser 
                        ? 'bg-gradient-to-br from-primary to-primary-hover text-white ring-2 ring-white' 
                        : 'bg-surface border border-primary/20 text-primary'
                    }`}
                >
                    {isUser ? (
                        (user?.profile?.avatar_url || user?.user_metadata?.avatar_url) ? (
                            <img src={user?.profile?.avatar_url || user?.user_metadata?.avatar_url} alt={`${name} 的頭像`} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            avatarChar
                        )
                    ) : (
                        <Sparkles size={18} aria-hidden="true" />
                    )}
                </div>
            </div>

            {/* Message Body */}
            <div className={`flex flex-col ${isUser ? 'max-w-[85%] sm:max-w-[75%] items-end' : 'flex-1 min-w-0 items-start'}`}>
                <div className="flex items-baseline gap-2 mb-1 px-1">
                    <span className="text-xs font-semibold text-ink-soft">
                        <span className="sr-only">{isUser ? '您傳送的訊息' : 'AI Assistant 回覆'}：</span>
                        {name}
                    </span>
                    {message.source === 'line' && (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded bg-[#00c300]/10 text-[#06a406] border border-[#00c300]/30 leading-tight select-none" title="來自 LINE 的對話">LINE</span>
                    )}
                    <span className="text-[10px] text-ink-soft/60">{time}</span>
                </div>

                {/* 🔧 工具調用活動 */}
                {!isUser && message.tools?.length > 0 && <ToolActivity tools={message.tools} />}

                {/* 💡 AI 思考過程區塊 */}
                {!isUser && (message.reasoning || messageContent.includes('<think>') || (isLoading && !parsedContent)) && (
                    <ThoughtSection content={messageContent} reasoning={message.reasoning} hasFormalContent={!!parsedContent} isStreaming={isLoading} />
                )}

                {/* 附件：只顯示檔名，不顯示抽取出的文件全文（含個資） */}
                {isUser && attachmentInfo.name && (
                    <div className="mb-1.5 inline-flex items-center gap-2 max-w-full px-3 py-2 rounded-xl bg-surface border border-line">
                        <Paperclip size={14} className="flex-shrink-0 text-ink-soft" aria-hidden="true" />
                        <span className="text-[13px] text-ink truncate" title={attachmentInfo.name}>{attachmentInfo.name}</span>
                    </div>
                )}

                {/* 主對話框 */}
                {parsedContent ? (
                    <div className={`relative text-[15px] leading-relaxed break-words
                        ${isUser
                            ? 'px-5 py-3 shadow-sm w-fit bg-primary text-white dark:text-[#10151B] rounded-2xl rounded-tr-md ml-auto'
                            : 'w-full text-ink selection:bg-primary-tint'
                        }`}
                    >
                         {isClient && (
                            <>
                                {isUser ? (
                                    /* 使用者訊息為純文字：直接輸出，避免 prose/富文字樣式覆蓋氣泡文字色 */
                                    <div className="whitespace-pre-wrap">{parsedContent}</div>
                                ) : (
                                    <div className="max-w-none">
                                        <HtmlRenderer content={parsedContent} />
                                    </div>
                                )}

                                {!isUser && subscribeProposal && (
                                    <SubscribeConfirmButton proposal={subscribeProposal} />
                                )}

                                {/* 記憶庫提議：串流結束後才顯示；歷史訊息不再顯示（避免重整後重複詢問） */}
                                {!isUser && !isLoading && memoryProposal && !message.fromHistory && (
                                    <MemoryConsentCard items={memoryProposal} />
                                )}

                                {announcementIds.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-line/10 space-y-3 w-full">
                                        <p className="text-xs font-medium opacity-70 mb-2 flex items-center gap-1">
                                            <Bot size={12} aria-hidden="true" />
                                            相關公告推薦
                                        </p>
                                        <div className="grid grid-cols-1 gap-2">
                                            {announcementIds.map(id => <AnnouncementCard key={id} id={id.trim()} />)}
                                        </div>
                                    </div>
                                )}

                                {/* 回覆回饋（👍 / 👎）：串流結束後才顯示 */}
                                {!isUser && !isLoading && message.id && (
                                    <FeedbackButtons
                                        messageKey={message.id}
                                        question={question}
                                        answer={parsedContent}
                                        sessionId={sessionId}
                                    />
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    !isUser && isLoading && (
                        <div className="py-2 flex items-center gap-1.5 animate-pulse" aria-hidden="true">
                            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce"></div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default MessageBubble;
