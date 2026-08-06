# 黑馬記念｜瑞士制賽事系統

黑馬記念挑戰組使用的瑞士制配對與計分 Web App。目前完成 Phase 1：可建立單場三輪賽事、以三位或五位評審計分、抽選對戰、處理奇數參賽者的 MC 對戰、記錄棄賽、查看即時排名，並將進度與歷史存檔保存在瀏覽器。

## 已完成的功能

- 以選手名稱建立名單，支援逐筆新增及單欄 CSV 匯入。
- 建立賽事時選擇三位或五位評審；合法比分會依評審數自動產生。
- 第一輪隨機配對，後續輪次依勝場分組配對。
- 奇數選手時安排 MC 對戰，並允許正常輸入比分。
- 對戰列表與賽況樹狀圖。
- 即時排名、並列名次、棄賽與歷史賽果更正。
- 自動保存目前進度，另可建立、重新命名、讀取與刪除歷史存檔。
- 舊版資料自動遷移：讀取含 `school` 欄位的資料後轉為純名稱選手模型。

## 本機開發

需求：Node.js 18 以上與 npm。

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

目前資料僅保存在瀏覽器 `localStorage`，清除網站資料會移除賽事。Phase 2 將改為前後端分離並由伺服器保存；尚未確認的設計決策列於 [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)。

## 文件

- [Phase 1 實作說明](docs/PHASE1.md)
- [系統架構與演進方向](docs/ARCHITECTURE.md)
- [開發紀錄](docs/DEVELOPMENT_LOG.md)
- [待確認問題](docs/OPEN_QUESTIONS.md)
