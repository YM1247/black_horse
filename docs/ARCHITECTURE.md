# 系統架構與演進方向

## 現行架構（Phase 1）

目前是 Create React App 建立的單頁前端應用：

```text
React UI / 賽事規則
        |
        v
瀏覽器 localStorage
```

`src/App.js` 同時負責畫面、瑞士制配對、比分計算、排名與本地保存。這適合單機操作，但無法讓前台觀眾即時查詢，也缺乏伺服器端的一致性、權限控管與永久保存。

## Phase 2 技術架構

Phase 2 應拆成三個明確責任：

```text
GitHub Pages
  ├── 後台管理介面 ── Firebase Anonymous Authentication
  └── 公開查詢前台 ──┐
                     └── Cloud Firestore
                          ├── tournaments/{eventCode}
                          ├── tournaments/{eventCode}/auditLogs/{logId}
                          ├── settings/admin
                          └── adminSessions/{uid}
```

- 後台：只輸入單一共用 token，建立賽事、管理名單、產生輪次、輸入或更正比分、處理棄賽與結束賽事。
- Authentication：自動建立匿名 Firebase 使用者取得 UID，不要求 Email。token 在瀏覽器雜湊後由 Security Rules 驗證。
- Firestore：保存賽事狀態，透過 `onSnapshot` 即時同步。Web 端啟用 IndexedDB 持久快取以支援離線操作。
- 前台：以公開網址查看指定賽事的輪次、比分、戰績與狀態。
- 稽核：比分與重要狀態變更另外建立 audit log；Security Rules 禁止更新或刪除既有紀錄。

為維持 Spark 免費方案，Phase 2 不依賴 Cloud Functions。重要原則是把配對、計分、排名等規則抽成可測試的領域層，前後台不可各自複製一份規則。賽事資料先保存為單一 Firestore document，以便離線與即時同步整體狀態；若未來規模接近 Firestore 單一文件限制，再將輪次與對戰拆成子集合。

## 安全模型

- 公開使用者只能讀取 `isPublic == true` 的指定賽事。
- 管理員匿名 UID 必須具有 `adminSessions/{uid}`，且 session 雜湊符合不可由前端讀取的 `settings/admin.tokenHash`。
- `settings/admin` 不允許任何前端讀寫，需由 Firebase Console 建立。
- 管理 session 只能由本人建立或刪除，不能更新；token 變更後舊 session 立即無效。
- audit log 僅允許管理員新增，所有前端使用者都不可修改或刪除。
- Firebase Web 設定本身不是秘密；管理 token、Firebase CLI 登入資訊與本機 `.env` 不可提交。

## 免費方案考量

Firebase Spark 目前提供 Firestore 每日免費讀寫額度，且一般 Email/Password Authentication 可在免費方案使用。公開前台採「輸入代碼後直接監聽單一賽事文件」，避免持續監聽整個賽事集合造成不必要讀取。

官方參考：

- [Firestore 即時更新](https://firebase.google.com/docs/firestore/query-data/listen)
- [Firestore 離線資料](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Email/Password Authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase Spark 方案](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

## Phase 3 目標邊界

在 Phase 2 的永久資料上新增：

- 跨賽事的唯一選手資料。
- 系列賽與各站賽事的關聯。
- Google Form 報名匯入與重複資料對應流程。
- 單站結果轉換為系列積分的規則與可稽核明細。
- 系列排行榜公開查詢。

## 建議的實作順序

1. 將現有配對、計分、排名與資料遷移從 `App.js` 抽成純函式並增加規則測試。
2. 定義 Firestore schema、Security Rules 與賽事狀態機。
3. 實作 Firebase 初始化、後台驗證與賽事 repository。
5. 將目前操作畫面改接 API。
6. 建立公開唯讀前台與即時更新。
7. 再加入報名匯入、選手合併、系列積分與排行榜。

正式連線仍需要 [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) 列出的 Firebase Web App 設定與管理員 UID。
