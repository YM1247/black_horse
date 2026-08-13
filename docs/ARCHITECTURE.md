# 系統架構與演進方向

## Phase 1 歷史架構

目前是 Create React App 建立的單頁前端應用：

```text
React UI / 賽事規則
        |
        v
瀏覽器 localStorage
```

這是 Phase 1 曾使用的單機架構；目前正式系統已停用 `localStorage` 賽事進度與檔案庫，由下方 Phase 2 雲端架構完全取代。

## Phase 2 技術架構

Phase 2 應拆成三個明確責任：

```text
GitHub Pages
  ├── ?admin=1 後台 ── token gate ── Firebase Anonymous Authentication
  └── ?event={code} 公開前台 ──┐
                     └── Cloud Firestore
                          ├── tournaments/{eventCode}
                          ├── tournaments/{eventCode}/auditLogs/{logId}
                          ├── series/{seriesId}
                          ├── settings/admin
                          └── adminSessions/{uid}
```

- 後台：位於獨立 `?admin=1` 入口，只輸入單一共用 token；驗證前不載入賽事管理畫面。登入後可建立賽事、管理名單、產生輪次、輸入或更正比分、處理棄賽與結束賽事。
- Authentication：自動建立匿名 Firebase 使用者取得 UID，不要求 Email。token 在瀏覽器雜湊後由 Security Rules 驗證。
- Firestore：保存賽事狀態，透過 `onSnapshot` 即時同步。Web 端啟用 IndexedDB 持久快取以支援離線操作。
- 雲端唯一資料源：後台通過 token 後必須先建立或選擇 Firestore 賽事，才能操作管理畫面。建立賽事時直接保存空白報名狀態、評審人數與淘汰規則；不再讀取或建立瀏覽器本機存檔。
- 賽程序列化：領域層維持 `Match[][]`，寫入 Firestore 前將 `rounds` 轉為 `{ "1": Match[], "2": Match[] }`，讀取時再還原，避免 Firestore 禁止的直接巢狀陣列。
- 前台：網站根目錄為純查詢入口；`?event={code}` 直接查看指定賽事的輪次、比分、戰績與狀態。後台在瀏覽器內產生對應 QR Code，不使用第三方 QR 服務。
- 稽核：比分與重要狀態變更另外建立 audit log；Security Rules 禁止更新既有紀錄，只有完整刪除整場賽事時允許管理員一併刪除紀錄。後台即時顯示目前賽事最近 50 筆操作。
- 系列設定：`series/{seriesId}` 保存可編輯的場次名稱、代碼與賽制標籤。初次尚無文件時使用程式內建場次；第一次新增或刪除後，完整設定會寫入雲端。

為維持 Spark 免費方案，Phase 2 不依賴 Cloud Functions。重要原則是把配對、計分、排名等規則抽成可測試的領域層，前後台不可各自複製一份規則。賽事資料先保存為單一 Firestore document，以便離線與即時同步整體狀態；若未來規模接近 Firestore 單一文件限制，再將輪次與對戰拆成子集合。

### 多裝置同步

`tournaments/{eventCode}` 與 `series/{seriesId}` 以遞增 `revision` 實作樂觀並行控制。管理端每批操作攜帶讀取時的 revision，repository 在 transaction 中再次比對；若其他裝置已先寫入，舊資料不會覆蓋新版本，畫面會載入最新版並保留本機操作摘要供管理員重新確認。比分等操作各自建立 audit，不再由單一 debounce 紀錄互相覆蓋。

管理端無法連線時立即切成唯讀。暫時性錯誤會依 1、2、4、8、16 秒重試；切換賽事、回首頁與登出前必須先完成同步。

## 兩敗淘汰規則

- `doubleElimination` 是賽事層級布林設定；舊資料缺少此欄位時視為 `false`。
- 每次比分更新都由完整有效賽程重新計算勝、敗與票數，避免歷史比分更正留下過期淘汰狀態。
- 啟用後，`losses >= 2` 的選手標記 `isEliminated`；排名與過往成績保留，但下一輪配對會排除該選手。
- `isWithdrawn` 與 `isEliminated` 分開保存，避免把規則淘汰誤當成選手主動棄賽。

## 安全模型

- 公開使用者只能讀取 `isPublic == true` 的指定賽事。
- 管理員匿名 UID 必須具有 `adminSessions/{uid}`，且 session 雜湊符合不可由前端讀取的 `settings/admin.tokenHash`。
- `settings/admin` 不允許任何前端讀寫，需由 Firebase Console 建立。
- 管理 session 只能由本人建立或刪除，不能更新；token 變更後舊 session 立即無效。
- audit log 僅允許管理員新增，所有前端使用者都不可修改或刪除。
- 系列設定只允許管理員讀寫。管理員執行「刪除場次」時可刪除該賽事的 audit logs；一般操作仍不可更新既有 audit log。
- 切換賽事、返回列表與登出會先送出最後一次雲端狀態；一般操作仍以短暫 debounce 合併寫入。
- 編輯器保存目前待同步狀態的序列值；在本機變更尚未被 Firestore 確認時，較舊的 snapshot 不得覆蓋畫面，只有初始讀取、無本機變更或內容吻合的確認 snapshot 才能套用。
- Firebase Web 設定本身不是秘密；管理 token、Firebase CLI 登入資訊與本機 `.env` 不可提交。
- 完賽結果由 `resultLocked` 保護；更正與回復必須同時遞增 revision、currentVersion 並建立 `tournaments/{eventCode}/versions/{versionId}`。版本禁止更新，詳細行為見 [RESULT_VERSIONING.md](RESULT_VERSIONING.md)。

## 免費方案考量

Firebase Spark 目前提供 Firestore 每日免費讀寫額度，且一般 Email/Password Authentication 可在免費方案使用。公開前台採「輸入代碼後直接監聽單一賽事文件」，避免持續監聽整個賽事集合造成不必要讀取。

官方參考：

- [Firestore 即時更新](https://firebase.google.com/docs/firestore/query-data/listen)
- [Firestore 離線資料](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Anonymous Authentication](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Firebase Spark 方案](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

## Phase 3 目標邊界

在 Phase 2 的永久資料上新增：

- 跨賽事的唯一選手資料。
- 系列賽與各站賽事的關聯。
- Google Form 報名匯入與重複資料對應流程。
- 單站結果轉換為系列積分的規則與可稽核明細。
- 系列排行榜公開查詢。

單場名次積分已依 [POINTS_RULES.md](POINTS_RULES.md) 實作為可測試的純函式，完賽時由既有 `displayRank` 即時計算。「模擬賽」已接上可編輯的雲端場次設定與跨場彙總，各場由賽事代碼關聯既有 `tournaments/{eventCode}` 文件，不新增另一份可過期的排名資料。跨系列選手識別與公開排行榜仍屬後續範圍。

### 模擬賽系列資料流

```text
series.js 初始設定 / series/{seriesId} 雲端設定
  ├── MOCK819（8/19）─┐
  ├── MOCK821（8/21）─┼── 完賽名次積分 ── 依精確選手名稱彙總 ── 後台系列排名
  └── MOCK826（8/26）─┘
```

每場各自擁有報名名單及完整賽事狀態，均固定為三位評審、兩敗淘汰。初始代碼為上圖三場，之後可由後台新增或刪除；新建文件會包含 `seriesId` 與 `seriesEventId`，賽事代碼作為場次與賽事文件的關聯鍵。詳細行為見 [SIMULATION_SERIES.md](SIMULATION_SERIES.md)。

## 建議的實作順序

1. 將現有配對、計分、排名與資料遷移從 `App.js` 抽成純函式並增加規則測試。
2. 定義 Firestore schema、Security Rules 與賽事狀態機。
3. 實作 Firebase 初始化、後台驗證與賽事 repository。
4. 將目前操作畫面改接 repository。
5. 建立公開唯讀前台與即時更新。
6. 加入後台操作稽核檢視與正式環境驗證。
7. 再加入報名匯入、選手合併、系列積分與排行榜。

正式連線設定與尚待人工驗證項目記錄於 [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)。
