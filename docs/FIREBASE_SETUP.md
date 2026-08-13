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
- 公開訪客只能用已知代碼取得 `isPublic` 的系列投影，不能讀取私人 `series` 設定或列出投影集合。
- 匿名使用者必須以正確 tokenHash 建立有效 `adminSessions/{uid}` 才可管理賽事。
- 前端不可讀寫 `settings/admin`，也不可更新其他人的 session。
- audit log 只能新增，不能更新或刪除。
- 系列刪除 audit 只能由管理員建立及讀取，建立後不可更新或刪除。

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
- 觀眾系列網址：`https://ym1247.github.io/black_horse/?series=系列代碼`（模擬賽為 `SIM2026`）

後台開啟雲端賽事或系列首頁後，會自動產生對應網址及 QR Code。

## 離線與同步

Firestore 在支援的 Chrome、Safari、Firefox 啟用多分頁 IndexedDB 持久快取。公開前台可在離線時顯示快取；管理後台失去連線後立即切換為唯讀，恢復連線後才繼續送出操作。

管理 session 保存 `createdAt` 與 `expiresAt`，建立後 24 小時失效。更換 `settings/admin.tokenHash` 後，舊瀏覽器會在登入時先移除自己的失效 session，再使用新 token 建立 session，不需要清除網站資料。

賽事與系列文件具有遞增 `revision`。所有更新都必須由 transaction 將 revision 恰好增加 1；這項限制同時由 repository 與 Firestore Rules 驗證，用來阻止多台裝置以舊快照覆蓋新資料。

Firestore 是現行版本唯一的正式賽事資料來源。後台不再讀寫瀏覽器 `localStorage` 賽事進度或歷史檔案庫；IndexedDB 僅由 Firebase SDK 用來維持離線快取與待同步寫入，不能視為另一份可手動載入的存檔。

系列場次設定保存於 `series/{seriesId}`，只有通過管理 token 的後台可讀寫。新增場次先保存名稱、代碼與三位評審／兩敗淘汰標籤，再由管理員建立對應的 `tournaments/{eventCode}`。清除內容會保留系列設定、賽事名稱、公開狀態和 audit logs；完整刪除則移除賽事文件、其 audit logs 與系列場次設定。

公開系列資料保存於 `publicSeries/{publicCode}`。它只包含系列名稱、說明及存在且公開的場次摘要，不含私人系列設定、選手、比分、audit 或歷史版本。公開系列頁再訂閱摘要列出的公開單場文件，只有公開且已完賽的場次會計入系列積分。

後台以 400ms debounce 啟動序列化操作佇列，但每個操作各自保留 audit。若 revision 已落後，transaction 會拒絕寫入；後台載入雲端最新版並顯示本機操作摘要，管理員可逐筆選擇是否重新套用，不採 last-write-wins 靜默覆蓋。

Firestore 不接受陣列直接包含另一層陣列，因此資料庫中的 `rounds` 使用輪次編號 map，例如 `{ "1": Match[], "2": Match[] }`。前後台 repository 會自動轉換，畫面與瑞士制規則層仍使用原本的 `Match[][]`。新建賽事預設三位評審、兩敗淘汰且 `isPublic` 為 `true`，建立後觀眾即可透過賽事代碼讀取。
