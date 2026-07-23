'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabase/client';
import CategoryBadge from '@/components/ui/CategoryBadge';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import {
    MessageCircle, Bot, Settings2, RefreshCw, Send, Loader2, Copy, Check,
    Trash2, User, ShieldCheck, ShieldAlert, ExternalLink, Sparkles, Link2, X, Search, Pin, Megaphone, ImagePlus, LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SUB_TABS = [
    { id: 'chats', label: '聊天紀錄', icon: MessageCircle },
    { id: 'ai', label: 'AI 自動回覆', icon: Bot },
    { id: 'account', label: '帳號設定', icon: Settings2 },
];

const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
};

export default function LineTab() {
    const confirm = useConfirm();
    const [subTab, setSubTab] = useState('chats');
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
    const showToast = (message, type = 'info') => setToast({ show: true, message, type });
    const hideToast = () => setToast(prev => ({ ...prev, show: false }));

    // 聊天視窗高度：實測區塊頂端到視窗底的距離，桌機版精準填滿、外層不滾動
    const chatsGridRef = useRef(null);
    const [chatsGridHeight, setChatsGridHeight] = useState(null);
    useEffect(() => {
        const measure = () => {
            if (subTab !== 'chats' || !chatsGridRef.current || window.innerWidth < 1024) {
                setChatsGridHeight(null);
                return;
            }
            const top = chatsGridRef.current.getBoundingClientRect().top + window.scrollY;
            // 48 = 內容區底部 padding（lg:py-10）+ 餘裕，確保總高不超出視窗
            setChatsGridHeight(Math.max(480, window.innerHeight - top - 48));
        };
        // 等分頁切換動畫結束後量測
        const t = setTimeout(measure, 260);
        window.addEventListener('resize', measure);
        return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
    }, [subTab]);

    // --- 設定狀態 ---
    const [settings, setSettings] = useState([]);
    const [secretInput, setSecretInput] = useState('');
    const [tokenInput, setTokenInput] = useState('');
    const [isSavingCreds, setIsSavingCreds] = useState(false);
    const [isTogglingAi, setIsTogglingAi] = useState(false);

    // --- AI 回應時間排程（參考 LINE 官方後台「回應時間」）---
    const [schedule, setSchedule] = useState({ enabled: false, offHoursMessage: '', days: {} });
    const [editingDay, setEditingDay] = useState(null);   // null | 0-6（週日=0）
    const [dayRanges, setDayRanges] = useState([]);       // 單日編輯中的時段
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);
    const [copied, setCopied] = useState(false);

    // --- 聊天狀態 ---
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef(null);

    const getSetting = useCallback((key) => settings.find(s => s.key === key), [settings]);
    const secretSet = getSetting('LINE_CHANNEL_SECRET')?.isSet;
    const tokenSet = getSetting('LINE_CHANNEL_ACCESS_TOKEN')?.isSet;
    const isConfigured = secretSet && tokenSet;
    const aiEnabled = getSetting('LINE_AI_AUTO_REPLY_ENABLED')?.value !== 'false';

    const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/line/webhook` : '';

    const fetchSettings = useCallback(async () => {
        try {
            const res = await authFetch('/api/admin/settings');
            const data = await res.json();
            if (data.success) setSettings(data.settings || []);
        } catch (e) {
            console.error('Failed to fetch settings', e);
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        setIsLoadingUsers(true);
        try {
            const res = await authFetch('/api/admin/line/users');
            const data = await res.json();
            if (data.success) setUsers(data.users || []);
        } catch (e) {
            showToast('無法載入好友列表', 'error');
        } finally {
            setIsLoadingUsers(false);
        }
    }, []);

    const fetchMessages = useCallback(async (lineUserId) => {
        setIsLoadingMessages(true);
        try {
            const res = await authFetch(`/api/admin/line/messages?userId=${encodeURIComponent(lineUserId)}`);
            const data = await res.json();
            if (data.success) {
                setMessages(data.messages || []);
                setUsers(prev => prev.map(u => u.line_user_id === lineUserId ? { ...u, unread_count: 0 } : u));
            }
        } catch (e) {
            showToast('無法載入對話紀錄', 'error');
        } finally {
            setIsLoadingMessages(false);
        }
    }, []);

    useEffect(() => { fetchSettings(); fetchUsers(); }, [fetchSettings, fetchUsers]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSelectUser = (user) => {
        setSelectedUser(user);
        fetchMessages(user.line_user_id);
    };

    // ============ 「@」公告快捷選單 ============
    const [mentionQuery, setMentionQuery] = useState(null);   // null = 關閉;字串 = 過濾關鍵字
    const [mentionIndex, setMentionIndex] = useState(0);      // 鍵盤上下選擇的索引
    useEffect(() => { setMentionIndex(0); }, [mentionQuery]);
    const [announcementList, setAnnouncementList] = useState(null); // null = 未載入
    const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);

    const ensureAnnouncements = useCallback(async () => {
        if (announcementList !== null) return;
        const { data } = await supabase
            .from('announcements')
            .select('id, title, category, application_end_date')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(100);
        setAnnouncementList(data || []);
    }, [announcementList]);

    const handleReplyChange = (e) => {
        const value = e.target.value;
        setReplyText(value);
        // 偵測游標前的最後一個 @token（@ 後接非空白文字）
        const caret = e.target.selectionStart ?? value.length;
        const before = value.slice(0, caret);
        const match = before.match(/@([^@\s]*)$/);
        if (match) {
            setMentionQuery(match[1]);
            ensureAnnouncements();
        } else {
            setMentionQuery(null);
        }
    };

    const mentionMatches = mentionQuery !== null && announcementList
        ? announcementList.filter(a => !mentionQuery || a.title.includes(mentionQuery)).slice(0, 8)
        : [];

    const handleSendAnnouncement = async (announcement) => {
        if (!selectedUser || isSendingAnnouncement) return;
        setIsSendingAnnouncement(true);
        setMentionQuery(null);
        // 從輸入框移除 @token
        setReplyText(prev => prev.replace(/@([^@\s]*)$/, '').trimEnd());
        try {
            const res = await authFetch('/api/admin/line/send', {
                method: 'POST',
                body: JSON.stringify({ lineUserId: selectedUser.line_user_id, announcementId: announcement.id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '公告寄送失敗');
            showToast(`已寄送公告「${announcement.title}」`, 'success');
            await fetchMessages(selectedUser.line_user_id);
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSendingAnnouncement(false);
        }
    };

    // ============ 聊天室底部選單（Rich Menu） ============
    const [richMenu, setRichMenu] = useState(null);       // null=未載入 {applied, menus}
    const [isMenuBusy, setIsMenuBusy] = useState(false);
    const [menuPreviewUrl, setMenuPreviewUrl] = useState(null);

    const fetchRichMenu = useCallback(async () => {
        try {
            const res = await authFetch('/api/admin/line/richmenu');
            const data = await res.json();
            if (data.success) {
                setRichMenu(data);
                // 抓取套用中選單的圖片預覽（需帶認證,故以 blob 轉 objectURL）
                setMenuPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
                const menuId = data.menus?.[0]?.id;
                if (menuId) {
                    const imgRes = await authFetch(`/api/admin/line/richmenu/image?id=${encodeURIComponent(menuId)}`);
                    if (imgRes.ok) {
                        const blob = await imgRes.blob();
                        setMenuPreviewUrl(URL.createObjectURL(blob));
                    }
                }
            }
        } catch (e) { /* 靜默 */ }
    }, []);

    useEffect(() => { if (subTab === 'account') fetchRichMenu(); }, [subTab, fetchRichMenu]);

    const handleUploadRichMenu = async (file) => {
        if (!file || isMenuBusy) return;
        setIsMenuBusy(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await authFetch('/api/admin/line/richmenu', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '套用失敗');
            showToast('聊天室選單已套用', 'success');
            await fetchRichMenu();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsMenuBusy(false);
        }
    };

    const handleRemoveRichMenu = async () => {
        if (!(await confirm({ title: '移除聊天室選單', message: '所有好友的聊天室底部選單將被移除。', variant: 'danger', confirmLabel: '移除' }))) return;
        setIsMenuBusy(true);
        try {
            const res = await authFetch('/api/admin/line/richmenu', { method: 'DELETE' });
            if (!res.ok) throw new Error('移除失敗');
            showToast('聊天室選單已移除', 'success');
            await fetchRichMenu();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsMenuBusy(false);
        }
    };

    // ============ 聊天室置頂 ============
    const sortUsers = (list) => [...list].sort((a, b) => {
        if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) return a.is_pinned ? -1 : 1;
        return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });
    const handleTogglePin = async (user, e) => {
        e.stopPropagation();
        const next = !user.is_pinned;
        setUsers(prev => sortUsers(prev.map(u => u.line_user_id === user.line_user_id ? { ...u, is_pinned: next } : u)));
        try {
            const res = await authFetch('/api/admin/line/users', {
                method: 'PUT',
                body: JSON.stringify({ lineUserId: user.line_user_id, isPinned: next })
            });
            if (!res.ok) throw new Error('置頂設定失敗');
        } catch (err) {
            showToast(err.message, 'error');
            fetchUsers();
        }
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !selectedUser || isSending) return;
        setIsSending(true);
        try {
            const res = await authFetch('/api/admin/line/send', {
                method: 'POST',
                body: JSON.stringify({ lineUserId: selectedUser.line_user_id, text: replyText.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '發送失敗');
            setReplyText('');
            await fetchMessages(selectedUser.line_user_id);
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSending(false);
        }
    };

    // ============ 平台帳號綁定（綁定後 AI 會參考網頁版對話紀錄） ============
    const [bindOpen, setBindOpen] = useState(false);
    const [bindQuery, setBindQuery] = useState('');
    const [bindResults, setBindResults] = useState([]);
    const [isBindSearching, setIsBindSearching] = useState(false);
    const [isBinding, setIsBinding] = useState(false);

    useEffect(() => {
        if (!bindOpen || bindQuery.trim().length < 1) { setBindResults([]); return; }
        const timer = setTimeout(async () => {
            setIsBindSearching(true);
            try {
                const res = await authFetch(`/api/admin/line/bind?q=${encodeURIComponent(bindQuery.trim())}`);
                const data = await res.json();
                if (data.success) setBindResults(data.users || []);
            } catch (e) { /* ignore */ }
            finally { setIsBindSearching(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [bindOpen, bindQuery]);

    const handleBind = async (userId, profile = null) => {
        if (!selectedUser || isBinding) return;
        setIsBinding(true);
        try {
            const res = await authFetch('/api/admin/line/bind', {
                method: 'POST',
                body: JSON.stringify({ lineUserId: selectedUser.line_user_id, userId })
            });
            if (!res.ok) throw new Error('綁定操作失敗');
            setBindOpen(false); setBindQuery(''); setBindResults([]);
            // 同步更新目前選取的好友與列表
            setSelectedUser(prev => prev ? { ...prev, bound_user_id: userId, bound_profile: profile } : prev);
            await fetchUsers();
            showToast(userId ? '已綁定平台帳號，AI 回覆將一併參考其網頁版對話紀錄' : '已解除綁定', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsBinding(false);
        }
    };
    // ======================================================================

    const handleDeleteConversation = async () => {
        if (!selectedUser) return;
        if (!(await confirm({ title: '刪除對話紀錄', message: `確定要刪除與「${selectedUser.display_name || selectedUser.line_user_id}」的全部對話紀錄嗎？`, variant: 'danger', confirmLabel: '刪除' }))) return;
        try {
            await authFetch(`/api/admin/line/messages?userId=${encodeURIComponent(selectedUser.line_user_id)}`, { method: 'DELETE' });
            setMessages([]);
            showToast('對話紀錄已刪除', 'success');
        } catch (e) {
            showToast('刪除失敗', 'error');
        }
    };

    const saveSetting = async (key, value) => {
        const res = await authFetch('/api/admin/settings', {
            method: 'POST',
            body: JSON.stringify({ key, value: String(value) })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || '儲存失敗');
        }
    };

    const handleSaveCredentials = async () => {
        if (!secretInput.trim() && !tokenInput.trim()) {
            showToast('請至少填寫一項憑證', 'warning');
            return;
        }
        setIsSavingCreds(true);
        try {
            if (secretInput.trim()) await saveSetting('LINE_CHANNEL_SECRET', secretInput.trim());
            if (tokenInput.trim()) await saveSetting('LINE_CHANNEL_ACCESS_TOKEN', tokenInput.trim());
            setSecretInput('');
            setTokenInput('');
            await fetchSettings();
            showToast('LINE 憑證已儲存', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSavingCreds(false);
        }
    };

    const handleToggleAi = async () => {
        setIsTogglingAi(true);
        try {
            await saveSetting('LINE_AI_AUTO_REPLY_ENABLED', aiEnabled ? 'false' : 'true');
            await fetchSettings();
            showToast(`AI 自動回覆已${aiEnabled ? '關閉' : '開啟'}`, 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsTogglingAi(false);
        }
    };

    // --- 回應時間排程：載入 / 儲存 / 工具 ---
    const DAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

    useEffect(() => {
        const raw = getSetting('LINE_AI_REPLY_SCHEDULE')?.value;
        if (!raw) return;
        try {
            const p = JSON.parse(raw);
            setSchedule({ enabled: !!p.enabled, offHoursMessage: p.offHoursMessage || '', days: p.days || {} });
        } catch { /* 壞資料 → 維持預設 */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings]);

    const persistSchedule = async (next) => {
        setIsSavingSchedule(true);
        try {
            await saveSetting('LINE_AI_REPLY_SCHEDULE', JSON.stringify(next));
            setSchedule(next);
            await fetchSettings();
            showToast('回應時間已更新', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSavingSchedule(false);
        }
    };

    const openDayEditor = (day) => {
        setDayRanges((schedule.days?.[day] || []).map(r => ({ ...r })));
        setEditingDay(day);
    };

    const saveDayEditor = async () => {
        const cleaned = dayRanges
            .filter(r => r.start && r.end)
            .map(r => ({ start: r.start, end: r.end }));
        if (cleaned.some(r => toMin(r.end) <= toMin(r.start))) {
            showToast('結束時間必須晚於開始時間', 'warning');
            return;
        }
        cleaned.sort((a, b) => toMin(a.start) - toMin(b.start));
        await persistSchedule({ ...schedule, days: { ...schedule.days, [editingDay]: cleaned } });
        setEditingDay(null);
    };

    const handleCopyWebhook = async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            showToast('複製失敗，請手動複製', 'error');
        }
    };

    const roleBadge = (role) => {
        // AI 與管理員訊息皆顯示於藍色（primary）泡泡上，故徽章需用白底/白字才有足夠對比
        if (role === 'ai') return { label: 'AI', className: 'bg-white/20 text-white' };
        if (role === 'admin') return { label: '管理員', className: 'bg-white text-primary' };
        return null;
    };

    return (
        <div className="space-y-5">
            {/* 標題列（取代 ManageClient 通用標題）：標題 + 狀態徽章在左，子頁籤同高靠右 */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 select-none">
                <div className="min-w-0">
                    <h2 className="text-2xl font-bold text-ink tracking-tight hidden lg:flex items-center gap-2.5">
                        <MessageCircle size={22} className="text-primary" aria-hidden="true" />
                        LINE 管理
                        {isConfigured ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-ok/10 text-ok border border-ok/30">
                                <ShieldCheck className="w-3.5 h-3.5" /> 已設定
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warn/10 text-warn border border-warn/30">
                                <ShieldAlert className="w-3.5 h-3.5" /> 尚未完成設定
                            </span>
                        )}
                    </h2>
                    {/* 行動版只顯示狀態徽章（標題由行動版導覽列提供） */}
                    <div className="lg:hidden">
                        {isConfigured ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-ok/10 text-ok border border-ok/30">
                                <ShieldCheck className="w-3.5 h-3.5" /> 已設定
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warn/10 text-warn border border-warn/30">
                                <ShieldAlert className="w-3.5 h-3.5" /> 尚未完成設定
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex p-1 gap-1 bg-page rounded-xl w-fit flex-shrink-0">
                    {SUB_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all select-none
                                ${subTab === tab.id ? 'bg-surface text-primary shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={subTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* ============ 聊天紀錄 ============ */}
                    {subTab === 'chats' && (
                        <div
                            ref={chatsGridRef}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden"
                            style={chatsGridHeight ? { height: chatsGridHeight } : undefined}
                        >
                            {/* 好友列表 */}
                            <div className="bg-surface rounded-xl border border-line shadow-sm flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                                    <span className="font-semibold text-ink">好友（{users.length}）</span>
                                    <button onClick={fetchUsers} title="重新整理" aria-label="重新整理好友列表"
                                        className="p-2 rounded-lg text-ink-soft hover:text-primary hover:bg-primary-tint transition-colors">
                                        <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto max-h-80 lg:max-h-none">
                                    {users.length === 0 && !isLoadingUsers && (
                                        <p className="text-sm text-ink-soft/60 text-center py-10 px-4">
                                            尚無好友訊息。<br />完成帳號設定後，好友傳訊即會出現在這裡。
                                        </p>
                                    )}
                                    {users.map(user => (
                                        <button
                                            key={user.line_user_id}
                                            onClick={() => handleSelectUser(user)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2
                                                ${selectedUser?.line_user_id === user.line_user_id
                                                    ? 'bg-primary-tint/70 border-primary'
                                                    : 'border-transparent hover:bg-surface-hover'}`}
                                        >
                                            {user.picture_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={user.picture_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center flex-shrink-0">
                                                    <User className="w-5 h-5 text-ink-soft/60" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-ink truncate">{user.display_name || '未知使用者'}</span>
                                                    {user.bound_user_id && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn/10 text-warn border border-warn/30 whitespace-nowrap">
                                                            已綁定{user.bound_profile?.username ? `：${user.bound_profile.username}` : ''}
                                                        </span>
                                                    )}
                                                    {!user.is_followed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-page text-ink-soft">已封鎖</span>}
                                                </div>
                                                <span className="text-xs text-ink-soft/60">{formatTime(user.last_message_at)}</span>
                                            </div>
                                            {user.unread_count > 0 && (
                                                <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">
                                                    {user.unread_count}
                                                </span>
                                            )}
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(e) => handleTogglePin(user, e)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTogglePin(user, e); } }}
                                                aria-label={user.is_pinned ? '取消置頂' : '置頂聊天室'}
                                                title={user.is_pinned ? '取消置頂' : '置頂聊天室'}
                                                className={`p-1.5 rounded-lg transition-colors duration-150 flex-shrink-0
                                                    ${user.is_pinned ? 'text-primary' : 'text-ink-soft/40 hover:text-primary hover:bg-primary-tint/50'}`}
                                            >
                                                <Pin size={14} className={user.is_pinned ? 'fill-current' : ''} aria-hidden="true" />
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 對話視窗 */}
                            <div className="lg:col-span-2 bg-surface rounded-xl border border-line shadow-sm flex flex-col overflow-hidden min-h-[420px]">
                                {!selectedUser ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-ink-soft/60 gap-3 py-16">
                                        <MessageCircle className="w-10 h-10" />
                                        <p className="text-sm">選擇左側好友以檢視對話</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-line relative">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-ink">{selectedUser.display_name || selectedUser.line_user_id}</span>
                                                {selectedUser.bound_user_id ? (
                                                    <>
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/30">
                                                            <Link2 className="w-3 h-3" />
                                                            已綁定：{selectedUser.bound_profile?.username || selectedUser.bound_profile?.student_id || '平台帳號'}
                                                        </span>
                                                        <button onClick={() => handleBind(null)} disabled={isBinding}
                                                            className="text-[11px] text-ink-soft/60 hover:text-rose-600 transition-colors underline-offset-2 hover:underline">
                                                            解除綁定
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setBindOpen(v => !v)}
                                                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-line-strong text-ink-soft hover:border-primary hover:text-primary transition-colors">
                                                        <Link2 className="w-3 h-3" /> 綁定平台帳號
                                                    </button>
                                                )}
                                                {aiEnabled && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary-tint text-primary border border-primary/30">
                                                        <Sparkles className="w-3 h-3" /> AI 自動回覆中
                                                    </span>
                                                )}
                                            </div>

                                            {/* 綁定搜尋 popover */}
                                            {bindOpen && (
                                                <div className="absolute left-4 top-full mt-1 z-30 w-80 bg-surface rounded-xl border border-line shadow-xl p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-bold text-ink-soft">綁定平台使用者</span>
                                                        <button onClick={() => { setBindOpen(false); setBindQuery(''); }} aria-label="關閉綁定視窗"
                                                            className="p-1 rounded text-ink-soft/60 hover:text-ink hover:bg-surface-hover">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft/60" />
                                                        <input
                                                            autoFocus
                                                            value={bindQuery}
                                                            onChange={e => setBindQuery(e.target.value)}
                                                            placeholder="搜尋姓名 / 學號 / Email…"
                                                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-line focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                                        />
                                                    </div>
                                                    <div className="mt-2 max-h-52 overflow-y-auto">
                                                        {isBindSearching && <p className="text-xs text-ink-soft/60 text-center py-3">搜尋中…</p>}
                                                        {!isBindSearching && bindQuery.trim() && bindResults.length === 0 && (
                                                            <p className="text-xs text-ink-soft/60 text-center py-3">查無符合的使用者</p>
                                                        )}
                                                        {bindResults.map(u => (
                                                            <button key={u.id} onClick={() => handleBind(u.id, u)} disabled={isBinding}
                                                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary-tint transition-colors">
                                                                <span className="block text-sm font-medium text-ink">{u.username || '（未設定姓名）'}</span>
                                                                <span className="block text-xs text-ink-soft/60">{[u.student_id, u.email].filter(Boolean).join(' · ')}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="mt-2 text-[11px] text-ink-soft/60 leading-relaxed">
                                                        綁定後，此好友在 LINE 詢問時，AI 會一併參考其在網頁版 AI 助理的對話紀錄。
                                                    </p>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => fetchMessages(selectedUser.line_user_id)} title="重新整理"
                                                    className="p-2 rounded-lg text-ink-soft hover:text-primary hover:bg-primary-tint transition-colors">
                                                    <RefreshCw className={`w-4 h-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />
                                                </button>
                                                <button onClick={handleDeleteConversation} title="刪除對話"
                                                    className="p-2 rounded-lg text-ink-soft hover:text-rose-600 hover:bg-rose-50 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-page/60">
                                            {messages.map(msg => {
                                                const isCustomer = msg.role === 'user';
                                                const badge = roleBadge(msg.role);
                                                return (
                                                    <div key={msg.id} className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
                                                        <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words shadow-sm
                                                            ${isCustomer ? 'bg-surface border border-line text-ink' : 'bg-primary text-white'}`}>
                                                            {badge && (
                                                                <span className={`inline-block mb-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>
                                                                    {badge.label}
                                                                </span>
                                                            )}
                                                            {msg.message_type === 'image' && msg.content?.startsWith('/storage/') ? (
                                                                <a href={msg.content} target="_blank" rel="noopener noreferrer" className="block">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={msg.content} alt="好友傳送的圖片" className="max-w-full max-h-64 rounded-lg object-contain" loading="lazy" />
                                                                </a>
                                                            ) : (
                                                                <p>{msg.content}</p>
                                                            )}
                                                            <p className={`text-[10px] mt-1 ${isCustomer ? 'text-ink-soft/60' : 'text-white/70'}`}>
                                                                {formatTime(msg.created_at)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <div ref={messagesEndRef} />
                                        </div>
                                        <div className="relative p-3 border-t border-line flex items-end gap-2">
                                            {mentionQuery !== null && (
                                                <div className="absolute bottom-full mb-2 left-0 right-0 sm:right-auto sm:w-[26rem] z-30 bg-surface border border-line rounded-xl shadow-xl overflow-hidden">
                                                    <p className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-widest text-ink-soft flex items-center gap-1.5">
                                                        <Megaphone size={11} aria-hidden="true" />插入公告{mentionQuery ? `：「${mentionQuery}」` : ''}
                                                    </p>
                                                    <div className="max-h-64 overflow-y-auto">
                                                        {announcementList === null ? (
                                                            <p className="px-3.5 py-3 text-sm text-ink-soft flex items-center gap-2"><Loader2 size={13} className="animate-spin" />載入公告中…</p>
                                                        ) : mentionMatches.length === 0 ? (
                                                            <p className="px-3.5 py-3 text-sm text-ink-soft">找不到符合的公告</p>
                                                        ) : mentionMatches.map((ann, i) => (
                                                            <button key={ann.id} onClick={() => handleSendAnnouncement(ann)}
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
                                                    <p className="px-3.5 py-1.5 text-[10.5px] text-ink-soft border-t border-line">↑↓ 選擇・Enter 送出・Esc 關閉・點選即寄送公告全文</p>
                                                </div>
                                            )}
                                            <textarea
                                                value={replyText}
                                                onFocus={() => { /* 保持選單邏輯由 onChange 驅動 */ }}
                                                onChange={handleReplyChange}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape' && mentionQuery !== null) { e.preventDefault(); setMentionQuery(null); return; }
                                                    if (mentionQuery !== null && mentionMatches.length > 0) {
                                                        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return; }
                                                        if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                                                        if (e.key === 'Enter') { e.preventDefault(); handleSendAnnouncement(mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)]); return; }
                                                    }
                                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSendReply(); }
                                                }}
                                                placeholder="輸入訊息…（@ 可插入公告、Ctrl / ⌘ + Enter 送出）"
                                                rows={1}
                                                className="flex-1 resize-none rounded-xl border border-line px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                            />
                                            <button
                                                onClick={handleSendReply}
                                                disabled={isSending || !replyText.trim()}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                發送
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ============ AI 自動回覆 ============ */}
                    {subTab === 'ai' && (
                        <div className="bg-surface rounded-xl border border-line shadow-sm p-6 space-y-6">
                            <div className="flex items-start justify-between gap-6">
                                <div>
                                    <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                                        <Bot className="w-5 h-5 text-primary" /> AI 自動回覆
                                    </h3>
                                    <p className="text-sm text-ink-soft mt-2 leading-relaxed max-w-2xl">
                                        好友的每則文字訊息都會由 <strong className="text-ink">AI 獎學金助理</strong>（自建 Gemini Agent，與網頁版共用同一套公告知識庫）
                                        自動回覆專業內容。關閉時，好友訊息仍會進入聊天紀錄，可由管理員親自回覆。
                                    </p>
                                </div>
                                <button
                                    onClick={handleToggleAi}
                                    disabled={isTogglingAi}
                                    role="switch"
                                    aria-checked={aiEnabled}
                                    aria-label="切換 AI 自動回覆"
                                    className={`relative w-14 h-8 rounded-full transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                                        ${aiEnabled ? 'bg-primary' : 'bg-line-strong/50'} ${isTogglingAi ? 'opacity-60' : ''}`}
                                >
                                    <span className={`absolute top-1 w-6 h-6 rounded-full bg-surface shadow transition-all ${aiEnabled ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                            <div className="rounded-xl bg-primary-tint/60 border border-primary/20 p-4 text-sm text-primary/80 leading-relaxed">
                                <p className="font-semibold mb-1.5">AI 回覆原則（系統固定）</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>回答前必先檢索公告知識庫，不憑空編造獎學金資訊</li>
                                    <li>查無資料時，引導學生聯繫生輔組（act5718@gmail.com）</li>
                                    <li>推薦公告時附上平台完整連結與截止日期</li>
                                    <li>與獎助學金無關的問題會禮貌婉拒</li>
                                </ul>
                            </div>
                            <p className="text-xs text-ink-soft/60">
                                知識庫在「公告建立 / 更新的當下」即自動整理為 AI 易讀內容；公告刪除或下架時條目會自動移除，並由每日排程校正，確保知識庫不會累積過期資料。
                            </p>

                            {/* ---- 回應時間（參考 LINE 官方後台）---- */}
                            <div className="border-t border-line pt-6 space-y-4">
                                <div className="flex items-start justify-between gap-6">
                                    <div>
                                        <h4 className="text-sm font-bold text-ink flex items-center gap-2">使用回應時間功能</h4>
                                        <p className="text-xs text-ink-soft mt-1.5 leading-relaxed max-w-2xl">
                                            啟用後，AI 只在下方設定的時段內自動回覆（時區：Asia/Taipei）。非回應時間的訊息仍會存入聊天紀錄，可由管理員親自回覆。點擊各天的條狀時間表即可編輯時段。
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => persistSchedule({ ...schedule, enabled: !schedule.enabled })}
                                        disabled={isSavingSchedule}
                                        role="switch"
                                        aria-checked={schedule.enabled}
                                        aria-label="切換回應時間功能"
                                        className={`relative w-14 h-8 rounded-full transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                                            ${schedule.enabled ? 'bg-primary' : 'bg-line-strong/50'} ${isSavingSchedule ? 'opacity-60' : ''}`}
                                    >
                                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-surface shadow transition-all ${schedule.enabled ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>

                                {schedule.enabled && (
                                    <>
                                        {/* 時間刻度 */}
                                        <div className="pl-12 pr-1 flex justify-between text-[10.5px] text-ink-soft/70 tabular-nums select-none">
                                            {['00:00', '06:00', '12:00', '18:00', '24:00'].map(t => <span key={t}>{t}</span>)}
                                        </div>
                                        {/* 週時段表 */}
                                        <div className="space-y-1.5">
                                            {DAY_LABELS.map((label, day) => (
                                                <div key={day} className="flex items-center gap-3">
                                                    <span className="w-9 text-xs font-semibold text-ink-soft select-none">{label}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => openDayEditor(day)}
                                                        aria-label={`編輯${label}的回應時間`}
                                                        className="relative flex-1 h-7 rounded-md bg-page border border-line overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                                                    >
                                                        {[360, 720, 1080].map(m => (
                                                            <span key={m} className="absolute top-0 bottom-0 w-px bg-line/70" style={{ left: `${(m / 1440) * 100}%` }} />
                                                        ))}
                                                        {(schedule.days?.[day] || []).map((r, i) => (
                                                            <span
                                                                key={i}
                                                                className="absolute top-0 bottom-0 bg-ok-bright/90 rounded-sm"
                                                                style={{
                                                                    left: `${(toMin(r.start) / 1440) * 100}%`,
                                                                    width: `${Math.max(0, (toMin(r.end) - toMin(r.start)) / 1440) * 100}%`,
                                                                }}
                                                            />
                                                        ))}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-end gap-4 text-[11px] text-ink-soft select-none">
                                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-ok-bright" />回應時間</span>
                                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-page border border-line" />非回應時間</span>
                                        </div>
                                        {/* 非回應時間提示訊息 */}
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1.5">非回應時間提示訊息（選填，留空則不回覆）</label>
                                            <textarea
                                                value={schedule.offHoursMessage}
                                                onChange={e => setSchedule(s => ({ ...s, offHoursMessage: e.target.value }))}
                                                onBlur={() => {
                                                    const saved = (() => { try { return JSON.parse(getSetting('LINE_AI_REPLY_SCHEDULE')?.value || '{}').offHoursMessage || ''; } catch { return ''; } })();
                                                    if (schedule.offHoursMessage !== saved) persistSchedule(schedule);
                                                }}
                                                rows={2}
                                                placeholder="例如：目前為非服務時間，AI 助理將於每日 09:00–22:00 為您服務，您的訊息已收到。"
                                                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 單日時段編輯 Modal */}
                            <AnimatePresence>
                                {editingDay !== null && (
                                    <motion.div
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                                        onClick={() => setEditingDay(null)}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.95, y: 12, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 12, opacity: 0 }}
                                            transition={{ duration: 0.18 }}
                                            className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md p-5 cursor-default"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="text-base font-bold text-ink">{DAY_LABELS[editingDay]}</h4>
                                                <button onClick={() => setEditingDay(null)} aria-label="關閉" className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors">
                                                    <X size={18} />
                                                </button>
                                            </div>
                                            <div className="space-y-2.5">
                                                {dayRanges.length === 0 && (
                                                    <p className="text-sm text-ink-soft py-2">此日無回應時段（AI 整天不回覆）</p>
                                                )}
                                                {dayRanges.map((r, i) => (
                                                    <div key={i} className="flex items-center gap-2.5">
                                                        <input
                                                            type="time" value={r.start}
                                                            onChange={e => setDayRanges(rs => rs.map((x, xi) => xi === i ? { ...x, start: e.target.value } : x))}
                                                            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                                        />
                                                        <span className="text-ink-soft">~</span>
                                                        <input
                                                            type="time" value={r.end}
                                                            onChange={e => setDayRanges(rs => rs.map((x, xi) => xi === i ? { ...x, end: e.target.value } : x))}
                                                            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                                        />
                                                        <button
                                                            onClick={() => setDayRanges(rs => rs.filter((_, xi) => xi !== i))}
                                                            aria-label="刪除時段"
                                                            className="p-2 rounded-lg text-ink-soft hover:text-danger hover:bg-danger/10 transition-colors"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => setDayRanges(rs => [...rs, { start: '09:00', end: '17:00' }])}
                                                className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold text-primary border border-dashed border-primary/40 hover:bg-primary-tint transition-colors"
                                            >
                                                ＋ 新增時段
                                            </button>
                                            <div className="mt-5 flex justify-end gap-2.5">
                                                <button onClick={() => setEditingDay(null)}
                                                    className="px-5 py-2 rounded-lg text-sm font-semibold text-ink border border-line-strong hover:bg-surface-hover transition-colors">
                                                    關閉
                                                </button>
                                                <button onClick={saveDayEditor} disabled={isSavingSchedule}
                                                    className="px-5 py-2 rounded-lg text-sm font-semibold border border-primary bg-primary text-white dark:text-[#10151B] hover:bg-primary-hover transition-colors disabled:opacity-60">
                                                    {isSavingSchedule ? '儲存中…' : '儲存'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* ============ 帳號設定 ============ */}
                    {subTab === 'account' && (
                        <div className="bg-surface rounded-xl border border-line shadow-sm p-6 space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-ink">LINE 官方帳號</h3>
                                <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                                    連上你的 LINE 官方帳號：好友訊息自動存入資料庫、AI 自動回覆、公告 LINE 廣播共用同一組憑證。
                                </p>
                            </div>

                            {/* Webhook URL */}
                            <div>
                                <label className="block text-sm font-semibold text-ink mb-2">
                                    Webhook URL（貼到 LINE Developers Console → Messaging API → Webhook URL）
                                </label>
                                {/* 點擊整個框即複製：外框轉綠 + 打勾圖示回饋 */}
                                <button
                                    type="button"
                                    onClick={handleCopyWebhook}
                                    title="點擊複製"
                                    aria-label="複製 Webhook URL"
                                    className={`w-full flex items-center gap-3 text-left rounded-lg px-4 py-3 border transition-colors duration-200 cursor-pointer group
                                        ${copied
                                            ? 'border-ok bg-ok/5'
                                            : 'bg-page border-line hover:border-primary/50 hover:bg-primary-tint/30'}`}
                                >
                                    <code className="flex-1 text-sm text-ink overflow-x-auto whitespace-nowrap bg-transparent">
{webhookUrl}
                                    </code>
                                    {copied ? (
                                        <Check className="w-4 h-4 text-ok flex-shrink-0" aria-hidden="true" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-ink-soft/50 group-hover:text-primary flex-shrink-0 transition-colors" aria-hidden="true" />
                                    )}
                                </button>
                            </div>

                            {/* 憑證輸入 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-ink mb-2">Channel secret</label>
                                    <input
                                        type="password"
                                        value={secretInput}
                                        onChange={e => setSecretInput(e.target.value)}
                                        placeholder={secretSet ? '已儲存（填寫即覆蓋）' : '請輸入 Channel secret'}
                                        autoComplete="off"
                                        className="w-full rounded-lg border border-line px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-ink mb-2">Channel access token</label>
                                    <input
                                        type="password"
                                        value={tokenInput}
                                        onChange={e => setTokenInput(e.target.value)}
                                        placeholder={tokenSet ? '已儲存（填寫即覆蓋）' : '請輸入 long-lived access token'}
                                        autoComplete="off"
                                        className="w-full rounded-lg border border-line px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                    />
                                </div>
                            </div>

                            <ol className="text-xs text-ink-soft space-y-1.5 leading-relaxed list-none">
                                <li>① Channel secret 在官方帳號後台「設定 → Messaging API」；access token 到
                                    <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer"
                                        className="text-primary hover:underline inline-flex items-center gap-0.5 mx-1">
                                        LINE Developers Console <ExternalLink className="w-3 h-3" />
                                    </a>
                                    該 channel 的 Messaging API 分頁最下方發行（long-lived）。
                                </li>
                                <li>② 憑證儲存於系統設定，僅在填寫時更新，畫面上不會回顯完整內容。</li>
                                <li>③ 記得在 LINE 官方帳號後台「回應設定」關閉自動回應、啟用 Webhook，官方罐頭訊息才不會跟系統衝突。</li>
                            </ol>

                            <div className="flex justify-end">
                                <button
                                    onClick={handleSaveCredentials}
                                    disabled={isSavingCreds || (!secretInput.trim() && !tokenInput.trim())}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isSavingCreds ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                    儲存設定
                                </button>
                            </div>

                            {/* 聊天室底部選單（Rich Menu） */}
                            <div className="border-t border-line pt-5 mt-2">
                                <div className="flex flex-wrap items-center gap-3 mb-3">
                                    <span className="p-1.5 bg-primary-tint rounded-lg"><LayoutGrid className="w-4 h-4 text-primary" /></span>
                                    <h4 className="text-sm font-bold text-ink flex-1">聊天室底部選單圖片</h4>
                                    {richMenu?.applied ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-ok/10 text-ok border border-ok/30">已套用</span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-page text-ink-soft border border-line">未設定</span>
                                    )}
                                </div>
                                <p className="text-xs text-ink-soft leading-relaxed mb-3">
                                    好友聊天室底部的圖文選單。尺寸 <b className="text-ink">2500×1686</b>（四格：平台／LINE 社群／生輔組／開發維護）或
                                    <b className="text-ink"> 2500×843</b>（三格），PNG / JPEG ≤ 1MB；上傳後自動汰換舊選單並套用給所有好友。
                                </p>
                                <div className="flex flex-wrap items-center gap-2.5">
                                    {richMenu?.menus?.[0] && (
                                        <span className="text-[11.5px] text-ink-soft tabular-nums">目前:{richMenu.menus[0].width}×{richMenu.menus[0].height}</span>
                                    )}
                                    <div className="flex items-center gap-2.5 ml-auto">
                                        {richMenu?.applied && (
                                            <button onClick={handleRemoveRichMenu} disabled={isMenuBusy}
                                                className="px-4 py-2 rounded-lg border border-danger/30 text-sm font-medium text-danger hover:bg-danger/10 transition-colors duration-150 disabled:opacity-50">
                                                移除選單
                                            </button>
                                        )}
                                        <label className={`flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 cursor-pointer ${isMenuBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                                            <input type="file" accept="image/png,image/jpeg" className="sr-only"
                                                onChange={e => { handleUploadRichMenu(e.target.files?.[0]); e.target.value = ''; }} />
                                            {isMenuBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                                            上傳並套用
                                        </label>
                                    </div>
                                </div>
                                {menuPreviewUrl && (
                                    <div className="mt-4 flex flex-col items-center">
                                        <p className="text-[11px] font-semibold tracking-widest text-ink-soft mb-2">目前套用的選單預覽</p>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={menuPreviewUrl} alt="LINE 聊天室底部選單預覽"
                                            className="w-full max-w-lg rounded-xl border border-line" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={hideToast} />
        </div>
    );
}
