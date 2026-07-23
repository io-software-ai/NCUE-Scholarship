# NCUE 獎學金資訊平台（NCUE Scholarship）

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Google Gemini](https://img.shields.io/badge/Gemini-3.6%20Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial-red?style=flat-square)](LICENSE)

國立彰化師範大學（NCUE）獎助學金資訊整合平台。彙整校內外獎助學金公告，並以自建的
Gemini AI 助理、LINE 官方帳號整合與訂閱提醒機制，協助學生即時掌握申請資訊、降低錯過期限的風險。

**線上服務：** <https://scholarship.ncuesa.org.tw>

---

## 功能總覽

### 學生前台

- **公告瀏覽與搜尋**：分類篩選、關鍵字搜尋、截止倒數標示（≤7 天、≤3 天分級提醒），完整 RWD 與深／淺色主題。
- **公告詳情**：附件下載、外部連結（自動擷取網站標題預覽）、PDF 匯出、一鍵加入 Google 日曆（含截止日與公告直達連結）、左右鍵切換前後公告。
- **訂閱提醒**：登入後可訂閱任一公告，於截止日前 1／3／5／7 天（自行設定）收到 Email 提醒。
- **AI 獎助學金助理**：自建 Gemini 代理（`gemini-3.6-flash`，`@google/genai`），具工具調用迴圈——公告搜尋、近期截止清單、公告詳情、FAQ 查詢、日期計算；串流回覆並即時顯示思考狀態與工具執行進度。
- **LINE 帳號綁定**：透過 LINE Login OAuth 或驗證碼綁定；綁定後 LINE 與網頁端 AI 助理共享對話脈絡。
- **相關資源與常見問答**：分頁式版面（相關資源／常見問答／使用手冊），FAQ 內容由後台維護。
- **站內問題回報**：彈出式表單，支援附加圖片並自動記錄回報頁面網址，送出後寄至維護信箱。
- **Google 帳號登入**：Supabase Auth + Google Identity Services One Tap，免密碼流程。

### 管理後台（`/manage`）

- **公告管理**：TinyMCE 富文字編輯、AI 依網址或附件自動生成公告草稿、公告複製、批次刪除（輸入關鍵字確認）、Email 通知、PDF 產出。
- **AI 知識庫**：公告建立／更新時自動同步為 AI 可讀純文字，支援全量重建與內容檢視。
- **LINE 管理**：聊天紀錄與手動回覆（支援「@」快速引用公告、聊天室釘選）、AI 自動回覆開關、官方帳號憑證設定、Rich Menu 圖片上傳／預覽／移除。
- **FAQ 管理**：受控樣式區塊（段落／清單／步驟／提示框／警示框 + 行內粗體、重點標示、連結），拖拉排序。
- **使用者管理**：角色調整、通知寄送、刪除帳號（輸入關鍵字確認）。
- **數據統計**：平台瀏覽趨勢圖（日／週／月）與 AI 用量概覽。
- **系統設定**：功能開關與服務金鑰（Gemini、SerpApi、TinyMCE、LINE）集中管理，儲存於資料庫 `system_settings`，毋須重新部署。

## 技術架構

| 類別 | 技術 | 說明 |
| :--- | :--- | :--- |
| **框架** | Next.js 16（App Router） | 前後端一體，Server Components + API Routes。 |
| **UI** | React 19、Tailwind CSS 4、framer-motion | Design token 主題系統（深／淺色）、動效與拖拉排序。 |
| **後端服務** | Supabase | PostgreSQL、Google OAuth 驗證、Storage、Row Level Security。 |
| **AI** | `@google/genai`（Gemini 3.6 Flash） | 自建代理迴圈與工具調用，知識庫存於資料庫。 |
| **郵件** | Nodemailer（SMTP） | 訂閱提醒、公告通知、問題回報轉寄。 |
| **PDF** | `@react-pdf/renderer` | 公告 PDF 匯出。 |
| **訊息** | LINE Messaging API / LINE Login | Webhook 自動回覆、推播、Rich Menu、帳號綁定。 |
| **部署** | PM2 | VPS 上的 Node.js 程序管理。 |

## 專案結構

```
NCUE-Scholarship/
├── src/
│   ├── app/
│   │   ├── (user)/profile/     # 個人資料、訂閱管理、帳號安全
│   │   ├── ai-assistant/       # AI 助理聊天介面
│   │   ├── api/                # API Routes（公告、AI、LINE、訂閱、寄信、cron…）
│   │   │   ├── admin/          #   後台專用（公告、LINE 管理、知識庫同步、系統設定）
│   │   │   ├── line/           #   LINE webhook 與帳號綁定
│   │   │   └── cron/           #   排程端點（截止日提醒）
│   │   ├── login/              # Google 登入
│   │   ├── manage/             # 管理後台
│   │   └── resource/           # 相關資源與常見問答
│   ├── components/             # UI 元件（admin/、ai-assistant/、ui/ 等）
│   ├── hooks/                  # 共用 hooks
│   └── lib/                    # 核心邏輯（ai/ 代理與工具、line.js、supabase、共用 UI 邏輯）
├── scripts/
│   ├── sync-ai-knowledge.js    # AI 知識庫全量回填
│   ├── setup-line-richmenu.js  # LINE Rich Menu 初始化
│   └── daily_backup.sh         # 每日備份
├── supabase/
│   ├── supabase_schema.sql     # 基礎 Schema
│   └── migrations/             # 增量 migration（依檔名時間序執行）
├── middleware.js               # 路由保護
└── package.json
```

## 開始使用

### 環境需求

- **Node.js** 20.9 以上（Next.js 16 要求）
- **npm**
- Supabase 專案、Google OAuth Client、SMTP 帳號

### 1. 安裝

```bash
git clone https://github.com/io-software-ai/NCUE-Scholarship.git
cd NCUE-Scholarship
npm install
```

### 2. 環境變數

複製 `.env.template` 為 `.env.local` 並填入：

| 變數 | 說明 |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Supabase 專案網址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 公開金鑰 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服務金鑰（**切勿外洩**） |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | 站台網址 |
| `SENDER_EMAIL`、`SENDER_NAME`、`SMTP_*` | 寄信 SMTP 設定 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth Client ID（One Tap 登入） |
| `CRON_SECRET` | 排程端點的 Bearer 驗證密鑰 |
| `FEEDBACK_EMAIL` | 問題回報收件信箱（選填，預設為 `SENDER_EMAIL`） |

> [!NOTE]
> Gemini、SerpApi、TinyMCE 與 LINE 官方帳號等服務金鑰**不放在環境變數**，
> 由管理後台「系統設定」頁維護，儲存於資料庫 `system_settings`。

### 平台識別設定（White-label）

平台名稱、營運單位、開發維護資訊與對外固定連結集中於
[`src/lib/siteConfig.js`](src/lib/siteConfig.js) 單一來源。要將本專案部署為
其他學校／單位的平台，只需修改該檔與環境變數即可完成品牌替換，
不需要全域搜尋替換程式碼。

### 3. 資料庫初始化

1. 於 Supabase SQL Editor 執行 `supabase/supabase_schema.sql`。
2. 依檔名時間序執行 `supabase/migrations/` 內的所有 migration。

### 4. 本機開發

```bash
npm run dev
```

開啟 `http://localhost:3000` 即可使用。

## 部署（VPS + PM2）

```bash
npm run build        # 完整建置（確認無 prerender 錯誤）
npm run pm2:start    # 以 PM2 啟動（之後更新用 npm run pm2:restart）
```

### 排程：訂閱截止提醒

以 crontab 每日觸發提醒端點（需 `CRON_SECRET`）：

```cron
0 8 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/deadline-notify
```

### LINE 官方帳號

1. 於後台「LINE 管理 → 帳號設定」填入 Channel Access Token 與 Channel Secret。
2. 在 LINE Developers Console 將 Webhook URL 設為 `https://<你的網域>/api/line/webhook`。
3. （選用）於後台上傳 Rich Menu 圖片（2500×1686 四格或 2500×843 三格）。

## 授權

本專案採用 **[PolyForm Noncommercial License 1.0.0](LICENSE)** 授權。

> [!IMPORTANT]
> 允許個人、教育與公益等非商業用途；**禁止任何商業使用**。
> Copyright © 2026 [io Software](https://iosoftware.ai). All rights reserved.

## 聯絡與回報

- **維護者：** [Tai Ming Chen](https://github.com/Ming874)
- **開發維護：** [io Software](https://iosoftware.ai)
- **問題回報：** [GitHub Issues](https://github.com/io-software-ai/NCUE-Scholarship/issues)
