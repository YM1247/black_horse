# 開發紀錄

## 2026-08-08｜管理 token 登入診斷

- 將 Anonymous Auth 未啟用、網路失敗、請求限制與 Firestore tokenHash 驗證失敗分成不同錯誤訊息。
- token 被 Security Rules 拒絕時，明確提示 `settings/admin.tokenHash` 必須是原始 token 的 64 字元 SHA-256。
- 後台登入頁直接顯示「登入輸入原始 token、資料庫保存雜湊」的設定差異。
- Firebase 設定文件加入逐項登入失敗檢查表與自動化錯誤訊息測試。

## 2026-08-08｜兩敗淘汰與前後台入口分流

### 修改內容

- 報名階段新增「不淘汰／兩敗淘汰」賽制切換，賽事開始後固定設定。
- 完整賽程重算時同步計算敗場；啟用兩敗淘汰後，第二敗會自動標記淘汰並排除後續配對。
- 淘汰與棄賽使用不同狀態，保留淘汰選手的既有比分、排名與歷程。
- 舊本機存檔與既有 Firestore 賽事未包含新欄位時預設不淘汰。
- 網站根目錄改為公開查詢前台；管理介面移至 `?admin=1`，必須通過 token 才會載入。
- 每場雲端賽事產生包含賽事代碼的公開網址，以及瀏覽器本機產生、可下載的 QR Code。
- 公開前台新增賽制、敗場與兩敗淘汰狀態顯示。

### 驗證範圍

- 規則測試涵蓋第二敗淘汰、後續配對排除及一般瑞士制不淘汰相容性。
- UI 測試涵蓋預設公開入口、token 後台 gate 與賽制切換。
- 20 項自動化測試全數通過，production build 成功。
- `qrcode@1.5.4` 在瀏覽器內產生 QR；`npm audit` 仍為既有 CRA 工具鏈的 28 項結果，未出現 `qrcode` 相關弱點。`npm audit fix --force` 仍會破壞性改裝 `react-scripts@0.0.0`，因此未執行。

## 2026-08-07｜Phase 2 稽核紀錄檢視

### 修改內容

- 雲端後台加入目前賽事最近 50 筆操作紀錄，資料由 Firestore 即時更新。
- 稽核動作顯示中文名稱，並依操作呈現輪次、比分、選手、匯入人數或公開狀態等必要內容。
- 時間優先使用 Firestore server timestamp；尚在同步時改用既有 client timestamp，避免顯示空白。
- 新增稽核顯示工具測試，涵蓋比分、公開狀態、匯入人數與時間後備處理。

### 正式環境

- `firestore.rules` 已部署至 Firebase 專案 `black-horse-7b932` 並通過規則編譯。
- GitHub Pages 正式站持續由 `gh-pages` 分支發布。

## 2026-08-06｜Token-only 管理驗證

### 修改內容

- 移除固定管理員 Email 與 Email/Password Auth。
- 改用 Firebase Anonymous Auth，自動取得 Security Rules 所需 UID。
- 管理 token 在瀏覽器計算 SHA-256，資料庫只保存 `settings/admin.tokenHash`。
- 通過 token 驗證後建立 `adminSessions/{uid}`；所有管理寫入都重新確認目前 tokenHash。
- token 輪替會立即使舊 session 失效。
- 加入安全的本機 token 雜湊指令、Firebase 預設公開 config 與更新後的設定文件。

## 2026-08-06｜Phase 2 雲端操作與公開前台

### 修改內容

- 首頁加入公開賽事代碼查詢，可透過 `?event=CODE` 分享固定網址。
- 建立公開即時賽況頁，呈現輪次、比分、排名、對手勝率與同步來源。
- 建立管理 token 登入、雲端賽事建立、開啟及公開／關閉介面。
- 開啟雲端賽事後，本機操作以 400ms debounce 自動同步至 Firestore。
- 顯示讀取中、同步中、離線快取、已同步及錯誤狀態。
- 比分、歷史比分、選手、輪次、棄賽、評審數等操作附帶明確 audit action 與前後資料。
- 新增賽事使用 transaction 檢查代碼唯一，避免覆寫既有賽事。

### 相容模式

未提供 Firebase 環境設定時不顯示雲端後台，原有本機賽事仍可完整使用；公開網址會清楚顯示尚未設定 Firebase。

## 2026-08-06｜Firebase 資料層基礎

### 修改內容

- 安裝 Firebase Web SDK 12.17.1。
- 新增可選式 Firebase 初始化；未提供環境變數時維持本機模式。
- 啟用 Firestore 多分頁持久快取與 realtime snapshot metadata。
- 建立單一管理員 token 登入、賽事建立／更新／訂閱及後台列表 repository。
- 每次雲端變更以 batch 同步建立 audit log。
- 新增 Firestore Security Rules，限制管理員寫入並禁止更改稽核紀錄。
- 新增環境設定範本與完整 Firebase 設定文件。

### 驗證與相依安全

- 10 項自動化測試通過，production build 成功。
- `npm audit fix` 將稽核結果由 42 項降至 28 項。
- 剩餘項目位於已停止主要開發的 Create React App／`react-scripts` 工具鏈；npm 提供的 `--force` 修補會錯誤改裝 `react-scripts@0.0.0`，因此未採用。後續應獨立安排遷移至 Vite，不在 Firebase 功能批次中進行破壞性升級。

## 2026-08-06｜瑞士制規則核心重構

### 修改內容

- 抽出獨立、可測試的配對、比分重算與排名模組。
- 同勝場分組內以回溯搜尋優先產生零重賽組合；只有無其他組合時接受重賽。
- MC 配對會查詢歷史對手，仍有其他人選時不讓同一選手再次遇到 MC。
- 歷史比分更正改為由全部有效對戰重新計算成績。
- 棄賽前成績保留；當輪未完成對戰直接判為零票落敗。
- 排名新增對手勝率與對手的對手勝率，完全同分者標示需要加賽。

### 驗證

- 新增配對避重、MC 避重、比分重算、對手勝率排序及加賽標記測試。

## 2026-08-06｜Phase 2 技術決策

### 已確認

- 後端採 Firebase Spark 免費方案，使用 Cloud Firestore 與 Firebase Authentication。
- 後台以固定管理員 Email + 共用 token 登入；前台只呈現 token 欄位。
- 公開前台以賽事代碼查詢，使用 Firestore realtime listener 且不需重新整理。
- 支援瀏覽器持久快取與離線寫入同步。
- 重要修改建立不可更新、不可刪除的 audit log。
- 確認固定三輪、重賽避免、MC 次數、四層排名與棄賽判敗規則。

### 尚待

- Firebase Web App 公開設定、管理員 Email 與 UID。
- Phase 3 的系列積分及選手識別規則。

## 2026-08-06｜Phase 1 完成

### 修改內容

- 從新增表單、CSV 匯入、測試名單、選手列表、對戰卡片、即時排名及最終排名移除學校欄位。
- 賽事建立畫面新增三位／五位評審選項，預設五位。
- 比分按鈕依評審數動態產生，MC 對戰在列表與樹狀模式都能輸入比分。
- 評審人數加入目前進度、手動存檔、自動完賽存檔及離開前存檔。
- 歷史存檔版本升至 `v4`，並支援讀取 `v3` 及移除舊 `school` 欄位。
- 修正比分更新直接改動 React state 物件的問題。
- 為不支援 `crypto.randomUUID()` 的環境加入本地 ID 後備策略。
- 將 CRA 範例測試替換為 Phase 1 功能測試。
- 重寫 README，新增 Phase 1、架構、待確認問題與本開發紀錄。

### 實作方式

- 以 `normalizeTournamentData` 統一處理目前進度與歷史存檔，確保新舊資料使用同一遷移規則。
- 若舊資料缺少 `judgeCount`，從既有完成對戰的總票數推斷三位或五位評審，否則採預設五位。
- 由 `judgeCount` 產生全部合法比分，確保每個比分的兩方票數總和固定。
- 比分與排名更新使用物件複製，避免直接修改 React state。

### 驗證

- `npm test -- --watchAll=false`：3 項測試全數通過。
- `npm run build`：production build 成功。

### 尚未實作

Phase 2 與 Phase 3 涉及後端選型、權限、正式賽制細節、積分公式與外部表單資料契約。問題已記錄於 `docs/OPEN_QUESTIONS.md`，待確認後實作。
