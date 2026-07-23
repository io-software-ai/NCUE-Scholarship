/**
 * 平台識別設定（單一來源，white-label 供其他單位複用）
 *
 * 所有「平台名稱、站台網址、學校與維護單位資訊、對外固定連結」一律由本檔輸出，
 * 元件與 API 不得自行硬編碼。要將本專案部署為其他學校／單位的平台時，
 * 只需修改本檔與環境變數，不需要全域搜尋替換。
 *
 * 注意：NEXT_PUBLIC_* 環境變數會在 build 階段內嵌至前端，修改後需重新建置。
 * 收件信箱等僅限伺服器端的設定請走環境變數（見 getFeedbackRecipient）。
 */

export const siteConfig = {
    /** 完整正式名稱（email、metadata、PDF、法律文件） */
    name: '彰師生輔組校外獎助學金資訊平台',
    /** 簡短名稱（LINE 選單、PWA、離線頁等空間受限處） */
    shortName: '彰師獎助學金資訊平台',
    /** 品牌標頭（Header、Email 表頭） */
    brandName: '生輔組校外獎助學金資訊平台',

    /** 營運單位 */
    school: '國立彰化師範大學',
    schoolShort: '彰師大',
    organization: '國立彰化師範大學 學務處生活輔導組',
    /** Email 署名 */
    signature: '彰師大 學務處生輔組 敬上',
    /** 獎學金業務諮詢信箱（承辦單位） */
    supportEmail: 'act5718@gmail.com',

    /** 站台網址（無結尾斜線） */
    url: (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://scholarship.ncuesa.org.tw').replace(/\/$/, ''),

    /** 開發維護單位 */
    developer: {
        name: 'io Software',
        url: 'https://iosoftware.ai',
        contactName: '陳泰銘',
        contactEmail: '3526ming@gmail.com',
    },

    /** 對外固定連結 */
    links: {
        /** 學務處生輔組首頁 */
        studentAffairs: 'https://stuaffweb.ncue.edu.tw',
        /** 官方 LINE 社群 */
        lineCommunity: 'https://reurl.cc/L7jGQe',
        /** LINE 官方帳號（AI 獎學金助理）加好友連結 */
        lineOfficialAdd: 'https://line.me/R/ti/p/@622iaadg',
        /** 校方獎助學金專區 */
        scholarshipZone: 'https://www.ncue.edu.tw/p/412-1000-1513.php?Lang=zh-tw',
        /** 教育部圓夢助學網 */
        helpDreams: 'https://www.edu.tw/helpdreams/Default.aspx',
        /** 平台使用手冊 */
        manual: 'https://hackmd.io/@mingchen/scholarship?theme=light',
    },
};

/** 站台網域（不含協定，顯示用） */
export const siteHost = siteConfig.url.replace(/^https?:\/\//, '');

/** 單一公告的直達連結 */
export const getAnnouncementUrl = (announcementId) =>
    `${siteConfig.url}/?announcement_id=${announcementId}`;

/** Email 頁尾版權宣告 */
export const getCopyrightLine = (year = new Date().getFullYear()) =>
    `© ${year} ${siteConfig.name}. All Rights Reserved.`;

/**
 * 問題回報收件信箱（僅限伺服器端呼叫）
 * 依序取 FEEDBACK_EMAIL → SENDER_EMAIL，避免將個人信箱硬編碼於程式中。
 */
export const getFeedbackRecipient = () =>
    process.env.FEEDBACK_EMAIL || process.env.SENDER_EMAIL || siteConfig.developer.contactEmail;
