import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyBS1bTKlv56ld8Tf87gjVT9-ZWEUk1ny_I',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'black-horse-7b932.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'black-horse-7b932',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'black-horse-7b932.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '595413568597',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:595413568597:web:c1ecfaf6b8ba9c096a18dc'
};

export const isFirebaseConfigured = process.env.NODE_ENV !== 'test' && Object.values(firebaseConfig).every(Boolean);

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
