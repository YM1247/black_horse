---
name: 黑馬記念公開賽事
description: 炭灰水墨中的場邊記分板，讓選手快速讀懂對戰與比分。
colors:
  charcoal: "#242728"
  panel: "#2b3132"
  field: "#303637"
  personal-slab: "#343c3d"
  warm-white: "#eeeae3"
  blue-gray: "#b7cbd0"
  wine: "#d18d90"
  divider: "#566063"
  field-border: "#738184"
  action: "#b9cdd1"
  action-hover: "#d2dfe1"
  action-ink: "#202627"
  link: "#c4d6da"
typography:
  page-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: ".06em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  match-name:
    fontSize: ".9375rem"
    fontWeight: 500
  personal-name:
    fontSize: "clamp(1.25rem, 5vw, 1.625rem)"
    fontWeight: 600
  score:
    fontSize: "1.125rem"
    fontWeight: 500
  personal-score:
    fontSize: "clamp(1.375rem, 5vw, 1.75rem)"
    fontWeight: 500
  label:
    fontSize: ".75rem"
    fontWeight: 400
  navigation:
    fontSize: ".875rem"
    fontWeight: 400
rounded:
  field: "0"
  personal-slab: "0"
  panel: "0"
spacing:
  tight: "8px"
  control: "12px"
  mobile-gutter: "18px"
  desktop-gutter: "36px"
  desktop-columns: "40px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.field}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.action-ink}"
  search-field:
    backgroundColor: "#303637ed"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.field}"
    padding: "0 14px"
  personal-match:
    backgroundColor: "{colors.personal-slab}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.personal-slab}"
    padding: "18px 13px"
  round-tab:
    textColor: "#c6cfd0"
    typography: "{typography.body}"
    padding: "9px 6px 12px"
  round-tab-active:
    textColor: "{colors.warm-white}"
  data-row:
    textColor: "{colors.warm-white}"
    padding: "10px 0"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
  bottom-nav:
    backgroundColor: "{colors.charcoal}"
    textColor: "#d0d8d7"
    typography: "{typography.navigation}"
---

# Design System: 黑馬記念公開賽事

## Overview

**Creative North Star: "水墨場邊記分板"**

原圖墨馬與書法建立品牌，安靜的炭灰場地承接即時數據。暖白文字、灰藍資訊與低飽和酒紅保留水墨的柔和感；介面以可辨識的選手、對齊比分和細分隔維持現場查詢的速度。

本文件只約束已實作的公開單場與系列頁，以及共享籤表的公開模式。依據為 `src/public.css`、`src/PublicLayout.jsx`、`src/PublicEventLive.jsx`、`src/PublicTournamentPage.jsx`、`src/PublicSeriesPage.jsx` 與 `src/PublicTournamentBracket.jsx` 的 `publicView` 分支。公開樣式的邊界是 `.public-ink`；後台沿用既有樣式，不繼承此色盤或排版規範。

**Key Characteristics:**
- 同一張原始墨馬與書法合圖，搭配獨立水墨背景。
- 炭灰底、暖白正文、灰藍次要資訊、少量酒紅狀態。
- 輕字重、軟圓角、細分隔，比分使用等寬數字對齊。
- 手機單欄延伸，桌面分開賽況與排名；長內容保留底部導覽。

## Colors

以中性炭灰作底，灰藍作資訊與操作，低飽和酒紅集中提示選取和焦點。

### Primary
- **水霧灰藍** (`action` / `action-hover` / `action-ink`)：查詢與首頁的主要操作；淺底配深字。系列場次屬次要操作，改用細框深底。
- **酒紅** (`wine`)：輪次與導覽的選取底線、輸入游標及鍵盤焦點。勝者與計分結果另用同色系較淺文字，不用大面積紅底。

### Neutral
- **炭灰** (`charcoal`)：頁面與固定導覽的基底。
- **墨色層次** (`panel` / `field` / `personal-slab`)：系列容器、輸入與個人對戰的三種局部底色。
- **暖白** (`warm-white`)：正文、選手與核心比分。
- **灰藍** (`blue-gray`)：同步時間、先後攻、票數、次級戰績與提示。
- **霧線** (`divider` / `field-border`)：資料列分隔與互動輸入邊界。
- **淺灰藍連結** (`link`)：一般文字連結，滑過轉為白色。

**The Public Boundary Rule.** 此色盤只在公開頁面及明確啟用的共享元件生效；共享籤表的後台預設色盤仍獨立存在。

## Typography

**Body Font:** 平台系統無襯線，中文依序回退至 PingFang TC、Noto Sans TC。
**Display Artwork:** 品牌書法直接來自原始圖片，沒有可替代的展示字型。

**Character:** 操作文字平實、清晰、重量節制；原始筆觸承擔展示個性。不要以西文字型推測值替換實際中文介面字體。

### Hierarchy
- **Page title**：使用 `page-title`，桌面自 768px 起增為 (1.25rem)。它是賽事名稱，不與原圖書法競爭。
- **Headline**：使用 `headline`，標示當輪對戰、即時排名等區段。
- **Body / fields**：使用 `body`；輸入字級維持 (16px)。
- **Match names**：一般資料列使用 `match-name`；小於 360px 時降為 (.875rem)。選定選手的對戰使用 `personal-name`。
- **Scores**：一般比分使用 `score`，個人比分使用 `personal-score`；兩者使用 `tabular-nums`。完整瑞士樹既有比分另使用等寬字體。
- **Labels**：使用 `label` 承載先後攻與時間；一般對戰狀態另縮為 (.6875rem)，仍以完整文字辨識狀態。

**The Original Lettering Rule.** Logo 與「黑馬記念」必須使用同一張原圖；不可重繪、替字、拆分、重排、改筆觸或比例。公開品牌不加「26–27」。

## Layout

公開容器置中，最大寬 (78rem)。手機內容左右留 `mobile-gutter`；小於 360px 時縮為 (12px)，768px 起改為 `desktop-gutter`。手機單欄的賽況、排名向下延伸，桌面賽況與排名改為 (1.5fr / 1fr)，間距使用 `desktop-columns`。完整瑞士樹與系列場次在 (768px) 起分兩欄，(1280px) 起可分三欄。系列積分在手機為選手卡片，桌面為可在容器內橫向捲動、保留排名與選手欄的表格。

原始品牌圖片以 (240px) 寬、等比例高度渲染，既有識別視窗高 (212px)，圖片垂直位移 (-88px)；這是對原始留白的展示處理，不改動來源圖檔。主視覺下方的標題、狀態、搜尋、輪次與個人對戰建立此頁讀取順序；這個單頁策略的完整合約留在 `.impeccable/surfaces/src-publictournamentpage-jsx.md`。

個人對戰採三欄，兩側 `minmax(0, 1fr)`，中間至少 (75px)。一般對戰採選手／比分／選手／狀態四欄，手機中間比分 (64px)、狀態 (60px)，桌面分別為 (76px / 64px)；極窄螢幕改為 (53px / 52px)。選手姓名可換行，比分不拆行。列高至少 (53px)。

底部導覽只在有兩個以上可用目的地時固定於視窗底部，內容預留 (4rem) 加安全區；沒有導覽時底部留 (24px)。導覽、查詢、搜尋和選擇操作保留 (44–48px) 的觸控高度；導覽處理底部安全區，頁內錨點留 (18px) 捲動間距。

## Elevation & Depth

主要層次來自背景水墨、不同深度的炭灰底色與單像素細線。個人對戰是平放的柔和色塊；公開完整籤表移除原本卡片與標題的陰影，雙像素邊框縮為單像素。系列桌面表格保留既有黏住欄位的邊緣陰影，僅用來區分水平捲動內容。

### Shadow Vocabulary
- **Sticky-column edge** (`8px 0 12px rgba(0,0,0,0.35)`)：只用於系列排名的固定選手欄邊緣。

**The Ink Ground Rule.** 使用 `public/brand/ink-wash.webp` 提供水墨材質，內容容器保持平實，讓原始筆觸與比分承擔視覺重點。

## Shapes

輸入框、搜尋結果選擇與主要按鈕使用 `field` 圓角。個人對戰使用 `personal-slab`，系列主容器使用 `panel`。資料列不包成卡片，以底線串接。完整籤表沿用 (8px / 12px) 的內外圓角；系列名次保留緊湊圓形標記，場次狀態改用純文字。

## Components

### Buttons

柔和淺底，明確但不厚重。主要按鈕使用 `button-primary`，最小高 (46px)，文字字重 (600)，滑過使用 `button-primary-hover`。搜尋結果按鈕使用深色 `field` 底、`field-border` 細框、暖白文字，內距 (8px 14px)，最小高 (44px)，滑過底色變為 (#455053)。停用操作不透明度為 (.55)，使用不可操作游標。

### Inputs / Fields

搜尋欄含內嵌線條放大鏡，最小高 (46px)，左右內距 (14px)，外框為 `field-border`，內部輸入透明。代碼欄同為柔和圓角、深底淺字，內距 (10px 12px)。placeholder 清晰可見。焦點使用酒紅 (2px) 外框，搜尋複合欄透過 `focus-within` 顯示一次焦點，不重疊內框。

### Navigation

輪次超過一輪或存在淘汰賽時才顯示切換列，平均分配並可換行，字級 (1rem)，選取加重為 (600)，底部有酒紅 (3px) 短線。固定底部導覽只用 (14px) 文字、不含圖示，僅列出目前有內容的賽況、排名或系列目的地；不足兩項就不顯示。系列頁使用場次／排名兩個目的地，沒有成績時不顯示排名導覽。選取依頁內位置使用淺酒紅文字與 (2px) 底線。一般區段連結以文字底線表示可前往，沒有額外按鈕容器。

### Cards / Containers

個人對戰使用 `personal-match`，選手在兩側、比分置中，先後攻與進度緊接主資訊。一般對戰與單場排名使用細線資料列；系列場次、系列排名和淘汰籤表使用 `panel` 深色底及細邊框。系列手機排名保留各站計分分格，桌面表格保留欄位捲動能力。

### Status Tags and Feedback

系列場次狀態以灰藍純文字顯示報名中、進行中、已完賽，不加彩色膠囊。同步、時間與一般空狀態以灰藍文字融入頁面。離線和錯誤提示共用炭灰底、12px 圓角與細框；錯誤使用柔和酒紅文字與邊框，離線不使用鮮黃底色。確實斷線時不顯示無法執行的重試操作，只有已連網但仍顯示快取時提供文字重試。分數存在而比賽尚未結束時顯示「進行中」；只有完成的對戰加重勝者，不靠顏色單獨表意。

### Available Actions Only

尚無賽程時不顯示選手搜尋、空排名或完整賽程連結；只保留一則公布前提示與需要的系列入口。系列未有完賽成績時不顯示搜尋及空表格。查詢欄空白時不顯示送出按鈕。次要操作使用細框或底線文字，系列場次連結以深底淺字細框顯示；清除選手使用文字，不再加入額外圖示。代碼保留於切換表單，避免在標題與預設提示中重複顯示。

### Brand and Personal Match

品牌來源唯一是 `public/brand/black-horse-original.png`，SHA-256 為 `be2256985b298c34e361b1244f966d59371904add6afb84e8f3c379dae250aa8`。目前以 CSS 色彩轉換與混色呈現暖白原圖；來源檔保持原樣。背景 `public/brand/ink-wash.webp` 獨立於品牌原圖，生成來源記錄在同名 `.json` sidecar。

搜尋選定打師名後顯示個人當輪對戰，比分更新保留目前選擇，切換賽事時重設；個人選擇僅在當頁狀態。互動過渡只改文字與底色，時長 (140ms)、`ease-out`，減少動態偏好下取消過渡。

## Do's and Don'ts

### Do:
- **Do** 保留原始墨馬與書法合圖，使用現有展示比例與來源資產。
- **Do** 以完整選手名稱、對齊比分、先後攻及進度文字共同呈現對戰。
- **Do** 讓姓名換行，讓長表格在自己的容器內捲動，保留底部安全區與可見焦點。
- **Do** 將公開色盤限制在公開頁與共享元件的公開模式。
- **Do** 以實際同步與完賽狀態驅動提示及勝者樣式。

### Don't:
- **Don't** 重繪或重排原始 Logo，替換書法文字，改動筆觸或比例，或在公開品牌加上年份數字。
- **Don't** 把公開色盤、字重與組件覆寫推進後台。
- **Don't** 用大面積紅色取代現有克制的選取與焦點提示。
- **Don't** 把合成示意資料、舊概念頁的例外或量測字型猜測當成已實作規範。

## 2026-11-16 方框與長頁背景修訂（取代前述圓角規範）

公開介面全面使用零圓角，涵蓋搜尋、按鈕、提示、個人對戰、系列場次／排名及共享公開淘汰籤表。細框搭配半透明炭灰底，讓背景水墨透出；後台不變。主要按鈕改深色半透明底、暖白字、灰藍細框，滑過稍微加深。

當輪對戰依該輪開賽快照分為 2-0、1-1 等組；不同戰績標為跨組，合作賽仍依票數組。各選手顯示勝敗與票數，移除「賽前」字樣；左右對稱、比分置中。此為資訊呈現修訂，不改配對規則。

背景分兩層：原始 ink-wash.webp 保留主視覺，往下淡出；ink-repeat.webp 自 400px 起以 1000px 週期重複，週期上下緣透明遮罩融入炭灰，任意長度維持低對比水墨。新紋理來源記錄於 public/brand/ink-repeat.json。Logo 原圖完全不變。

## 單場分頁導覽（2026-11-16）

單場賽況與排名各為獨立顯示頁面，網址用 view=matches／view=ranking。沒有明確選頁時，完賽且有成績預設排名，其餘預設賽況；不再將兩者上下堆疊或桌面分欄。底部目前頁以 aria-current=page 與原有酒紅底線表示，切換保留當輪與選手選擇。各頁最大寬 58rem、置中。系列頁的場次與排名仍沿用區段導覽。

## 搜尋與標頭更新（2026-11-16）

單場已載入時不顯示切換代碼欄。只有所屬系列存在的單場，在頂部左側顯示「返回系列賽」方框連結。進度與同步狀態合成一列，更新時間緊接於下。底部只保留賽況與排名。

搜尋改為完整賽程中的即時高亮，取代原個人對戰卡／搜尋候選按鈕；使用灰藍低透明底與細框，Enter 或手機搜尋鍵前往首個符合對戰，焦點用酒紅細框。輪次與淘汰賽皆支援，查無結果保留所有對戰並提示。組字期間不送出；減少動態偏好採立即捲動。

## 公開勝敗辨識與淘汰賽層級（2026-11-16）

已完成對戰的勝方姓名暖白加重並附「勝」字，敗方姓名使用 #929e9f、正常字重；未完成時不標勝敗。公開淘汰對戰移除可見場次與籤位數字，只保留階段名稱及先後攻，內部資料與無障礙場次名稱維持唯一。淘汰程式以 publicView 與後台隔離；輪次選單放在淘汰籤表下方，再接可回查的瑞士輪次內容。

## 淘汰階段共用標題（2026-11-16）

公開淘汰賽使用如瑞士組別的直式分區，每階段一個標題，下方直接排列對戰，不逐場重複八強或四強。一般列高約 64px，姓名上、先後攻下，比分居中；長名自然換行。移除所有「勝」標籤，勝方暖白加重、敗方較暗灰藍。取消外層卡框，保留階段與對戰列細線。公開合作賽也採分區，保留冠軍 BO3 逐局票數；後台樹狀圖獨立保留。

公開淘汰區主標題統一「淘汰賽」。其下選單只列瑞士輪次並標示目前輪次，不含淘汰賽入口。輪次內容直接顯示戰績分組，移除重複的「第 N 輪對戰」可見副標題。

## 淘汰名次與待定階段（2026-11-16）

公開賽程只列雙方選手確定的淘汰對戰；沒有已定組合的階段整區省略，不顯示等待佔位列。排名頁於淘汰開始後先顯示冠亞季殿名次，依已完成的決賽／季軍戰更新；未決名次顯示待定，其後才是瑞士制排名。名次列維持方正細分隔、暖白姓名、灰藍名次標籤。

## 減少分隔線（2026-11-16）

公開對戰列、淘汰階段／戰績組標題與單場排名列以留白區分，不再逐項加底線；輪次選單只留選取短線。淘汰賽與瑞士輪之間保留一條柔和細分隔。搜尋／操作框與固定底部導覽的邊界保留，確保互動可辨識。系列積分表格的欄列結構維持。

分隔線以標題層級為主：h2 副標題、戰績組／淘汰階段 h3 小標題與輪次選單下方保留細線；瑞士輪標題上方不畫分隔，只保留留白。逐場對戰及排名列維持無底線。此規範取代前次移除標題底線的修訂。
