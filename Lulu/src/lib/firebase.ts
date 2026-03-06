import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const getEnv = (key: string, fallback: string) => {
  const val = import.meta.env[key];
  return (val && val.trim()) ? val.trim() : fallback;
};

const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY", "AIzaSyAms8lX39b3yP9zIOX17ttAsD-mTATvvxc"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN", "galaxy-6ebc7.firebaseapp.com"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID", "galaxy-6ebc7"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET", "galaxy-6ebc7.firebasestorage.app"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "495055727416"),
  appId: getEnv("VITE_FIREBASE_APP_ID", "1:495055727416:web:559d7e01955345be77afcd")
};

// Check if API Key is missing to prevent Firebase error
if (!firebaseConfig.apiKey) {
  console.error("❌ Firebase API Key is missing. Please set VITE_FIREBASE_API_KEY in your environment variables.");
}

// Only initialize if we have an API key to avoid "auth/invalid-api-key" crash
export const isFirebaseConfigured = !!firebaseConfig.apiKey;
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : ({} as any);
export const db = app ? getFirestore(app) : ({} as any);
