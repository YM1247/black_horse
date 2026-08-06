import { createHash } from 'node:crypto';

const token = process.env.ADMIN_TOKEN;

if (!token) {
  console.error('請先以隱藏輸入設定 ADMIN_TOKEN 環境變數。詳見 docs/FIREBASE_SETUP.md。');
  process.exitCode = 1;
} else {
  console.log(createHash('sha256').update(token.trim()).digest('hex'));
}
