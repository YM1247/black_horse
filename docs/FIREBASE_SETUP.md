# Firebase 設定與部署

## 使用的服務

- Firebase Authentication：Email/Password 單一管理員帳號。
- Cloud Firestore：賽事、公開狀態與稽核紀錄。
- GitHub Pages：繼續託管 React 靜態網站，不改用 Firebase Hosting。

此組合不依賴 Cloud Functions，可在 Spark 方案免費額度內運作。

## 1. 建立 Firebase 專案

1. 在 Firebase Console 建立專案。
2. 建立 Web App，取得公開 Firebase config。
3. 建立 Cloud Firestore，正式環境請勿使用永久測試模式。
4. Authentication 啟用 Email/Password provider。
5. 建立一個管理員使用者；Email 可固定，密碼即後台共用 token。

## 2. 設定管理員授權

從 Authentication 複製管理員 UID，在 Firestore Console 建立：

```text
admins/{管理員 UID}
```

文件內容可使用：

```json
{
  "label": "Tournament admin"
}
```

前端無權建立或修改 `admins`，可避免知道一般 Firebase 帳密的使用者自行提權。

## 3. 本機環境變數

複製 `.env.example` 為 `.env.local`，填入 Firebase Web App config 與管理員 Email：

```bash
cp .env.example .env.local
```

`.env.local` 已由 Git 忽略。Firebase Web config 不是秘密，但管理 token 不可放在任何 `REACT_APP_*` 變數或提交至 Git。

## 4. 發布 Security Rules

登入 Firebase CLI 後執行：

```bash
npx firebase-tools use <project-id>
npx firebase-tools deploy --only firestore:rules
```

規則位於 `firestore.rules`：

- 公開訪客只能取得 `isPublic` 的指定賽事。
- `admins/{uid}` 存在的登入者才可管理賽事。
- audit log 只能新增，不能更新或刪除。

## 5. GitHub Pages production 設定

在執行 `npm run deploy` 的電腦建立 `.env.production.local`，填入與 `.env.local` 相同的公開 Firebase config 與管理員 Email，再執行：

```bash
npm run deploy
```

Create React App 會把 `REACT_APP_*` 公開設定編入靜態 bundle。管理 token 不會被編入，管理員每次在後台登入時輸入。

## 離線與同步

Firestore 在支援的 Chrome、Safari、Firefox 啟用多分頁 IndexedDB 持久快取。離線時的寫入會先顯示在本機並排入佇列，恢復連線後同步；同一文件發生衝突時採 Firestore 的 last-write-wins 行為，因此稽核紀錄會另外保存每次操作。

