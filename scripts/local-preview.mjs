import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (host !== '127.0.0.1:8080' && host !== 'localhost:8080') {
  throw new Error('請用 npm run dev:test 啟動本機 Firebase 模擬器。');
}

const token = 'swiss-test';
const tokenHash = createHash('sha256').update(token).digest('hex');
const endpoint = 'http://' + host + '/v1/projects/demo-swiss-local/databases/(default)/documents/settings/admin';
const result = await fetch(endpoint, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { tokenHash: { stringValue: tokenHash } } })
});
if (!result.ok) throw new Error('無法初始化測試管理員：' + await result.text());

const server = await createServer({
  mode: 'emulator',
  server: { host: '127.0.0.1', port: 5173, strictPort: true }
});
await server.listen();
console.log('測試後台 http://127.0.0.1:5173/black_horse/?admin=1');
console.log('本機測試 token：' + token);
