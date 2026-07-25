/**
 * 公告 UI 共用邏輯
 */

export const CATEGORY_BADGE_CLASSES: Record<string, string> = {
    A: 'text-cat-a border-cat-a/25 bg-cat-a/8',
    B: 'text-cat-b border-cat-b/25 bg-cat-b/8',
    C: 'text-cat-c border-cat-c/25 bg-cat-c/8',
    D: 'text-cat-d border-cat-d/25 bg-cat-d/8',
    E: 'text-cat-e border-cat-e/25 bg-cat-e/8',
    F: 'text-cat-f border-cat-f/25 bg-cat-f/8',
    G: 'text-cat-g border-cat-g/25 bg-cat-g/8',
    default: 'text-ink-soft border-line bg-page',
};

export const CATEGORY_NAMES: Record<string, string> = {
    A: '各縣市政府獎助學金',
    B: '縣市政府以外之各級公家機關及公營單位獎助學金',
    C: '宗教及民間各項指定身分獎助學金',
    D: '非公家機關或其他無法歸類的獎助學金',
    E: '本校獲配推薦名額獎助學金',
    F: '校外獎助學金得獎公告',
    G: '校內獎助學金',
};

export const getCategoryBadgeClass = (cat: string) => CATEGORY_BADGE_CLASSES[cat] || CATEGORY_BADGE_CLASSES.default;

export interface DeadlineInfo {
    colorClass: string;
    stamp: string | null;
    stampClass: string;
    daysLeft: number | null;
}

export function getDeadlineInfo(endDateStr: string | null, startDateStr: string | null = null): DeadlineInfo {
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
    const daysLeft = Math.round((endDate.getTime() - today.getTime()) / 86400000);
    if (daysLeft <= 3) {
        return { colorClass: 'text-danger font-bold', stamp: `剩 ${daysLeft} 天`, stampClass: 'text-danger', daysLeft };
    }
    if (daysLeft <= 7) {
        return { colorClass: 'text-warn font-bold', stamp: `剩 ${daysLeft} 天`, stampClass: 'text-warn', daysLeft };
    }
    return { colorClass: 'text-ink', stamp: null, stampClass: '', daysLeft };
}

export function getFileKind(att: any) {
    const name = (att?.file_name || '').toLowerCase();
    const mime = (att?.mime_type || '').toLowerCase();
    if (mime.includes('pdf') || name.endsWith('.pdf')) return { label: 'PDF', cls: 'text-danger bg-danger/8' };
    if (mime.includes('word') || /\.(docx?|odt)$/.test(name)) return { label: 'DOC', cls: 'text-primary bg-primary-tint' };
    if (mime.includes('sheet') || mime.includes('excel') || /\.(xlsx?|ods|csv)$/.test(name)) return { label: 'XLS', cls: 'text-ok bg-ok/8' };
    if (mime.includes('presentation') || /\.(pptx?|odp)$/.test(name)) return { label: 'PPT', cls: 'text-warn bg-warn/8' };
    if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name)) return { label: 'IMG', cls: 'text-warn bg-warn/8' };
    return { label: 'FILE', cls: 'text-ink-soft bg-page' };
}

export function formatFileSize(size: number) {
    if (!size) return '';
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export const localDateString = (date = new Date()) => date.toLocaleDateString('en-CA');
export const daysFromNowString = (days: number) => localDateString(new Date(Date.now() + days * 86400000));

export function getPublicAttachmentUrl(filePath: string) {
    if (!filePath) return '#';
    const parts = filePath.split('/');
    return `/api/attachments/${parts[parts.length - 1]}`;
}

export function buildGoogleCalendarUrl(announcement: any, siteUrl = '') {
    const end = announcement?.application_end_date;
    if (!end) return null;

    const toCompact = (date: Date) => date.toLocaleDateString('en-CA').replace(/-/g, '');
    const endDate = new Date(end);
    const dayAfter = new Date(endDate);
    dayAfter.setDate(dayAfter.getDate() + 1);

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

/**
 * 產生標準 iCalendar (.ics) 內容 —— 交給系統開啟即可用「裝置預設行事曆 App」匯入，
 * 不必綁定 Google 日曆網頁版。全天事件設在截止日當天（DTEND 為隔天，符合 iCal 規格）。
 */
export function buildIcsContent(announcement: any, siteUrl = ''): string | null {
    const end = announcement?.application_end_date;
    if (!end) return null;

    const toCompact = (date: Date) => date.toLocaleDateString('en-CA').replace(/-/g, '');
    const endDate = new Date(end);
    const dayAfter = new Date(endDate);
    dayAfter.setDate(dayAfter.getDate() + 1);

    // RFC 5545：跳脫 , ; \ 與換行
    const esc = (s: any) =>
        String(s ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\r?\n/g, '\\n');

    const detail = [
        `申請截止日：${end}`,
        announcement.application_start_date ? `申請開始日：${announcement.application_start_date}` : null,
        `送件方式：${announcement.submission_method || '詳見公告'}`,
        '',
        `公告詳情：${siteUrl}/announcement/${announcement.id}`,
    ].filter((v) => v !== null).join('\n');

    // 折行至 75 位元組以內是規格建議；這裡內容不長，保持單行以免破壞中文字元
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//NCUE Scholarship//App//ZH-TW',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:ncue-ann-${announcement.id}@scholarship.ncuesa.org.tw`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
        `DTSTART;VALUE=DATE:${toCompact(endDate)}`,
        `DTEND;VALUE=DATE:${toCompact(dayAfter)}`,
        `SUMMARY:${esc(`【獎學金截止】${announcement.title}`)}`,
        `DESCRIPTION:${esc(detail)}`,
        `URL:${esc(`${siteUrl}/announcement/${announcement.id}`)}`,
        // 截止前一天上午 9 點提醒
        'BEGIN:VALARM',
        'TRIGGER:-P1DT15H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(`明天截止：${announcement.title}`)}`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return lines.join('\r\n');
}
