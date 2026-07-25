/**
 * 平台識別設定（單一來源，white-label 供其他單位複用）
 */

export const siteConfig = {
    name: '彰師生輔組校外獎助學金資訊平台',
    shortName: '彰師獎助學金資訊平台',
    brandName: '生輔組校外獎助學金資訊平台',
    school: '國立彰化師範大學',
    schoolShort: '彰師大',
    organization: '國立彰化師範大學 學務處生活輔導組',
    signature: '彰師大 學務處生輔組 敬上',
    supportEmail: 'act5718@gmail.com',
    url: (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.EXPO_PUBLIC_API_BASE ||
        'https://scholarship.ncuesa.org.tw'
    ).replace(/\/$/, ''),
    developer: {
        name: 'io Software',
        url: 'https://iosoftware.ai',
        contactName: '陳泰銘',
        contactEmail: '3526ming@gmail.com',
    },
    links: {
        studentAffairs: 'https://stuaffweb.ncue.edu.tw',
        lineCommunity: 'https://reurl.cc/L7jGQe',
        lineOfficialAdd: 'https://line.me/R/ti/p/@622iaadg',
        scholarshipZone: 'https://www.ncue.edu.tw/p/412-1000-1513.php?Lang=zh-tw',
        helpDreams: 'https://www.edu.tw/helpdreams/Default.aspx',
        manual: 'https://hackmd.io/@mingchen/scholarship?theme=light',
    },
};

export const siteHost = siteConfig.url.replace(/^https?:\/\//, '');

export const getAnnouncementUrl = (announcementId: string | number) =>
    `${siteConfig.url}/?announcement_id=${announcementId}`;

export const getCopyrightLine = (year = new Date().getFullYear()) =>
    `© ${year} ${siteConfig.name}. All Rights Reserved.`;

export const getFeedbackRecipient = () =>
    process.env.FEEDBACK_EMAIL || process.env.SENDER_EMAIL || siteConfig.developer.contactEmail;
