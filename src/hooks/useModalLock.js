'use client';

import { useEffect } from 'react';

/**
 * Modal 開啟時掛上 body.modal-open（鎖定背景捲動 + 隱藏 Header/ScrollToTop）。
 * 計數式實作：多個 Modal 疊層（如編輯器上再開確認框）時，
 * 需等「全部」關閉才移除 class，避免上層關閉時 Header 提早浮回。
 */
let lockCount = 0;

const syncBodyClass = () => {
    document.body.classList.toggle('modal-open', lockCount > 0);
};

export default function useModalLock(active) {
    useEffect(() => {
        if (!active) return;
        lockCount++;
        syncBodyClass();
        return () => {
            lockCount = Math.max(0, lockCount - 1);
            syncBodyClass();
        };
    }, [active]);
}
