'use client';

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';
import Toast from '@/components/ui/Toast';
import { Save, RefreshCw, Key, AlertCircle, Database, Server, X, MessageSquare, BrainCircuit, Sparkles } from 'lucide-react';
import UsageMonitor from './UsageMonitor';

const SETTING_LABELS = {
    'GEMINI_API_KEY': 'Google Gemini API Key (Server-side)',
    'SERP_API_KEY': 'SerpApi Key (Server-side)',
    'NEXT_PUBLIC_TINYMCE_API_KEY': 'TinyMCE API Key (Client-side)',
    'GCP_SERVICE_ACCOUNT_JSON': 'GCP Service Account JSON (Server-side)',
    'AI_ASSISTANT_ENABLED': 'AI 獎助學金助理'
};

const SETTING_DESCRIPTIONS = {
    'GEMINI_API_KEY': '用於驅動 AI 聊天機器人與公告摘要生成功能。此金鑰僅存於伺服器端。',
    'SERP_API_KEY': '用於 Google 搜尋增強功能，讓 AI 能檢索外部獎學金資訊。',
    'NEXT_PUBLIC_TINYMCE_API_KEY': '用於富文字編輯器 (TinyMCE) 的授權驗證。',
    'GCP_SERVICE_ACCOUNT_JSON': '用於監控 GCP Gemini API 使用量與金額。請貼上完整的 Service Account Key JSON 內容。',
    'AI_ASSISTANT_ENABLED': '控制平台上「AI 獎助學金助理」功能是否對使用者開放。關閉後將停止所有相關 API 請求。'
};

const StatusBadge = ({ isSet, source }) => {
    if (!isSet) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger/10 text-danger select-none border border-danger/30">
                <AlertCircle size={11} aria-hidden="true" />未設定
            </span>
        );
    }
    if (source === 'database') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ok/10 text-ok select-none border border-ok/30">
                <Database size={11} aria-hidden="true" />資料庫設定
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warn/10 text-warn select-none border border-warn/30">
            <Server size={11} aria-hidden="true" />環境變數
        </span>
    );
};

/**
 * 系統設定：維護操作 / 功能開關 / API 金鑰 三區塊
 * 設定值儲存於 system_config（資料庫優先於環境變數）
 */
export default function SettingsTab() {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [editingKey, setEditingKey] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [isSyncingKnowledge, setIsSyncingKnowledge] = useState(false);

    const showToast = (message, type = 'success') => setToast({ show: true, message, type });
    const hideToast = () => setToast(prev => ({ ...prev, show: false }));

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const response = await authFetch('/api/admin/settings');
            const data = await response.json();
            if (response.ok) {
                // LINE 憑證由「LINE 管理」分頁專屬管理，此處不重複顯示
                setSettings((data.settings || []).filter(s => SETTING_LABELS[s.key]));
            } else {
                showToast(data.error || '無法載入設定', 'error');
            }
        } catch (error) {
            showToast('載入設定時發生錯誤', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleEdit = (key) => {
        setEditingKey(key);
        setEditValue('');
    };

    const handleCancel = () => {
        setEditingKey(null);
        setEditValue('');
    };

    const handleSave = async (key, value) => {
        const valToSave = value !== undefined ? value : editValue.trim();
        if (key !== 'AI_ASSISTANT_ENABLED' && !valToSave) {
            showToast('請輸入有效的內容', 'warning');
            return;
        }

        setSaving(true);
        try {
            const response = await authFetch('/api/admin/settings', {
                method: 'POST',
                body: JSON.stringify({ key, value: String(valToSave) }),
            });
            const data = await response.json();
            if (response.ok) {
                showToast('設定更新成功', 'success');
                setEditingKey(null);
                setEditValue('');
                fetchSettings();
            } else {
                showToast(data.error || '更新失敗', 'error');
            }
        } catch (error) {
            showToast('更新時發生錯誤', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSyncKnowledge = async () => {
        setIsSyncingKnowledge(true);
        try {
            const response = await authFetch('/api/admin/announcements/sync-knowledge', {
                method: 'POST',
                body: JSON.stringify({ all: true }),
            });
            const data = await response.json();
            if (response.ok) {
                showToast(data.message || '知識庫同步完成', 'success');
            } else {
                showToast(data.error || '知識庫同步失敗', 'error');
            }
        } catch (error) {
            showToast('知識庫同步時發生錯誤', 'error');
        } finally {
            setIsSyncingKnowledge(false);
        }
    };

    const isGcpConfigured = settings.find(s => s.key === 'GCP_SERVICE_ACCOUNT_JSON')?.isSet;
    const toggleSettings = settings.filter(s => s.key === 'AI_ASSISTANT_ENABLED');
    const keySettings = settings.filter(s => s.key !== 'AI_ASSISTANT_ENABLED');

    return (
        <div className="space-y-5">
            {isGcpConfigured && <UsageMonitor />}

            {/* 維護操作 */}
            <div className="bg-surface border border-line rounded-xl px-5 py-4 flex flex-wrap items-center gap-3 select-none">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-tint text-primary flex-shrink-0">
                    <BrainCircuit size={18} aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">AI 助理知識庫</p>
                    <p className="text-[12.5px] text-ink-soft leading-relaxed">公告建立/更新時即時同步；全量同步可回填既有公告並清除已下架條目。</p>
                </div>
                <button
                    onClick={handleSyncKnowledge}
                    disabled={isSyncingKnowledge}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white dark:text-[#10151B] hover:bg-primary-hover transition-colors duration-150 disabled:opacity-60 whitespace-nowrap"
                >
                    {isSyncingKnowledge ? <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                    {isSyncingKnowledge ? '同步中...' : '全量同步'}
                </button>
                <button
                    onClick={fetchSettings}
                    disabled={loading}
                    aria-label="重新整理系統設定列表" title="重新整理"
                    className="flex items-center justify-center w-9 h-9 rounded-lg border border-line text-ink-soft hover:text-primary hover:border-line-strong transition-colors duration-150 disabled:opacity-50"
                >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
                </button>
            </div>

            {loading ? (
                <div className="bg-surface border border-line rounded-xl p-14 text-center text-ink-soft">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" aria-hidden="true" />載入設定中...
                </div>
            ) : (
                <>
                    {/* 功能開關 */}
                    {toggleSettings.length > 0 && (
                        <section className="bg-surface border border-line rounded-xl overflow-hidden">
                            <h3 className="px-5 pt-4 pb-2 text-[11.5px] font-semibold tracking-widest text-ink-soft select-none">功能開關</h3>
                            {toggleSettings.map(setting => {
                                const enabled = setting.value === 'true' || (setting.source === 'none' && !setting.isSet);
                                return (
                                    <div key={setting.key} className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-line">
                                        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-tint text-primary flex-shrink-0">
                                            <MessageSquare size={17} aria-hidden="true" />
                                        </span>
                                        <div className="flex-1 min-w-0 select-none">
                                            <p className="text-sm font-semibold text-ink flex items-center gap-2">
                                                {SETTING_LABELS[setting.key]}
                                                <span className={`text-[11px] font-medium ${enabled ? 'text-ok' : 'text-danger'}`}>{enabled ? '啟用中' : '已停用'}</span>
                                            </p>
                                            <p className="text-[12.5px] text-ink-soft leading-relaxed">{SETTING_DESCRIPTIONS[setting.key]}</p>
                                        </div>
                                        <button
                                            role="switch"
                                            aria-checked={enabled}
                                            aria-label={enabled ? '停用 AI 獎助學金助理' : '啟用 AI 獎助學金助理'}
                                            onClick={() => handleSave(setting.key, enabled ? 'false' : 'true')}
                                            disabled={saving}
                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60
                                                ${enabled ? 'bg-ok' : 'bg-line-strong/50'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </section>
                    )}

                    {/* API 金鑰 */}
                    <section className="bg-surface border border-line rounded-xl overflow-hidden">
                        <h3 className="px-5 pt-4 pb-2 text-[11.5px] font-semibold tracking-widest text-ink-soft select-none">API 金鑰</h3>
                        {keySettings.map(setting => (
                            <div key={setting.key} className="px-5 py-4 border-t border-line">
                                <div className="flex flex-wrap items-start gap-3">
                                    <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-tint text-primary flex-shrink-0 mt-0.5">
                                        <Key size={16} aria-hidden="true" />
                                    </span>
                                    <div className="flex-1 min-w-0 select-none">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="text-sm font-semibold text-ink">{SETTING_LABELS[setting.key] || setting.key}</h4>
                                            <StatusBadge isSet={setting.isSet} source={setting.source} />
                                        </div>
                                        <p className="text-[12.5px] text-ink-soft leading-relaxed mt-0.5">{SETTING_DESCRIPTIONS[setting.key]}</p>
                                        {setting.updatedAt && (
                                            <p className="text-[11px] text-ink-soft/60 mt-1">最後更新:{new Date(setting.updatedAt).toLocaleString('zh-TW', { hour12: false })}</p>
                                        )}
                                    </div>
                                    {editingKey !== setting.key && (
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <code className="hidden sm:block font-mono text-xs text-ink-soft bg-page border border-line rounded-md px-3 py-1.5 max-w-44 truncate select-none">
                                                {setting.value || '尚未設定'}
                                            </code>
                                            <button
                                                onClick={() => handleEdit(setting.key)}
                                                aria-label={`更新 ${SETTING_LABELS[setting.key] || setting.key} 的內容`}
                                                className="px-3.5 py-1.5 text-sm font-medium text-primary border border-primary/40 rounded-lg hover:bg-primary-tint transition-colors duration-150 whitespace-nowrap"
                                            >
                                                更新內容
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editingKey === setting.key && (
                                    <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:pl-12 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <input
                                            type="text"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            placeholder="貼上新的金鑰或設定值"
                                            aria-label={`更新 ${SETTING_LABELS[setting.key] || setting.key} 的內容`}
                                            className="flex-1 px-3.5 py-2 bg-surface text-ink border border-line-strong rounded-lg focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-150 outline-none text-sm font-mono"
                                            autoFocus
                                        />
                                        <div className="flex gap-2 flex-shrink-0">
                                            <button
                                                onClick={() => handleSave(setting.key)}
                                                disabled={saving || !editValue.trim()}
                                                aria-label="儲存設定"
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-white dark:text-[#10151B] text-sm font-semibold rounded-lg hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                                            >
                                                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}儲存
                                            </button>
                                            <button
                                                onClick={handleCancel}
                                                disabled={saving}
                                                aria-label="取消編輯"
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-ink border border-line-strong rounded-lg hover:bg-surface-hover transition-colors duration-150"
                                            >
                                                <X size={14} aria-hidden="true" />取消
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </section>
                </>
            )}
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={hideToast} />
        </div>
    );
}
