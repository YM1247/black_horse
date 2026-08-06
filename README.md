# 黑馬記念｜瑞士制賽事系統

黑馬記念挑戰組使用的瑞士制配對與計分 Web App。目前完成 Phase 1：可建立單場三輪賽事、以三位或五位評審計分、抽選對戰、處理奇數參賽者的 MC 對戰、記錄棄賽、查看即時排名，並將進度與歷史存檔保存在瀏覽器。

## 已完成的功能

- 以選手名稱建立名單，支援逐筆新增及單欄 CSV 匯入。
- 建立賽事時選擇三位或五位評審；合法比分會依評審數自動產生。
- 第一輪隨機配對，後續輪次依勝場分組，並在組內優先避免重複對手。
- 奇數選手時安排 MC 對戰，成績正常計入且優先避免同一選手再次遇到 MC。
- 對戰列表與賽況樹狀圖。
- 即時排名依勝場、總票數、對手勝率、對手的對手勝率排序；完全同分者標示需要加賽。
- 棄賽保留已完成成績，當輪未完成對戰直接判敗。
- 自動保存目前進度，另可建立、重新命名、讀取與刪除歷史存檔。
- 舊版資料自動遷移：讀取含 `school` 欄位的資料後轉為純名稱選手模型。

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

測試涵蓋 Phase 1 的主要需求與舊資料遷移。正式建置輸出至 `build/`。

## CSV 格式

只讀取第一欄作為選手名稱，可有或沒有標題列：

```csv
選手名稱
Alice
Bob
```

為相容舊檔案，多餘欄位會被忽略。

## 資料保存

未設定 Firebase 時，資料保存在瀏覽器 `localStorage`。Phase 2 的 Firebase 資料層、即時 listener、離線快取、管理員驗證與 Security Rules 已建立；正式啟用方式見 [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)。

## 文件

- [Phase 1 實作說明](docs/PHASE1.md)
- [系統架構與演進方向](docs/ARCHITECTURE.md)
- [Firebase 設定與部署](docs/FIREBASE_SETUP.md)
- [開發紀錄](docs/DEVELOPMENT_LOG.md)
- [待確認問題](docs/OPEN_QUESTIONS.md)
