# 公開介面上線與後台連動驗證（2026-11-16）

本次發布包含公開單場賽況／排名分頁、原圖水墨視覺、方框、精簡分隔線、搜尋高亮與 Enter 定位、系列返回、淘汰階段分組及名次。後台記分及資料庫規則維持原有機制。

## 資料連動

後台 SeasonAdmin 透過 saveCloudTournament / saveTournamentVersion 寫入 tournaments/{eventCode}；公開單場透過 subscribeTournament 的 Firestore onSnapshot 即時讀取同一文件。瑞士 round map 會還原為輪次陣列，playoffSeeds / bracket / phase 隨快照更新；畫面不使用概念圖或本機預覽資料。完賽未明確指定 view 時開排名；明確指定頁面連結仍優先。

新增資料庫整合測試由已授權管理員實際建立賽事、開始瑞士賽、寫入比分、抽選十六強、登錄淘汰比分及鎖定 BO3 完賽。另一個未登入的公開訂閱依每次 revision 收到更新，驗證 phase、rounds、比分、籤位與決賽／季軍戰結果，同時檢查不含私人姓名或電話欄位。

驗證使用獨立本機 Firestore 模擬器 127.0.0.1:8188，因既有 8080 已被使用；未操作正式賽事資料，未修改正式規則。應用測試 142 項、資料庫整合／權限測試 12 項通過。

## 部署

使用專案既有 npm run deploy（Vite 正式建置後發布 GitHub Pages）。正式產物排除 Live 注入、publicPreview 模組、本機測試工具列與模擬器設定。水墨素材與原始品牌圖片隨同發布。

公開入口：https://ym1247.github.io/black_horse/?event=BH2627S1
系列首頁：https://ym1247.github.io/black_horse/?series=BH2627

部署結果：來源提交 2ad2b24；GitHub Pages 發布提交 0937cc6e3c9a9537238b303b54d1db97ded746af，狀態 built。正式頁 HTTP 200，線上主程式 index-B-VXawzW.js 與樣式 index-CgtXOAur.css 的 SHA-256 與本機正式產物一致。正式第一場頁成功從快取切換為「即時更新中」，顯示雲端報名中狀態與最新更新時間。正式站沒有建立或更動測試賽事。

## 短頁背景斷層修正

正式第一場尚未開賽時，容器高 737px、main 高 761px，但絕對定位主視覺仍高 1100px，將文件高度推至 1100px；超出 main 底色範圍的裝飾產生頁尾斷層。修正為背景主視覺 top/bottom 限制在容器內、max-height 限制長頁主視覺，並保留原本圖片的顯示比例。底部導覽安全留白與無導覽的 24px 留白改放進背景容器，讓底色與水墨覆蓋完整頁高。

瀏覽器驗證：一般短頁視窗／文件／main／背景容器同高 720px；390×844 手機短頁文件高 844px；1440×1000 桌面短頁文件高 1000px，不再由裝飾層產生額外捲動。手機長排名頁 main 與背景容器均高 1906.5px，主視覺限制約 845px，後續重複紋理仍延伸，沒有橫向溢出。正式建置及差異檢查通過。

## 橫式寬螢幕灰邊修正

原水墨背景掛在最大 78rem（1248px）的內容容器上，寬螢幕外側只剩純炭灰。將兩個水墨裝飾層及隔離層移到全寬 public-ink 主頁，內容仍置中並限制 78rem；背景維持高度邊界與長頁重複紋理，避免重新造成短頁溢出。

驗證：1920×1080 下背景層寬 1920px、內容寬 1248px、文件高 1080px；844×390 橫式背景寬 844px，頁高 536px 來自實際內容；390×844 直式短頁高 844px。無橫向溢出，正式建置與差異檢查通過。

## 手機 Safari 安全區與品牌圖示

依手機截圖，白色出現在狀態列與瀏覽器底部安全區。原 html/body 沒有底色，viewport 未宣告 cover。依 WebKit 的安全區設計，新增 critical html/body 深色底與 color-scheme、viewport-fit=cover，並將 theme-color／manifest background/theme 統一為 #242728；主畫面模式加入黑色透明狀態列設定。公開標頭、返回按鈕、內容與底部導覽使用安全區內距，頁面最低高度支援 100dvh，縮放仍可使用。

參考：https://webkit.org/blog/7929/designing-websites-for-iphone-x/ 、https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html

品牌圖示以原始合圖的既有核准展示視窗匯出，僅改色與等比例縮放／補齊正方形畫布，沒有重繪；原圖 SHA-256 保持不變。提供 32px favicon、180px iOS touch icon、192/512px manifest icons，替換舊 React favicon.ico 與 logo192/512；來源流程記於 public/brand/icons.json。新圖示採新路徑，manifest／舊 favicon 加版本參數，降低快取干擾。

驗證建置圖示路徑正確，ICO／PNG 尺寸及原圖雜湊正確；390×844 下 html/body 均為 #242728、頁高 844px，844×390 無水平溢出，viewport／主題色／圖示宣告正確。實體 iPhone Safari 的系統工具列無法由桌面瀏覽器模擬驗收；實際瀏覽器仍控制其介面外觀。正式產物沒有 Live 注入與預覽資料。

## 水墨背景延伸至安全區

將水墨從 public-ink 內的裝飾偽元素移到 html 文件畫布背景，公開頁的 body/main 改透明，安全區與內容區共用同一份主視覺及下方重複水墨。原本會露出的獨立純色區不再作為第二個背景表面；內容仍保留 safe-area 內距。以 html:has(.public-ink) 限定公開頁，後台不套用此水墨。

主視覺以覆蓋漸淡層銜接下方週期紋理；背景不參與版面尺寸，延續前次短頁不被裝飾撐高、寬螢幕滿版的設計。Safari 工具列本身仍由系統繪製，網頁只控制文件畫布與安全區中的網頁內容。

正式建置與差異／設計檢查通過。本次瀏覽器驗收被工具自動核准機制拒絕，原因為使用額度上限，並非使用者拒絕；沒有改用其他途徑繞過瀏覽器核准。實體 iPhone 安全區視覺仍未驗收。
