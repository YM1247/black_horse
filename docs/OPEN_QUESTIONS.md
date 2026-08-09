# 核心設計決策與待確認問題

## 已確認：賽制規則

1. 每場賽事固定三輪。
2. 後續輪次必須優先避免重複對手；只有在同分組無其他合法組合時才允許重賽。
3. MC 是系統用來處理奇數人數的虛擬對手。對上 MC 的成績正常計入，但同一選手應避免再次對上 MC。
4. 排名依序比較：勝場、總票數、對手勝率、對手的對手勝率；仍相同者標示需要加賽，不由系統任意決定順序。
5. 棄賽前已完成成績保留；棄賽當輪尚未完成的對戰直接判敗，不重新抽籤。
6. 建立賽事時可選擇是否採用兩敗淘汰；啟用後，選手完成第二場敗局即標記淘汰，並排除於後續輪次配對之外。

## 已確認：Phase 2

1. 使用 Firebase Spark 方案與 GitHub Pages。
2. Firebase Web App 公開設定已納入程式，可由環境變數覆寫。
3. 後台只輸入一組管理 token，不使用 Email 帳號。
4. token 在瀏覽器計算 SHA-256；Firestore 僅保存雜湊，不保存明文。
5. Firebase Anonymous Auth 提供 Security Rules 所需的臨時 UID，通過 token 後建立 `adminSessions/{uid}`。
6. 每次管理寫入都確認 session tokenHash 仍等於 `settings/admin.tokenHash`，更換 token 可讓舊 session 失效。
7. 保存比分修改歷程，稽核紀錄建立後不可由前端更新或刪除。
8. 公開前台以賽事代碼查詢；賽事可永久保存，管理員可切換是否公開。
9. 使用 Firestore 即時 listener 與瀏覽器持久快取。
10. 公開前台與管理後台使用不同入口；後台必須先通過 token，公開賽事網址包含賽事代碼並可產生 QR Code。
11. Firestore 是賽事的唯一正式資料來源；建立賽事時立即寫入雲端，後台不再提供或讀取瀏覽器本機檔案庫。
12. 新賽事建立後預設公開；管理員仍可在雲端賽事管理視窗手動關閉公開狀態。

## Firebase 正式環境狀態

1. Firebase 專案 `black-horse-7b932` 與 Web App 已建立。
2. 最新版 `firestore.rules` 已於 2026-08-07 部署。
3. 管理 token 仍依 [FIREBASE_SETUP.md](FIREBASE_SETUP.md) 在 Firestore Console 管理；token 本身不可提交至 Git。
4. Anonymous provider 與 `settings/admin.tokenHash` 的實際設定需以正式站 token 登入測試確認。

## Phase 3：尚待確認

1. 四場積分賽的積分公式：各名次、參賽、勝場或票數分別取得多少分？
2. 並列、棄賽、取消資格、缺席與補賽如何計算系列積分？是否取最佳幾站或四站全計？
3. 跨場次如何識別同一選手：Email、電話、社群帳號、會員編號，或人工確認？公開頁面可顯示哪些個資？
4. Google Form 的實際欄位、試算表格式與存取方式為何？採定時同步、手動匯入，還是 Apps Script 主動通知？
5. 重複報名、改名與資料衝突由系統自動合併，還是進入後台待人工確認？
6. 賽事結果何時鎖定並累積積分？鎖定後更正結果是否需要重新計算整季排行榜與保留版本？
