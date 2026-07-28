'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authFetch } from '@/lib/authFetch';
import { aiKeyHeaders } from '@/lib/aiKeyClient';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { supabase } from '@/lib/supabase/client';
import Toast from '@/components/ui/Toast';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import Link from 'next/link';
import { Loader2, Sparkles, HandCoins, GraduationCap, ListChecks, Users, AlertCircle } from 'lucide-react';

const SUGGESTIONS = [
    { icon: HandCoins, text: '我是低收入戶學生，可以申請哪些獎學金？' },
    { icon: GraduationCap, text: '什麼是彰師揚鷹生？我符合資格嗎？' },
    { icon: ListChecks, text: '班排百分比怎麼算？研究生的班排名要怎麼取得？' },
    { icon: Users, text: '家庭狀況欄位要寫到什麼程度才夠？' },
];

/** Gemini 式問候畫面：漸層問候語 + 建議晶片 */
const WelcomeMessage = ({ userName, onSuggestion }) => (
    <div className="flex flex-col justify-center h-full w-full max-w-3xl mx-auto px-2 select-none animate-in fade-in duration-500">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-2 md:mb-3">
            <span className="bg-gradient-to-r from-primary to-ok bg-clip-text text-transparent">
                你好{userName ? `，${userName}` : ''}
            </span>
        </h2>
        <p className="text-xl md:text-2xl text-ink-soft/70 font-medium mb-8 md:mb-12">
            想了解哪些獎學金？我可以搜尋公告、解釋申請規定，也能照生輔組的查核重點檢視你的申請書與自傳。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUGGESTIONS.map(({ icon: Icon, text }) => (
                <button
                    key={text}
                    onClick={() => onSuggestion(text)}
                    className="group flex flex-col gap-3 p-4 bg-surface border border-line rounded-2xl text-left
                        hover:bg-surface-hover hover:border-line-strong transition-colors duration-150
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                    <span className="w-8 h-8 rounded-lg bg-primary-tint text-primary flex items-center justify-center">
                        <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="text-sm text-ink leading-relaxed">{text}</span>
                </button>
            ))}
        </div>
    </div>
);

const ChatInterface = () => {
    const confirm = useConfirm();
    const { user, needsLocalKey } = useAuth();
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const scrollAreaRef = useRef(null);
    const messagesEndRef = useRef(null);

    // 完全手動原生狀態管理
    const [sessionId, setSessionId] = useState(null);
    const [input, setInput] = useState('');
    // 建議問題點擊後聚焦輸入框（不自動送出）
    const [focusSignal, setFocusSignal] = useState(0);
    // 「@」指定公告（檢核基準）與對話附件
    const [reviewAnnouncement, setReviewAnnouncement] = useState(null); // { id, title } | null
    const [attachedFile, setAttachedFile] = useState(null);             // { name, mimeType, size, data } | null
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleInputChange = (e) => {
        setInput(e.target.value);
    };

    // 自製的串流發送邏輯，保證相容且絕對不會鎖死輸入框
    const onChatSubmit = async (e, presetText) => {
        e?.preventDefault();
        let contentToSend = (presetText ?? input).trim();
        // 附件存在時允許空訊息（自動帶預設提問）
        if (!contentToSend && attachedFile) {
            contentToSend = reviewAnnouncement
                ? '請依這則公告的評選重點，檢視我上傳的文件並給我修改建議。'
                : '請依承辦人員的查核重點，檢視我上傳的文件，指出會被退件的錯誤與缺漏。';
        }
        if (!contentToSend || isLoading) return;

        // 1. 清空輸入框並設定狀態（附件為一次性，送出即清除；@公告維持至使用者手動移除）
        setInput('');
        const sendingAttachment = attachedFile;
        setAttachedFile(null);
        setIsLoading(true);

        const currentSessionId = sessionId || crypto.randomUUID();
        if (!sessionId) setSessionId(currentSessionId);

        // 2. 將使用者的訊息加入畫面
        // 畫面上的使用者訊息帶附件標記（與伺服器存進歷史的格式一致，由 MessageBubble 轉成附件卡）
        const displayContent = sendingAttachment
            ? `${contentToSend}\n\n（附件：${sendingAttachment.name}）`.trim()
            : contentToSend;
        const userMessage = { id: crypto.randomUUID(), role: 'user', content: displayContent, createdAt: new Date() };
        const aiMessageId = crypto.randomUUID();
        setMessages(prev => [...prev, userMessage]);

        try {
            // 抓取最新 Token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    // 校外使用者選擇「僅存本機」時，金鑰由此附帶（伺服器只在本次請求中使用）
                    ...aiKeyHeaders()
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    sessionId: currentSessionId,
                    text: contentToSend,
                    reviewAnnouncementId: reviewAnnouncement?.id || null,
                    attachment: sendingAttachment || null,
                })
            });

            if (!response.ok) {
                if (response.status === 401) throw new Error('登入已過期，請重新登入');
                if (response.status === 429) throw new Error('請求太頻繁，請稍候再試');
                // 顯示伺服器回傳的原因（例如檔案無法讀取），不要一律吞成「伺服器發生錯誤」
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData?.error || '伺服器發生錯誤');
            }

            // 3. 處理 SSE 串流
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiFullResponse = '';
            let aiFullReasoning = '';
            let aiTools = [];
            let lineBuffer = '';

            // 先在畫面上塞入一個空的 AI 訊息
            setMessages(prev => [
                ...prev, 
                { id: aiMessageId, role: 'model', content: '', reasoning: '', tools: [], createdAt: new Date() }
            ]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                lineBuffer += decoder.decode(value, { stream: true });
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop() || ''; // 留下最後一行（可能不完整）

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    const firstColonIndex = trimmedLine.indexOf(':');
                    if (firstColonIndex === -1) continue;

                    const type = trimmedLine.substring(0, firstColonIndex);
                    const data = trimmedLine.substring(firstColonIndex + 1);

                    try {
                        const value = JSON.parse(data);

                        if (type === '0') {
                            aiFullResponse += value;
                        } else if (type === '8') {
                            aiFullReasoning += value;
                        } else if (type === '9') {
                            // 工具事件：running 新增一列，done 更新最後一筆同名 running
                            if (value.status === 'running') {
                                aiTools = [...aiTools, { name: value.name, label: value.label, status: 'running' }];
                            } else {
                                const idx = aiTools.findLastIndex(t => t.name === value.name && t.status === 'running');
                                if (idx !== -1) {
                                    aiTools = aiTools.map((t, i) => i === idx ? { ...t, status: 'done', summary: value.summary } : t);
                                }
                            }
                        } else {
                            continue; // 忽略其他類型
                        }

                        // 即時更新畫面上的 AI 訊息
                        setMessages(prev => prev.map(msg =>
                            msg.id === aiMessageId ? { ...msg, content: aiFullResponse, reasoning: aiFullReasoning, tools: aiTools } : msg
                        ));
                    } catch (e) {
                        // parse error, 略過
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            setToast({ message: error.message || 'AI 回應時發生錯誤', type: 'error' });
            // 如果失敗，把字還給使用者並移除剛才加進去的訊息
            setInput(contentToSend);
            setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
        } finally {
            setIsLoading(false);
        }
    };

    const hasStartedConversation = !isHistoryLoading && messages.length > 0;

    // 精確控制局部捲動，不再使用會觸發視窗捲動的 scrollIntoView
    const scrollToBottom = useCallback((behavior = 'smooth') => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current;
            scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior
            });
        }
    }, []);

    const loadChatHistory = useCallback(async () => {
        if (!user) {
            setIsHistoryLoading(false);
            return;
        }
        setIsHistoryLoading(true);
        try {
            const response = await authFetch(`/api/chat-history`);
            const data = await response.json();
            if (data.success && data.data.length > 0) {
                // 歷史現在混有 LINE 訊息（無 session_id），取最近一筆網頁訊息的 session 延續
                const latestSession = [...data.data].reverse().find(m => m.session_id)?.session_id;
                if (latestSession) setSessionId(latestSession);

                setMessages(data.data.map(msg => ({
                    id: msg.id || crypto.randomUUID(),
                    role: msg.role === 'model' ? 'model' : 'user', // Ensure role matches our frontend expectation
                    content: msg.message_content,
                    source: msg.source,
                    fromHistory: true, // 過去的回合：不再顯示記憶庫同意卡
                    createdAt: new Date(msg.timestamp)
                })));

                // 載入完畢後瞬間捲到底部，不使用動畫
                setTimeout(() => scrollToBottom('instant'), 100);
            }
        } catch (error) {
            setToast({ message: '載入歷史紀錄失敗', type: 'error' });
        } finally {
            setIsHistoryLoading(false);
        }
    }, [user, scrollToBottom]);

    useEffect(() => { loadChatHistory(); }, [loadChatHistory]);
    useEffect(() => { 
        if (messages.length > 0) {
            scrollToBottom();
        }
    }, [messages, isLoading, scrollToBottom]);

    const handleClearHistory = async () => {
        if (isLoading) return;
        if (await confirm({ title: '清除對話紀錄', message: '您確定要清除所有對話紀錄嗎？此操作無法復原。', variant: 'danger', confirmLabel: '清除' })) {
            try {
                const response = await authFetch('/api/chat-history', { method: 'DELETE' });
                if (!response.ok) throw new Error('清除失敗');
                setMessages([]);
                setSessionId(null); 
                setToast({ message: '對話紀錄已清除', type: 'success' });
            } catch (error) {
                setToast({ message: error.message, type: 'error' });
            }
        }
    };

    return (
        <div className="flex flex-col flex-1 bg-page/50 overflow-hidden font-sans relative select-none">
            {/* 校外使用者把金鑰只存在別台裝置時，AI 會直接失敗 → 先明講並給修復入口 */}
            {needsLocalKey && (
                <div className="flex-shrink-0 mx-4 md:mx-6 mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3 text-[13px] text-warn">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="font-medium leading-relaxed">
                        這台裝置找不到你的 Gemini 金鑰，AI 助理暫時無法回應。請到
                        <Link href="/profile" className="underline font-bold mx-1">個資管理 → 帳號安全</Link>
                        重新輸入金鑰，或改為儲存到雲端帳號。
                    </p>
                </div>
            )}

            {/* 對話顯示區域 - 限制在此內部捲動 */}
            <div 
                ref={scrollAreaRef} 
                className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth"
                role="log"
                aria-live="polite"
                aria-label="對話歷史紀錄"
            >
                <div className="min-h-full flex flex-col p-4 md:p-6 max-w-3xl mx-auto w-full">
                    {isHistoryLoading ? (
                        <div className="flex-1 flex flex-col justify-center items-center gap-3" aria-busy="true">
                            <Loader2 className="animate-spin text-primary" size={36} aria-hidden="true" />
                            <p className="text-sm text-ink-soft/60 font-medium">載入對話紀錄中...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center py-2">
                            <WelcomeMessage
                                userName={user?.profile?.username || user?.user_metadata?.name || ''}
                                onSuggestion={(text) => { setInput(text); setFocusSignal(n => n + 1); }}
                            />
                        </div>
                    ) : (
                        <ul className="space-y-6 md:space-y-8 pb-12 list-none p-0"> {/* 增加底部間距 */}
                            {messages.map((msg, index) => (
                                <li key={msg.id || index}>
                                    <MessageBubble
                                        message={{
                                            ...msg,
                                            role: msg.role === 'assistant' ? 'model' : msg.role,
                                            timestamp: msg.createdAt || new Date()
                                        }}
                                        user={user}
                                        isLoading={isLoading && index === messages.length - 1 && msg.role === 'model'}
                                        sessionId={sessionId}
                                        question={index > 0 && messages[index - 1]?.role === 'user' ? messages[index - 1].content : ''}
                                    />
                                </li>
                            ))}
                            {isLoading && messages[messages.length - 1]?.role !== 'model' && (
                                <li className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <MessageBubble isLoading={true} />
                                </li>
                            )}
                            {/* 錨點 */}
                            <div className="h-4" aria-hidden="true" />
                        </ul>
                    )}
                </div>
            </div>

            {/* 輸入區域 - 固定在容器底部 */}
            <div className="flex-shrink-0 bg-gradient-to-t from-page via-page to-transparent pt-2 sm:pt-4 pb-1 sm:pb-2 z-10" role="form" aria-label="發送訊息區域">
                <div className="max-w-3xl mx-auto w-full">
                    <ChatInput
                        input={input}
                        handleInputChange={handleInputChange}
                        onInputReplace={(v) => setInput(v)}
                        handleSubmit={onChatSubmit}
                        onClear={handleClearHistory}
                        isLoading={isLoading}
                        hasStarted={hasStartedConversation}
                        reviewAnnouncement={reviewAnnouncement}
                        onPickReview={setReviewAnnouncement}
                        attachment={attachedFile}
                        onAttachFile={setAttachedFile}
                        focusSignal={focusSignal}
                    />
                </div>
            </div>

            {toast && <Toast show={!!toast} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default ChatInterface;