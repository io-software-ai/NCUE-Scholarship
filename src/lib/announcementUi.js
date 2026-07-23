/**
 * 公告 UI 共用邏輯（模組化單一來源）
 * 供 AnnouncementList / AnnouncementDetailModal / 後台元件共用，
 * 分類樣式與截止緊迫度規則只在這裡維護。
 */

// A–G 墨章：同亮度低彩度色帶（tokens 定義於 globals.css @theme）
export const CATEGORY_BADGE_CLASSES = {
    A: 'text-cat-a border-cat-a/25 bg-cat-a/8',
    B: 'text-cat-b border-cat-b/25 bg-cat-b/8',
    C: 'text-cat-c border-cat-c/25 bg-cat-c/8',
    D: 'text-cat-d border-cat-d/25 bg-cat-d/8',
    E: 'text-cat-e border-cat-e/25 bg-cat-e/8',
    F: 'text-cat-f border-cat-f/25 bg-cat-f/8',
    G: 'text-cat-g border-cat-g/25 bg-cat-g/8',
    default: 'text-ink-soft border-line bg-page',
};

export const CATEGORY_NAMES = {
    A: '各縣市政府獎助學金',
    B: '縣市政府以外之各級公家機關及公營單位獎助學金',
    C: '宗教及民間各項指定身分獎助學金',
    D: '非公家機關或其他無法歸類的獎助學金',
    E: '本校獲配推薦名額獎助學金',
    F: '校外獎助學金得獎公告',
    G: '校內獎助學金',
};

export const getCategoryBadgeClass = (cat) => CATEGORY_BADGE_CLASSES[cat] || CATEGORY_BADGE_CLASSES.default;

/**
 * 截止緊迫度（乾淨系統規則：色彩只表真實狀態）
 * 常態不上色、≤7 天琥珀、≤3 天紅、已截止/未開始轉灰。
 * @returns {{ colorClass:string, stamp:string|null, stampClass:string, daysLeft:number|null }}
 */
export function getDeadlineInfo(endDateStr, startDateStr = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = endDateStr ? new Date(endDateStr) : null;
    const startDate = startDateStr ? new Date(startDateStr) : null;

    if (endDate === null) {
        return { colorClass: 'text-ink', stamp: null, stampClass: '', daysLeft: null };
    }
    if (endDate < today) {
        return { colorClass: 'text-ink-soft', stamp: '已截止', stampClass: 'text-ink-soft', daysLeft: null };
    }
    if (startDate && startDate > today) {
        return { colorClass: 'text-ink-soft', stamp: '尚未開放', stampClass: 'text-ink-soft', daysLeft: null };
    }
    const daysLeft = Math.round((endDate - today) / 86400000);
    if (daysLeft <= 3) {
        return { colorClass: 'text-danger font-bold', stamp: `剩 ${daysLeft} 天`, stampClass: 'text-danger', daysLeft };
    }
    if (daysLeft <= 7) {
        return { colorClass: 'text-warn font-bold', stamp: `剩 ${daysLeft} 天`, stampClass: 'text-warn', daysLeft };
    }
    return { colorClass: 'text-ink', stamp: null, stampClass: '', daysLeft };
}

/** 附件檔案類型標示（檔案列 icon 用） */
export function getFileKind(att) {
    const name = (att?.file_name || '').toLowerCase();
    const mime = (att?.mime_type || '').toLowerCase();
    if (mime.includes('pdf') || name.endsWith('.pdf')) return { label: 'PDF', cls: 'text-danger bg-danger/8' };
    if (mime.includes('word') || /\.(docx?|odt)$/.test(name)) return { label: 'DOC', cls: 'text-primary bg-primary-tint' };
    if (mime.includes('sheet') || mime.includes('excel') || /\.(xlsx?|ods|csv)$/.test(name)) return { label: 'XLS', cls: 'text-ok bg-ok/8' };
    if (mime.includes('presentation') || /\.(pptx?|odp)$/.test(name)) return { label: 'PPT', cls: 'text-warn bg-warn/8' };
    if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name)) return { label: 'IMG', cls: 'text-warn bg-warn/8' };
    return { label: 'FILE', cls: 'text-ink-soft bg-page' };
}

export function formatFileSize(size) {
    if (!size) return '';
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** 本地時區的 YYYY-MM-DD（台灣使用者;避免 toISOString 的 UTC 偏移在深夜差一天） */
export const localDateString = (date = new Date()) => date.toLocaleDateString('en-CA');
export const daysFromNowString = (days) => localDateString(new Date(Date.now() + days * 86400000));

export function getPublicAttachmentUrl(filePath) {
    if (!filePath) return '#';
    const parts = filePath.split('/');
    return `/api/attachments/${parts[parts.length - 1]}`;
}

/**
 * 產生「加入 Google 日曆」連結（免 API 的官方 TEMPLATE 格式）
 * 以截止日建立全天行程，description 含期限、送件方式與公告直達連結。
 * @returns {string|null} 無截止日時回傳 null
 */
export function buildGoogleCalendarUrl(announcement, siteUrl = '') {
    const end = announcement?.application_end_date;
    if (!end) return null;

    const toCompact = (date) => date.toLocaleDateString('en-CA').replace(/-/g, '');
    const endDate = new Date(end);
    const dayAfter = new Date(endDate);
    dayAfter.setDate(dayAfter.getDate() + 1); // Google 全天行程的結束日為「不含」

    const detailLines = [
        `申請截止日：${end}`,
        announcement.application_start_date ? `申請開始日:${announcement.application_start_date}` : null,
        `送件方式：${announcement.submission_method || '詳見公告'}`,
        '',
        `公告詳情：${siteUrl}/?announcement_id=${announcement.id}`,
    ].filter(v => v !== null);

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `【獎學金截止】${announcement.title}`,
        dates: `${toCompact(endDate)}/${toCompact(dayAfter)}`,
        details: detailLines.join('\n'),
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
