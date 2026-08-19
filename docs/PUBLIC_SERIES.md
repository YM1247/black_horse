# 公開系列賽

## 公開網址

系列公開頁使用 `?series={publicCode}`，目前模擬賽的固定網址代碼為 `SIM2026`。後台系列首頁會顯示可複製連結及可下載的 QR Code。

單場頁仍使用 `?event={eventCode}`。由公開系列頁進入單場時不需要管理 token；系列中的單場賽事若設為未公開，觀眾無法讀取。

## 公開投影

私人系列設定保存在 `series/{seriesId}`，只允許管理員讀取。公開頁不直接讀取此文件，而是讀取安全投影：

```text
publicSeries/{publicCode}
  publicCode
  name
  description
  isPublic
  events[]
    id
    name
    eventCode
    judgeCount
    doubleElimination
  sourceSeriesId
  sourceRevision
  updatedAt
  clientUpdatedAt
```

管理後台登入並收到系列或賽事公開狀態更新後，會重建投影。只有「系列場次設定仍存在、對應賽事文件已建立、賽事 `isPublic=true`」三個條件同時成立的場次會出現在 `events`。投影不包含選手、比分、內部 audit 或版本資料。

若系列 `isPublic=false`，文件可以保留供重新開放，但 Firestore Rules 會拒絕觀眾讀取。觀眾也不能列出整個 `publicSeries` collection，只能用已知代碼取得單一公開文件。

## 排名資料流

公開頁先訂閱系列投影，再分別訂閱投影列出的公開單場賽事。系列排名直接使用管理頁共用的 `buildSeriesStandings`：

1. 未公開場次不在投影內，因此完全不下載、不顯示、不計分。
2. 公開但尚未完賽的場次顯示狀態及單場連結，但不累加積分。
3. 公開且已完賽的場次依單場排名積分累計。
4. 完賽更正或版本回復更新單場文件後，公開系列頁會由即時訂閱自動重新計算，不保存另一份可能過期的排行榜。

## 公開畫面排名版型

- 手機使用直向選手卡片，卡片頂部顯示名次、姓名與總積分，下方直接列出每場積分，不依賴水平捲動或 sticky 姓名欄。
- 平板與桌面使用橫向表格，保留名次與姓名固定欄，各場積分與總積分保留最小欄寬。

## 離線狀態

當瀏覽器離線或 Firestore 回傳快取資料時，公開系列頁會顯示醒目警告、最後更新時間及重試按鈕。快取內容只供查看，不會被當成新的排行榜資料寫回雲端。
