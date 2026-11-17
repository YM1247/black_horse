# 公開頁面捲動邊界

2026-11-17：使用者在手機將頁面拉過頂端／底部時看見背景邊界。公開頁面的 html 與 body 設定 `overscroll-behavior-y: none`，禁止垂直邊界回彈及相關瀏覽器邊界手勢，保留文件本身的正常捲動。

只在存在 `.public-ink` 時生效，後台不變。未改用固定高度內層捲動容器，避免破壞搜尋 Enter 跳轉、輪次錨點、切頁回頂端、鍵盤與瀏覽器工具列；也不封鎖水平表格捲動或觸控縮放。

依據：[CSS Overscroll Behavior 規範](https://drafts.csswg.org/css-overscroll/#valdef-overscroll-behavior-none)。WebKit 曾有短頁仍可回彈的問題，[已於 2023 年修正](https://bugs.webkit.org/show_bug.cgi?id=244232)。較舊的 Safari 可能不支援或不完整支援；仍需實體 iPhone 檢查，不能以桌面模擬宣稱驗證了 iOS 原生回彈。

驗證包含正式建置、本機瀏覽器根捲動元素計算樣式、正常長頁捲動及搜尋 Enter 定位。品牌與水墨圖片不變。
