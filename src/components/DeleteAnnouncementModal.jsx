'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Toast from '@/components/ui/Toast';
import ConfirmByTypingModal from '@/components/ui/ConfirmByTypingModal';
import { authFetch } from '@/lib/authFetch';

/**
 * 刪除公告：Cloudflare 式打字確認（輸入公告標題才可執行）
 * 刪除流程：清除附件實體檔案 → 刪除公告紀錄（DB CASCADE 帶走附件/瀏覽/訂閱/知識庫）
 */
export default function DeleteAnnouncementModal({ isOpen, onClose, announcement, refreshAnnouncements }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => setToast({ show: true, message, type });
    const hideToast = () => setToast(prev => ({ ...prev, show: false }));

    const announcementId = announcement?.id;

    const handleDelete = async () => {
        if (!announcementId) {
            showToast('無效的公告 ID', 'error');
            return;
        }
        setIsDeleting(true);
        try {
            // 步驟 1: 從資料庫查詢關聯的附件路徑
            const { data: attachments, error: fetchError } = await supabase
                .from('attachments')
                .select('stored_file_path')
                .eq('announcement_id', announcementId);

            if (fetchError) {
                console.error("無法查詢關聯附件:", fetchError);
                // 查詢失敗，嘗試刪除主公告
            }

            // 步驟 2: 如果有附件，呼叫後端 API 來刪除本地檔案
            if (attachments && attachments.length > 0) {
                const filePaths = attachments.map(att => att.stored_file_path);

                const deleteFileRes = await authFetch('/api/delete-files', {
                    method: 'POST',
                    body: JSON.stringify({ filePaths }),
                });

                if (!deleteFileRes.ok) {
                    const errorData = await deleteFileRes.json();
                    showToast(`部分附件檔案刪除失敗: ${errorData.error || ''}`, 'warning');
                    console.error("刪除本地檔案失敗:", errorData);
                }
            }

            // 步驟 3: 刪除公告的資料庫紀錄
            const { error: deleteError } = await supabase
                .from('announcements')
                .delete()
                .eq('id', announcementId);

            if (deleteError) {
                throw deleteError;
            }

            showToast('公告及其所有附件已成功刪除', 'success');
            if (refreshAnnouncements) {
                refreshAnnouncements();
            }
            onClose();

        } catch (err) {
            console.error("刪除公告時發生錯誤:", err);
            showToast(`刪除失敗: ${err.message}`, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={hideToast} />
            <ConfirmByTypingModal
                isOpen={isOpen}
                title="永久刪除公告"
                description="將永久刪除這則公告與其所有附件、瀏覽紀錄及訂閱提醒。"
                keyword={announcement?.title || ''}
                hint="此操作無法復原；點擊上方標題可自動帶入"
                confirmLabel="永久刪除"
                isBusy={isDeleting}
                onConfirm={handleDelete}
                onClose={onClose}
            />
        </>
    );
}
