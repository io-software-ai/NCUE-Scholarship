# 彰師獎學金 App — 原生設定與上架指引

> 這份是「**需要你親自操作**」的步驟。程式/設定端我已完成（見文末 §0）。
> 依 **Stage 1 → 2 → 3** 順序做；每個 Stage 完成即可驗收一個里程碑。
> 套件名（package）：`org.ncuesa.scholarship`　·　Expo SDK 57　·　EAS projectId 已設定。

---

## Stage 1 — Google 登入（先做，最重要）

目標：打出一個 dev build，安裝後能用 Google 一次登入成功、重開仍保持登入。

### 1-1. 先建 development build 並取得 SHA-1

```bash
cd apps/mobile
eas build --profile development --platform android
```

第一次會問是否要 EAS 幫你產生 Android Keystore → 選 **Yes**。建完後查看指紋：

```bash
eas credentials --platform android
# 選 development → Keystore → 會列出 SHA-1 與 SHA-256，複製 SHA-1
```

> 之後正式上架（Play App Signing）會有**另一組** SHA-1/SHA-256，屆時要再加一次（見 Stage 4）。

### 1-2. Google Cloud：建立 Android OAuth Client

1. 進 **Google Cloud Console** → 選你 Supabase Google 登入所用的**同一個專案**。
2. 左側 **APIs & Services → Credentials**。
3. **+ CREATE CREDENTIALS → OAuth client ID**。
4. Application type：**Android**。
   - Package name：`org.ncuesa.scholarship`
   - SHA-1 certificate fingerprint：貼上 1-1 取得的 **SHA-1**
5. 建立。（Android client 不需要在 App 程式裡引用，Google 靠「package + SHA-1」比對，登入時發的 idToken 受眾是你的 **Web client id**。）

### 1-3. Supabase：授權 Web client id

1. Supabase Dashboard → **Authentication → Providers → Google**（確認 Enabled）。
2. **Authorized Client IDs** 欄位，加入你的 **Web client id**
   （= EAS 的 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`，`702499543962-9igs…`）。
3. 儲存。

### 1-4. 安裝 dev build 並啟動

```bash
# 把 1-1 build 出來的 APK 裝到手機（EAS 會給 QR/連結，或）
# 然後啟動 Metro：
cd apps/mobile
npx expo start --dev-client
```

用手機開啟已安裝的「彰師獎學金 (dev)」App → 掃 QR 連上 Metro。

### ✅ Stage 1 驗收
- 「我的」分頁 → 立即登入 → Google 一次成功。
- **完全關閉再開 App，仍保持登入**（session 有持久化）。
- 登出後回到未登入狀態。

> 卡關排查：`DEVELOPER_ERROR` 幾乎都是 **SHA-1 沒對上**（build 的簽章 ≠ Google Cloud 登記的 SHA-1），或 package name 打錯。

---

## Stage 2 — 推播通知（FCM）

目標：App 取得 FCM token 存進後端、能收到截止提醒 / 廣播、點通知導向公告。

> **關鍵**：要用**你後端既有的同一個 Firebase 專案**（web 已用 `firebase-admin`），
> 這樣後端發的 FCM 才對得上 App 的 token。**不要**另開新專案。

### 2-1. Firebase 加入 Android App　✅ 已完成
1. Firebase Console → 開**後端在用的那個專案** → 專案設定 → 你的應用程式 → **新增應用程式 → Android**。
2. Android package name：`org.ncuesa.scholarship`。
3. 下載 **`google-services.json`** → 已放在 `apps/mobile/google-services.json` ✓

### 2-2. app.json 設定　✅ 已完成
`expo.android.googleServicesFile: "./google-services.json"` 已設定 ✓

### 2-3. 程式端　✅ 已完成
- **自動註冊 token**：登入後 / 每次回前景（12h 節流）自動註冊。
  （先前只有「在登入頁完成登入那一刻」才註冊，已登入使用者重開 App 永遠不會註冊 → 已修正）
- **點通知開公告**：冷啟動與前景皆處理，payload 支援 `announcementId` / `announcement_id` / `id`。
- **前台顯示**：`setNotificationHandler` 已設定。

### 2-4. 剩下這一步 —— 重建（原生變更需重 build）
```bash
cd apps/mobile
eas build --profile development --platform android
```
> 這次 build 同時包含 **App 圖示長按捷徑**（`expo-quick-actions`）。

### ✅ Stage 2 驗收
- 登入後允許通知權限 → 後端 `fcm_tokens` 出現這台裝置的 token。
- 從後端 `admin/notifications/broadcast` 發一則 → 手機收得到。
- 點通知 → 開到對應公告詳情。
- **長按 App 圖示** → 出現「AI 助理」「我的收藏」兩個捷徑，點了直接到對應畫面。

> 註：`getDevicePushTokenAsync()` 在**沒有 Google Play 服務的模擬器**會失敗，用實機測。

---

## Stage 3 — App Links 深連結（點網址直接開 App）

目標：`https://scholarship.ncuesa.org.tw/announcement/<id>` 點了直接開 App 到該公告；沒裝 App 則回落網頁。（`app.json` 的 intent filter 我已設好。）

### 3-1. 取得 SHA-256
```bash
eas credentials --platform android   # development（測試用）→ 記下 SHA-256
```

### 3-2. 在網站放 assetlinks.json
於你的 nginx 讓這個網址可存取（**Content-Type: application/json**）：

`https://scholarship.ncuesa.org.tw/.well-known/assetlinks.json`

內容（把 `SHA256_填這裡` 換成 3-1 的 SHA-256，冒號分隔大寫）：
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "org.ncuesa.scholarship",
      "sha256_cert_fingerprints": ["13:CA:C0:1D:0E:BA:AA:79:25:8F:CB:6B:18:DD:1E:88:28:58:AF:0E:21:33:26:AC:94:D1:22:A4:F1:C6:1F:73"]
    }
  }
]
```

> 上架後 Play App Signing 會有**另一組 SHA-256**，記得**一起**加進 `sha256_cert_fingerprints` 陣列（可放多組）。

### 3-3. 驗證
```bash
# 裝好 App 的手機接電腦：
adb shell pm verify-app-links --re-verify org.ncuesa.scholarship
adb shell pm get-app-links org.ncuesa.scholarship   # 看 verified 狀態
```

### ✅ Stage 3 驗收
- LINE / Email / 瀏覽器點公告連結 → 直接開 App 到該公告。

---

## Stage 4 — 內測 / 上架

```bash
cd apps/mobile
eas build --profile preview   --platform android   # 產 APK，給人內測安裝
eas build --profile production --platform android   # 產 AAB，上 Play Console
eas submit  --profile production --platform android
```

**上架前務必補**（因為 Play 用自己的簽章金鑰）：
- Google Cloud 再新增一個 Android OAuth Client：package 同上 + **Play App Signing 的 SHA-1**
  （Play Console → 設定 → App signing 可查）。
- `assetlinks.json` 的 `sha256_cert_fingerprints` **加入** Play App Signing 的 SHA-256。
- Play Console 填 **Data Safety**、隱私政策（用現有條款頁）、帳號刪除入口（App 內已有）。

---

## 需要你提供 / 操作的資產一覽（打勾追蹤）

- [x] Android OAuth Client（package `org.ncuesa.scholarship` + **dev SHA-1**）— Stage 1
- [] Supabase Google Provider「Authorized Client IDs」含 Web client id — Stage 1
- [x] `google-services.json`（放 `apps/mobile/`，用後端同一 Firebase 專案）— Stage 2 ✓
- [ ] nginx 放 `.well-known/assetlinks.json`（含 dev SHA-256）— Stage 3
- [ ] 上架：Play App Signing 的 SHA-1 / SHA-256 補登記 — Stage 4

有任何一步卡住，把錯誤訊息貼給我。Stage 2 的 `app.json` 那行我可以直接幫你補。
