---
version: 1
slug: "src-publictournamentpage-jsx"
primary_target: "src/PublicTournamentPage.jsx"
related_targets: ["src/PublicSeriesPage.jsx"]
---

# 公開賽事與系列頁

模式 Operate。現場選手與觀眾用手機查對戰、比分、排名。沿用 event／series 深層連結，後台與賽制不變。

## Direction contract

THESIS: A 的賽況結構配 B 的墨馬識別，柔和水墨；先搜尋與當前輪次，再讀完整賽程。

OWN-WORLD: 炭灰 #242728、暖白 #eeeae3、灰藍 #b7cbd0、低飽和紅 #d18d90。原始 Logo／書法合圖直接引用，只改顏色、保持比例。獨立 ink-wash-v2.png；細分隔、12–16px 圓角、對齊比分。

STORY: 開啟現有連結，看懂狀態，搜尋並選定選手，看到其當輪對戰，再看同輪對戰與排名。選擇只保留當頁，不儲存個資、不變首頁預設。

FIRST VIEWPORT: 390px 手機原圖識別居中高約212px；賽事標題後為搜尋、輪次與個人對戰，再接對戰列、排名。桌面將對戰與排名分欄。真實賽事狀態及切換代碼收於次要入口；實際內容與例圖文字不同屬產品資料適配。

FORM: 種子6849939d，第7項場邊記分板，使用者選 A 介面＋B 識別、柔和水墨修訂。批准 comp .impeccable/mocks/decision/ab-ink-v2.jpg；原始網頁 ab-ink-v2.html。年份移除、Logo不重繪。簽名互動：搜尋選手顯示當輪對戰，比分更新不改選擇；過渡僅小幅狀態色，支援減少動態。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 核准後的精簡修訂

使用者要求底部導覽移除圖示、隱藏目前沒有用途的操作，並統一提示與按鈕風格。導覽僅列出有資料的目的地，少於兩項時省略；報名前階段不顯示搜尋、空排名或無目標的完整賽程連結。已開賽的資料、比分與完整籤表仍保留。次要操作使用文字或柔和細框，離線／錯誤共用炭灰提示，真正斷線時不顯示重試。此為原水墨系統內的精簡，不重啟主視覺選擇，也不改品牌來源。
