'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Sparkles, Paperclip, Megaphone, X, Loader2, FileSearch } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import CategoryBadge from '@/components/ui/CategoryBadge';

const ATTACH_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt';
const ATTACH_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
const MAX_ATTACH_SIZE = 5 * 1024 * 1024;

const ChatInput = ({
    input = '',
    handleInputChange,
    onInputReplace,
    handleSubmit,
    onClear,
    isLoading,
    hasStarted,
    reviewAnnouncement,
    onPickReview,
    attachment,
    onAttachFile,
}) => {
    // 「@」公告選單
    const [announcementList, setAnnouncementList] = useState(null); // null = 未載入
    const [mentionQuery, setMentionQuery] = useState(null);          // null = 關閉
    const [mentionIndex, setMentionIndex] = useState(0);
    const [attachError, setAttachError] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => { setMentionIndex(0); }, [mentionQuery]);

    const ensureAnnouncements = async () => {
        if (announcementList !== null) return;
        const { data } = await supabase
            .from('announcements')
            .select('id, title, category, application_end_date')
            .eq('is_active', true)
            .order('application_end_date', { ascending: true, nullsFirst: false })
            .limit(120);
        setAnnouncementList(data || []);
    };

    const mentionMatches = mentionQuery !== null && announcementList
        ? announcementList.filter(a => !mentionQuery || a.title.includes(mentionQuery)).slice(0, 8)
        : [];

    const onFormSubmit = (e) => {
        e?.preventDefault();
        if ((!input?.trim() && !attachment) || isLoading) return;
        if (typeof handleSubmit === 'function') handleSubmit(e);
    };

    const selectAnnouncement = (ann) => {
        onPickReview?.({ id: ann.id, title: ann.title });
        // 移除輸入框中的 @查詢字串
        const replaced = input.replace(/@([^@\s]*)$/, '').trimEnd();
        onInputReplace?.(replaced);
        setMentionQuery(null);
    };

    const onChangeWithMention = (e) => {
        if (typeof handleInputChange === 'function') handleInputChange(e);
        adjustHeight(e.target);
        const caretText = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
        const m = caretText.match(/@([^@\s]*)$/);
        if (m) {
            setMentionQuery(m[1]);
            ensureAnnouncements();
        } else {
            setMentionQuery(null);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape' && mentionQuery !== null) { e.preventDefault(); setMentionQuery(null); return; }
        if (mentionQuery !== null && mentionMatches.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectAnnouncement(mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)]); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if ((input?.trim() || attachment) && !isLoading) onFormSubmit(e);
        }
    };

    const adjustHeight = (target) => {
        if (!target) return;
        target.style.height = 'auto';
        target.style.height = Math.min(target.scrollHeight, 128) + 'px';
    };

    const handleFilePick = (file) => {
        setAttachError('');
        if (!file) return;
        if (!ATTACH_MIME.includes(file.type)) { setAttachError('僅支援 PDF、圖片或純文字檔'); return; }
        if (file.size > MAX_ATTACH_SIZE) { setAttachError('檔案需小於 5MB'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = String(reader.result).split(',')[1] || '';
            onAttachFile?.({ name: file.name, mimeType: file.type, size: file.size, data: base64 });
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-2 px-2 sm:px-4 pb-2 sm:pb-4">
            {/* 已選公告 / 附件 chips */}
            {(reviewAnnouncement || attachment || attachError) && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                    {reviewAnnouncement && (
                        <span className="inline-flex items-center gap-1.5 max-w-full pl-2.5 pr-1.5 py-1.5 rounded-full text-xs font-medium bg-primary-tint text-primary border border-primary/30">
                            <FileSearch size={13} className="flex-shrink-0" aria-hidden="true" />
                            <span className="truncate max-w-56 sm:max-w-md">檢核公告：{reviewAnnouncement.title}</span>
                            <button type="button" onClick={() => onPickReview?.(null)} aria-label="移除檢核公告"
                                className="p-0.5 rounded-full hover:bg-primary/15 transition-colors"><X size={13} /></button>
                        </span>
                    )}
                    {attachment && (
                        <span className="inline-flex items-center gap-1.5 max-w-full pl-2.5 pr-1.5 py-1.5 rounded-full text-xs font-medium bg-surface text-ink border border-line">
                            <Paperclip size={13} className="flex-shrink-0 text-ink-soft" aria-hidden="true" />
                            <span className="truncate max-w-48 sm:max-w-xs">{attachment.name}</span>
                            <span className="text-ink-soft/70">{(attachment.size / 1024).toFixed(0)} KB</span>
                            <button type="button" onClick={() => onAttachFile?.(null)} aria-label="移除附件"
                                className="p-0.5 rounded-full hover:bg-danger/10 hover:text-danger transition-colors"><X size={13} /></button>
                        </span>
                    )}
                    {attachError && <span className="text-xs text-danger">{attachError}</span>}
                </div>
            )}

            {/* Input Form：膠囊造型 */}
            <form
                onSubmit={onFormSubmit}
                className={`relative flex items-end gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-full bg-surface border transition-all duration-300 shadow-sm
                    ${isLoading ? 'border-line bg-page' : 'border-line hover:border-line-strong focus-within:ring-0'}
                    ${!isLoading && 'has-[:focus-visible]:border-primary has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/10 has-[:focus-visible]:shadow-md'}
                `}
            >
                {/* 「@」公告選單（浮於輸入框上方） */}
                {mentionQuery !== null && (
                    <div className="absolute bottom-full mb-2 left-0 right-0 sm:right-auto sm:w-[28rem] z-30 bg-surface border border-line rounded-xl shadow-xl overflow-hidden">
                        <p className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-widest text-ink-soft flex items-center gap-1.5">
                            <Megaphone size={11} aria-hidden="true" />指定公告啟用文件檢核{mentionQuery ? `：「${mentionQuery}」` : ''}
                        </p>
                        <div className="max-h-64 overflow-y-auto">
                            {announcementList === null ? (
                                <p className="px-3.5 py-3 text-sm text-ink-soft flex items-center gap-2"><Loader2 size={13} className="animate-spin" />載入公告中…</p>
                            ) : mentionMatches.length === 0 ? (
                                <p className="px-3.5 py-3 text-sm text-ink-soft">找不到符合的公告</p>
                            ) : mentionMatches.map((ann, i) => (
                                <button key={ann.id} type="button" onClick={() => selectAnnouncement(ann)}
                                    onMouseEnter={() => setMentionIndex(i)}
                                    ref={i === mentionIndex ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-100 ${i === mentionIndex ? 'bg-primary-tint/60' : 'hover:bg-primary-tint/40'}`}>
                                    <CategoryBadge category={ann.category} size="sm" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[13px] font-medium text-ink truncate">{ann.title}</span>
                                        {ann.application_end_date && <span className="block text-[11px] text-ink-soft tabular-nums">截止 {ann.application_end_date}</span>}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className="px-3.5 py-1.5 text-[10.5px] text-ink-soft border-t border-line">↑↓ 選擇・Enter 指定・Esc 關閉；指定後 AI 會以該公告的評選重點檢核你的自傳／計畫書</p>
                    </div>
                )}

                <div className="pl-2 sm:pl-3 pb-2 sm:pb-3 text-primary">
                    <Sparkles size={18} className={`sm:w-5 sm:h-5 ${isLoading ? 'animate-pulse' : ''}`} />
                </div>

                <textarea
                    value={input}
                    onChange={onChangeWithMention}
                    onKeyDown={handleKeyDown}
                    placeholder="詢問獎學金相關問題…（@ 指定公告可啟用文件檢核）"
                    aria-label="您的訊息"
                    title="請輸入您的問題"
                    rows={1}
                    className="w-full max-h-32 bg-transparent border-0 py-2 sm:py-3 px-1 sm:px-2 text-sm sm:text-base text-ink placeholder-gray-400 focus:!ring-0 focus:!outline-none !outline-none resize-none custom-scrollbar leading-relaxed"
                    style={{ minHeight: '38px' }}
                />

                {/* 附件上傳 */}
                <input ref={fileInputRef} type="file" accept={ATTACH_ACCEPT} className="sr-only"
                    onChange={e => { handleFilePick(e.target.files?.[0]); e.target.value = ''; }} />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    aria-label="上傳文件（自傳、計畫書、公文）"
                    title="上傳文件（PDF / 圖片 / 純文字，≤5MB）"
                    className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 mb-0.5 sm:mb-1 flex items-center justify-center rounded-full text-ink-soft/60
                        hover:text-primary hover:bg-primary-tint transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Paperclip size={16} className="sm:w-[17px] sm:h-[17px]" />
                </button>

                {hasStarted && (
                    <button
                        type="button"
                        onClick={onClear}
                        disabled={isLoading}
                        aria-label="清除對話紀錄"
                        title="清除對話紀錄"
                        className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 mb-0.5 sm:mb-1 flex items-center justify-center rounded-full text-ink-soft/60
                            hover:text-danger hover:bg-danger/10 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={16} className="sm:w-[17px] sm:h-[17px]" />
                    </button>
                )}

                <button
                    type="submit"
                    disabled={isLoading || (!input?.trim() && !attachment)}
                    aria-label="傳送訊息"
                    className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 mb-0.5 sm:mb-1 flex items-center justify-center rounded-full bg-primary text-white transition-all
                        hover:bg-primary-hover active:scale-95 disabled:bg-surface-hover disabled:text-ink-soft/60 disabled:cursor-not-allowed disabled:active:scale-100 relative"
                >
                    <Send size={16} className={`sm:w-[18px] sm:h-[18px] ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        </div>
                    )}
                </button>
            </form>

            <p className="text-center text-[10px] text-ink-soft/60 select-none">
                AI 生成內容僅供參考，請務必查閱原始公告確認詳情。
            </p>
        </div>
    );
};

export default ChatInput;
