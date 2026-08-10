# 黑馬記念｜瑞士制賽事系統

黑馬記念積分賽使用的瑞士制配對與計分 Web App。目前已完成單場賽制與 Phase 2 的 Firebase 架構：可建立三輪賽事、選擇三位或五位評審、啟用兩敗自動淘汰、處理 MC 與棄賽，並透過獨立的 token 後台及公開即時前台管理與查看賽事。

## 已完成的功能

- 以選手名稱建立名單，支援逐筆新增及單欄 CSV 匯入。
- 建立賽事時選擇三位或五位評審；預設為三位評審，合法比分會依評審數自動產生。
- 建立賽事時可切換淘汰規則；預設啟用兩敗淘汰，選手累積第二敗後不再參與後續輪次。
- 第一輪隨機配對，後續輪次依勝場分組，並在組內優先避免重複對手。
- 奇數選手時安排 MC 對戰，成績正常計入且優先避免同一選手再次遇到 MC。
- 對戰列表與賽況樹狀圖。
- 即時排名依勝場、總票數、對手勝率、對手的對手勝率排序；完全同分者標示需要加賽。
- 單場名單上限 32 人；完賽後依固定名次級距計算積分，參賽不足 32 人仍按實際名次計算。
- 後台內建「模擬賽」系列，分別管理 8/19、8/21、8/26 三場獨立報名賽事，並即時計算已完賽場次的跨場積分排名。
- 棄賽保留已完成成績，當輪未完成對戰直接判敗。
- 後台登入後必須建立或選擇雲端賽事；建立當下即寫入 Firestore 並預設公開，後續操作自動同步。
- 不需 Email 的 Firebase 管理 token 登入、雲端賽事建立、公開狀態切換、離線快取及操作稽核。
- 切換賽事、返回雲端列表或登出前會先補送最後狀態；不再提供瀏覽器本機檔案庫。
- 雲端後台即時查看目前賽事最近 50 筆操作紀錄。
- 雲端賽事列表使用全螢幕管理頁；本機有待同步操作時會忽略較舊的 Firestore snapshot，避免按鈕狀態短暫回彈。
- 觀眾以 `?event=賽事代碼` 開啟公開頁，即時查看輪次、比分與排名。
- 公開賽事頁提供完整瑞士制樹狀圖，依輪次與勝場分組即時呈現所有對戰。
- 後台為獨立 `?admin=1` 入口，未通過管理 token 前不載入任何賽事操作介面。
- 後台為每場雲端賽事產生公開網址與可下載 QR Code。

## 正式入口

- 公開前台：`https://ym1247.github.io/black_horse/`
- 管理後台：`https://ym1247.github.io/black_horse/?admin=1`
- 指定賽事：`https://ym1247.github.io/black_horse/?event=賽事代碼`

## 本機開發

需求：Node.js 20 以上與 npm。

```bash
npm install
npm start
```

瀏覽器開啟 [http://localhost:3000](http://localhost:3000)。

## 驗證

```bash
npm test -- --watchAll=false
npm run build
```

測試涵蓋 Phase 1 的主要規則、雲端賽事初始設定與前後台入口。正式建置輸出至 `build/`。

## CSV 格式

只讀取第一欄作為選手名稱，可有或沒有標題列：

```csv
選手名稱
Alice
Bob
```

為相容舊檔案，多餘欄位會被忽略。

## 資料保存

賽事只保存於 Cloud Firestore，不再讀寫瀏覽器 `localStorage` 賽事進度或歷史存檔。Firestore 的 IndexedDB 持久快取仍負責短暫離線佇列，恢復連線後自動同步，但它不是可由使用者管理的另一套存檔。正式設定方式見 [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)。

## 文件

- [Phase 1 實作說明](docs/PHASE1.md)
- [系統架構與演進方向](docs/ARCHITECTURE.md)
- [Firebase 設定與部署](docs/FIREBASE_SETUP.md)
- [積分賽名次積分規則](docs/POINTS_RULES.md)
- [模擬賽系列賽設定與操作](docs/SIMULATION_SERIES.md)
- [開發紀錄](docs/DEVELOPMENT_LOG.md)
- [待確認問題](docs/OPEN_QUESTIONS.md)
