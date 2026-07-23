"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { deriveStudentIdFromEmail } from "@/lib/studentId";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
    User as UserIcon, Edit3, Save, LogOut, Loader2, Fingerprint, Calendar, Clock,
    FileText, GraduationCap, AlertCircle, Trash2, Bell, ShieldCheck
} from "lucide-react";
import Toast from '@/components/ui/Toast';
import LineBindingCard from '@/components/LineBindingCard';
import SubscriptionManager from '@/components/SubscriptionManager';
import ConfirmByTypingModal from '@/components/ui/ConfirmByTypingModal';
import { authFetch } from '@/lib/authFetch';

const TABS = [
    { id: 'profile', label: '個人資料', icon: FileText },
    { id: 'notifications', label: '訂閱與通知', icon: Bell },
    { id: 'security', label: '帳號安全', icon: ShieldCheck },
];

/**
 * 個資管理 — 分頁式版面
 * 個人資料 / 訂閱與通知（截止提醒 + LINE 綁定）/ 帳號安全（狀態、登入紀錄、註銷）
 */
export default function ProfilePage() {
    const router = useRouter();
    const { user, isAuthenticated, isAdmin, loading, signOut, updateProfile, deleteAccount } = useAuth();

    const [activeTab, setActiveTab] = useState('profile');
    const [formData, setFormData] = useState({ name: "", student_id: "" });

    // 姓名 inline 編輯：點文字即改為輸入框，離焦（onBlur）自動儲存，無獨立儲存按鈕
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);
    const nameInputRef = useRef(null);
    const skipCommitRef = useRef(false);

    // 註銷帳戶狀態
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // 登入紀錄狀態
    const [loginHistory, setLoginHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => setToast({ show: true, message, type });

    const needsCompletion = useMemo(() => user?.needsProfileCompletion, [user]);

    // 學號由學校信箱自動推導；校內信箱首次登入時自動補寫入 profile
    const derivedStudentId = useMemo(() => deriveStudentIdFromEmail(user?.email), [user?.email]);

    // 校外信箱登入者：校信箱驗證碼綁定學號
    const [schoolEmail, setSchoolEmail] = useState('');
    const [schoolCode, setSchoolCode] = useState('');
    const [schoolCodeSent, setSchoolCodeSent] = useState(false);
    const [isSchoolBusy, setIsSchoolBusy] = useState(false);

    const handleSendSchoolCode = async () => {
        setIsSchoolBusy(true);
        try {
            const res = await authFetch('/api/verify-school-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send', email: schoolEmail }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '寄送失敗');
            setSchoolCodeSent(true);
            showToast(data.message, 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSchoolBusy(false);
        }
    };

    const handleConfirmSchoolCode = async () => {
        setIsSchoolBusy(true);
        try {
            const res = await authFetch('/api/verify-school-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'confirm', code: schoolCode }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '驗證失敗');
            showToast(data.message, 'success');
            setTimeout(() => window.location.reload(), 1200);
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSchoolBusy(false);
        }
    };
    // AI 背景資料
    const [aiBackground, setAiBackground] = useState('');
    const [savedBackground, setSavedBackground] = useState('');
    const [isSavingBackground, setIsSavingBackground] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) return;
        authFetch('/api/users/background')
            .then(r => r.json())
            .then(d => { if (d.success) { setAiBackground(d.background); setSavedBackground(d.background); } })
            .catch(() => {});
    }, [isAuthenticated]);

    const handleSaveBackground = async () => {
        setIsSavingBackground(true);
        try {
            const res = await authFetch('/api/users/background', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ background: aiBackground }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '儲存失敗');
            setSavedBackground(aiBackground);
            showToast(data.message, 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSavingBackground(false);
        }
    };

    const autoHealRef = useRef(false);
    useEffect(() => {
        if (autoHealRef.current) return;
        if (user && derivedStudentId && !user?.profile?.student_id) {
            autoHealRef.current = true;
            updateProfile({ student_id: derivedStudentId }).catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, derivedStudentId]);

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, loading, router]);

    const fetchLoginHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const response = await authFetch('/api/users/login-log');
            if (response.ok) {
                const data = await response.json();
                setLoginHistory(data.history || []);
            }
        } catch (error) {
            console.error("Failed to fetch login history:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (user?.user_metadata || user?.profile) {
            setFormData({
                name: user?.profile?.username || user?.user_metadata?.name || "",
                student_id: user?.profile?.student_id || user?.user_metadata?.student_id || "",
            });
            // 如果需要補全資料，鎖定在個人資料分頁（校信箱驗證 UI 會顯示於學號欄）
            if (user?.needsProfileCompletion) {
                setActiveTab('profile');
            }
            fetchLoginHistory();
        }
    }, [user]);

    const formatDateTime = (isoString) => {
        if (!isoString) return "未知";
        return new Date(isoString).toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
    };

    const beginEditName = () => {
        setNameDraft(formData.name || '');
        setEditingName(true);
    };

    const cancelEditName = () => {
        // Esc：不儲存，直接離開（onBlur 隨後觸發的 commit 由 skipCommitRef 略過）
        skipCommitRef.current = true;
        setEditingName(false);
    };

    // 離焦自動儲存：無變更或空白則不送出；學號由學校信箱推導，維持不變
    const commitName = async () => {
        if (skipCommitRef.current) { skipCommitRef.current = false; return; }
        const newName = nameDraft.trim();
        setEditingName(false);
        if (!newName || newName === (formData.name || '')) return;

        setIsSavingName(true);
        setFormData(prev => ({ ...prev, name: newName })); // 樂觀更新
        const result = await updateProfile({
            name: newName,
            student_id: derivedStudentId || user?.profile?.student_id || null,
        });
        if (result.success) {
            showToast('姓名已更新', 'success');
        } else {
            showToast(result.error || '更新失敗，請稍後再試', 'error');
            setFormData(prev => ({ ...prev, name: user?.profile?.username || user?.user_metadata?.name || '' }));
        }
        setIsSavingName(false);
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        const result = await deleteAccount();
        if (result.success) {
            showToast('帳戶已註銷，期待再次與您相見', 'success');
            setTimeout(() => router.push('/'), 2000);
        } else {
            showToast(result.error || '註銷失敗，請聯繫系統管理員', 'error');
            setIsDeleting(false);
        }
    };

    if (loading || !isAuthenticated) {
        return (
            <div className="flex items-center justify-center p-4 min-h-[400px]">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
        );
    }

    const isGoogleUser = user?.app_metadata?.provider === 'google';

    return (
        <>
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast(p => ({ ...p, show: false }))} />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 my-10 sm:my-14 select-none">

                {needsCompletion && (
                    <div className="mb-6 p-4 bg-warn/10 border border-warn/30 rounded-xl flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-warn shrink-0 mt-0.5" aria-hidden="true" />
                        <div>
                            <h3 className="text-warn font-bold text-sm">請完成基本資料設定</h3>
                            <p className="text-[13px] text-ink-soft mt-0.5">歡迎使用 Google 登入！為了確保您能正常使用獎學金申請功能，請先填寫您的「學號」資訊。</p>
                        </div>
                    </div>
                )}

                {/* 身分卡（恆顯示） */}
                <div className="bg-surface rounded-xl border border-line px-5 sm:px-6 py-5 flex flex-wrap items-center gap-4 mb-5">
                    {user?.profile?.avatar_url || user?.user_metadata?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={user?.profile?.avatar_url || user?.user_metadata?.avatar_url}
                            alt="Avatar"
                            className="h-14 w-14 rounded-full border border-line"
                        />
                    ) : (
                        <div className="h-14 w-14 rounded-full bg-primary-tint flex items-center justify-center flex-shrink-0">
                            <UserIcon className="h-7 w-7 text-primary" aria-hidden="true" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold text-ink truncate">{formData.name || '使用者'}</h1>
                        <p className="text-sm text-ink-soft truncate">{user.email}</p>
                    </div>
                    {isGoogleUser && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary-tint text-primary">Google 帳號</span>
                    )}
                    <button onClick={signOut}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors duration-150">
                        <LogOut className="h-4 w-4" aria-hidden="true" />登出
                    </button>
                </div>

                {/* 分頁列 */}
                <nav className="flex gap-2 overflow-x-auto pb-1 mb-5" aria-label="個資管理分頁">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => !needsCompletion && setActiveTab(tab.id)}
                            disabled={needsCompletion && tab.id !== 'profile'}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                            className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-150
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40
                                ${activeTab === tab.id
                                    ? 'bg-primary-tint text-primary border-primary/40 font-semibold'
                                    : 'bg-surface text-ink-soft border-line hover:text-ink hover:bg-surface-hover'}`}
                        >
                            <tab.icon size={15} aria-hidden="true" />{tab.label}
                        </button>
                    ))}
                </nav>

                {/* ===== 個人資料 ===== */}
                {activeTab === 'profile' && (
                    <div className="bg-surface rounded-xl border border-line overflow-hidden">
                        <div>
                            <div className="px-5 sm:px-6 pt-5 pb-2">
                                <h2 className="text-base font-bold text-ink flex items-center gap-2.5">
                                    <span className="p-1.5 bg-primary-tint rounded-lg"><FileText className="h-4 w-4 text-primary" /></span>
                                    個人資料
                                </h2>
                                <p className="mt-1.5 text-[13px] text-ink-soft">請確保您提供的是正確的個人資料。</p>
                            </div>

                            <div className="px-5 sm:px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 姓名：點文字即改為輸入框，離開欄位自動儲存 */}
                                <div className="flex flex-col">
                                    <dt className="text-sm font-medium text-ink-soft flex items-center gap-2"><UserIcon size={15} className="text-primary" />姓名</dt>
                                    {editingName ? (
                                        <input
                                            ref={nameInputRef}
                                            autoFocus
                                            value={nameDraft}
                                            maxLength={30}
                                            onChange={e => setNameDraft(e.target.value)}
                                            onFocus={e => e.target.select()}
                                            onBlur={commitName}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                                                else if (e.key === 'Escape') { e.preventDefault(); cancelEditName(); }
                                            }}
                                            placeholder="請輸入您的姓名"
                                            className="mt-1 block w-full max-w-xs rounded-lg border border-primary bg-surface py-2 px-3 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-150"
                                        />
                                    ) : (
                                        <button type="button" onClick={beginEditName} title="點擊以修改姓名"
                                            className="group mt-1 inline-flex items-center gap-1.5 w-fit text-base text-ink text-left hover:text-primary transition-colors cursor-text">
                                            <span>{formData.name || '未設定'}</span>
                                            {isSavingName
                                                ? <Loader2 size={13} className="animate-spin text-ink-soft" />
                                                : <Edit3 size={13} className="text-ink-soft/50 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                        </button>
                                    )}
                                    <p className="text-[11px] text-ink-soft/70 mt-1">點擊姓名即可修改</p>
                                </div>
                                <div className="flex flex-col">
                                    <dt className="text-sm font-medium text-ink-soft flex items-center gap-2"><GraduationCap size={15} className="text-primary" />學號</dt>
                                    {(derivedStudentId || user?.profile?.student_id) ? (
                                        <>
                                            <dd className="text-base text-ink mt-1" translate="no">{derivedStudentId || user?.profile?.student_id}</dd>
                                            <p className="text-[11px] text-ink-soft/70 mt-1">由學校信箱自動判定，無法手動修改</p>
                                        </>
                                    ) : (
                                        <div className="mt-1.5 space-y-2">
                                            <p className="text-[12px] text-ink-soft leading-relaxed">您以校外信箱登入。如需綁定學號，請輸入學校信箱進行驗證：</p>
                                            {!schoolCodeSent ? (
                                                <div className="flex gap-2">
                                                    <input
                                                        value={schoolEmail}
                                                        onChange={e => setSchoolEmail(e.target.value)}
                                                        placeholder="s1234567@mail.ncue.edu.tw 或 @gm.ncue.edu.tw"
                                                        className="flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                                    />
                                                    <button type="button" onClick={handleSendSchoolCode} disabled={isSchoolBusy}
                                                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-primary/40 text-primary hover:bg-primary-tint transition-colors disabled:opacity-50 whitespace-nowrap">
                                                        {isSchoolBusy ? '寄送中…' : '寄送驗證碼'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <input
                                                        value={schoolCode}
                                                        onChange={e => setSchoolCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                        inputMode="numeric" placeholder="6 位數驗證碼"
                                                        className="flex-1 rounded-lg border border-line px-3 py-2 text-sm tracking-[0.2em] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                                    />
                                                    <button type="button" onClick={handleConfirmSchoolCode} disabled={isSchoolBusy || schoolCode.length !== 6}
                                                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-primary bg-primary text-white dark:text-[#10151B] hover:bg-primary-hover transition-colors disabled:opacity-50 whitespace-nowrap">
                                                        {isSchoolBusy ? '驗證中…' : '確認綁定'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ===== AI 背景資料 ===== */}
                        <div className="bg-surface rounded-xl border border-line overflow-hidden mt-5">
                            <div className="px-5 sm:px-6 py-4 border-b border-line">
                                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                                    <FileText size={15} className="text-primary" />AI 背景資料
                                </h3>
                                <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed">
                                    填寫您的背景（身分別、系所年級、家庭狀況、需求等），AI 獎學金助理在<strong className="text-ink">每次對話</strong>（含 LINE）都會自動參考，不必重複自我介紹。僅用於推薦合適獎學金，可隨時修改或清空；詳見<a href="/terms-and-privacy" target="_blank" className="text-primary hover:underline">隱私權政策</a>。
                                </p>
                            </div>
                            <div className="p-5 sm:p-6 space-y-3">
                                <textarea
                                    value={aiBackground}
                                    onChange={e => setAiBackground(e.target.value.slice(0, 1000))}
                                    rows={4}
                                    placeholder="例如：資工系大二、低收入戶、設籍彰化，想找不限系所的清寒獎學金；成績平均約 90 分。"
                                    className="w-full rounded-xl border border-line px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none [field-sizing:content] min-h-28"
                                />
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-ink-soft/60 tabular-nums">{aiBackground.length}/1000</span>
                                    <button type="button" onClick={handleSaveBackground} disabled={isSavingBackground || aiBackground === savedBackground}
                                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary border border-primary/40 rounded-lg hover:bg-primary-tint transition-colors duration-150 disabled:opacity-50">
                                        {isSavingBackground ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}儲存背景資料
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== 訂閱與通知 ===== */}
                {activeTab === 'notifications' && (
                    <div className="space-y-5">
                        <SubscriptionManager showToast={showToast} />
                        <div className="bg-surface rounded-xl border border-line overflow-hidden [&>div]:border-t-0">
                            <LineBindingCard showToast={showToast} />
                        </div>
                    </div>
                )}

                {/* ===== 帳號安全 ===== */}
                {activeTab === 'security' && (
                    <div className="space-y-5">
                        {/* 帳號狀態 */}
                        <div className="bg-surface rounded-xl border border-line px-5 sm:px-6 py-5">
                            <h3 className="text-base font-bold text-ink mb-4 flex items-center gap-2.5">
                                <span className="p-1.5 bg-primary-tint rounded-lg"><Fingerprint className="h-4 w-4 text-primary" /></span>
                                帳號狀態
                            </h3>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><dt className="text-xs font-medium text-ink-soft flex items-center gap-1.5"><Calendar size={13} />註冊時間</dt><dd className="text-sm text-ink mt-1">{new Date(user.created_at).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}</dd></div>
                                {user.last_sign_in_at && <div><dt className="text-xs font-medium text-ink-soft flex items-center gap-1.5"><Clock size={13} />最後登入</dt><dd className="text-sm text-ink mt-1">{new Date(user.last_sign_in_at).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>}
                            </dl>
                        </div>

                        {/* 登入紀錄 */}
                        <div className="bg-surface rounded-xl border border-line overflow-hidden">
                            <div className="px-5 sm:px-6 py-4 border-b border-line flex items-center justify-between">
                                <h3 className="text-base font-bold text-ink flex items-center gap-2.5">
                                    <span className="p-1.5 bg-primary-tint rounded-lg"><Clock className="h-4 w-4 text-primary" /></span>
                                    最近登入紀錄
                                </h3>
                                <button
                                    onClick={fetchLoginHistory}
                                    disabled={isLoadingHistory}
                                    className="text-xs font-semibold text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 hover:bg-primary-tint transition-colors duration-150 disabled:opacity-50"
                                >
                                    {isLoadingHistory && <Loader2 size={11} className="animate-spin" />}重新整理
                                </button>
                            </div>

                            <div className="w-full overflow-x-auto custom-scrollbar">
                                {loginHistory.length > 0 ? (
                                    <table className="w-full text-sm text-left border-collapse min-w-full">
                                        <thead className="bg-page/70 text-ink-soft">
                                            <tr>
                                                <th className="px-5 sm:px-6 py-2.5 font-semibold text-xs whitespace-nowrap">登入時間 (UTC+8)</th>
                                                <th className="px-5 sm:px-6 py-2.5 font-semibold text-xs text-right whitespace-nowrap">來源 IP 地址</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {loginHistory.map((record, index) => (
                                                <tr key={index} className="hover:bg-surface-hover transition-colors duration-150">
                                                    <td className="px-5 sm:px-6 py-3 text-ink tabular-nums whitespace-nowrap text-[13px]">{formatDateTime(record.login_at)}</td>
                                                    <td className="px-5 sm:px-6 py-3 text-right font-mono text-ink-soft text-xs whitespace-nowrap">{record.ip_address}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="p-10 text-center text-ink-soft">
                                        {isLoadingHistory ? (
                                            <><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />載入登入紀錄中...</>
                                        ) : (
                                            <><Fingerprint className="h-10 w-10 mx-auto mb-2 text-ink-soft/40" /><p className="text-sm">尚無登入紀錄</p></>
                                        )}
                                    </div>
                                )}
                            </div>
                            <p className="px-5 sm:px-6 py-3 bg-page/50 border-t border-line text-[11px] text-ink-soft">
                                系統僅顯示最近 10 筆登入活動。若發現異常 IP 登入，請立即聯繫系統管理員。
                            </p>
                        </div>

                        {/* 註銷 Danger Zone */}
                        {!needsCompletion && !isAdmin && (
                            <div className="bg-surface rounded-xl border border-danger/30 px-5 sm:px-6 py-5">
                                <h3 className="text-danger font-bold text-base flex items-center gap-2.5 mb-2">
                                    <span className="p-1.5 bg-danger/10 rounded-lg"><Trash2 className="h-4 w-4 text-danger" /></span>
                                    帳號註銷
                                </h3>
                                <p className="text-[13px] text-ink-soft mb-4 leading-relaxed">
                                    註銷後將刪除您的所有個人資料與對話紀錄，此操作不可逆，請謹慎執行。
                                </p>
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-4 py-2 text-sm font-semibold text-danger border border-danger/40 rounded-lg hover:bg-danger/10 transition-colors duration-150"
                                >
                                    註銷此帳戶
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 註銷確認（打字確認共用模組） */}
            <ConfirmByTypingModal
                isOpen={showDeleteConfirm}
                title="確定要註銷帳戶嗎？"
                description="這項動作將會永久刪除您的所有資料、對話紀錄及設定，且無法恢復。"
                keyword="註銷帳戶"
                confirmLabel="確認註銷"
                isBusy={isDeleting}
                onConfirm={handleDeleteAccount}
                onClose={() => !isDeleting && setShowDeleteConfirm(false)}
            />
        </>
    );
}
