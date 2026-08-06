import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

export const firebaseAdminEmail = process.env.REACT_APP_FIREBASE_ADMIN_EMAIL || '';
export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean) && Boolean(firebaseAdminEmail);

let services = null;

export const getFirebaseServices = () => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase 尚未設定，請先建立 .env.local。');
  }
  if (services) return services;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch {
    // 開發環境 hot reload 可能已初始化同一個 Firestore instance。
    db = getFirestore(app);
  }
  const auth = getAuth(app);
  services = { app, auth, db };
  return services;
};
