# Firebase 設定與部署

## 使用的服務

- Firebase Authentication：Anonymous Auth，只提供 Security Rules 所需的臨時 UID。
- Cloud Firestore：賽事、公開狀態與稽核紀錄。
- GitHub Pages：繼續託管 React 靜態網站，不改用 Firebase Hosting。

此組合不依賴 Cloud Functions，可在 Spark 方案免費額度內運作。

## 1. 建立 Firebase 專案

1. 在 Firebase Console 建立專案。
2. 建立 Web App，取得公開 Firebase config。
3. 建立 Cloud Firestore，正式環境請勿使用永久測試模式。
4. Authentication 啟用 Anonymous provider，不需建立 Email 使用者。

## 2. 設定管理 token

先在終端機使用隱藏輸入讀取 token，再計算 SHA-256：

```bash
read -s ADMIN_TOKEN
export ADMIN_TOKEN
npm run hash-token
unset ADMIN_TOKEN
```

指令只輸出 SHA-256，不會輸出 token。請在 Firestore Console 建立 `settings/admin`，內容如下：

```json
{
  "tokenHash": "貼上 npm run hash-token 的 64 字元輸出"
}
```

不要在資料庫或 Git 中保存明文 token。前端沒有讀取 `settings/admin` 的權限；Security Rules 只會在建立匿名管理 session 時比較雜湊。

注意：後台登入欄位輸入的是「原始 token」，Firestore `tokenHash` 欄位放的是上述指令產生的「64 字元 SHA-256」。如果把原始 token 直接放入 `tokenHash`，或登入時貼上 SHA-256，都會驗證失敗。

### 登入失敗檢查

1. Authentication → Sign-in method 已啟用 Anonymous。
2. Firestore 路徑必須是 collection `settings`、document `admin`。
3. 欄位名稱必須是 `tokenHash`，型別為字串。
4. `tokenHash` 必須恰好 64 字元，且為原始 token 去除前後空白後的 SHA-256。
5. 登入頁輸入原始 token，不要輸入雜湊值。

更換 token 時重新計算並覆蓋 `settings/admin.tokenHash`。所有舊 session 會因雜湊不符而失去管理權限。

## 3. 本機環境變數

專案內已包含 `black-horse-7b932` 的公開 Web App config，不需建立 `.env.local`。如需連接其他 Firebase 專案，可複製 `.env.example` 為 `.env.local` 覆寫：

```bash
cp .env.example .env.local
```

`.env.local` 已由 Git 忽略。Firebase Web config 不是秘密，但管理 token 不可放在任何 `REACT_APP_*` 變數或提交至 Git。

## 4. 發布 Security Rules

登入 Firebase CLI 後執行：

```bash
npx firebase-tools use black-horse-7b932
npx firebase-tools deploy --only firestore:rules
```

規則位於 `firestore.rules`：

- 公開訪客只能取得 `isPublic` 的指定賽事。
- 匿名使用者必須以正確 tokenHash 建立有效 `adminSessions/{uid}` 才可管理賽事。
- 前端不可讀寫 `settings/admin`，也不可更新其他人的 session。
- audit log 只能新增，不能更新或刪除。

## 5. GitHub Pages production 發布

預設 Firebase config 已在程式中，因此可直接執行：

```bash
npm run deploy
```

管理 token 不會被編入靜態 bundle，管理員每次在後台登入時輸入。

正式站入口：

- 公開前台：`https://ym1247.github.io/black_horse/`
- token 管理後台：`https://ym1247.github.io/black_horse/?admin=1`
- 觀眾賽事網址：`https://ym1247.github.io/black_horse/?event=賽事代碼`

後台開啟雲端賽事後會自動產生最後一種網址及 QR Code。

## 離線與同步

Firestore 在支援的 Chrome、Safari、Firefox 啟用多分頁 IndexedDB 持久快取。離線時的寫入會先顯示在本機並排入佇列，恢復連線後同步；同一文件發生衝突時採 Firestore 的 last-write-wins 行為，因此稽核紀錄會另外保存每次操作。

Firestore 是現行版本唯一的正式賽事資料來源。後台不再讀寫瀏覽器 `localStorage` 賽事進度或歷史檔案庫；IndexedDB 僅由 Firebase SDK 用來維持離線快取與待同步寫入，不能視為另一份可手動載入的存檔。
