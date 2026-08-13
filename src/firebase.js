import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBS1bTKlv56ld8Tf87gjVT9-ZWEUk1ny_I',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'black-horse-7b932.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'black-horse-7b932',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'black-horse-7b932.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '595413568597',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:595413568597:web:c1ecfaf6b8ba9c096a18dc'
};

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY || '';

export const isFirebaseConfigured = import.meta.env.MODE !== 'test' && Object.values(firebaseConfig).every(Boolean);
export const isAppCheckMonitoringEnabled = Boolean(appCheckSiteKey);

let services = null;

export const getFirebaseServices = () => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase 尚未設定，請先建立 .env.local。');
  }
  if (services) return services;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  let appCheck = null;
  if (appCheckSiteKey) {
    if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN) {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN;
    }
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true
      });
    } catch {
      // Vite hot reload 可能已為同一個 app 初始化 App Check。
    }
  }
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
  services = { app, appCheck, auth, db };
  return services;
};
