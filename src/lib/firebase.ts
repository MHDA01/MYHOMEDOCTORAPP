import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

/**
 * Firebase Client Configuration
 * Uses NEXT_PUBLIC_* variables (safe to expose in browser)
 * Generated from .env.local
 */
const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "myhomedoctorapp",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:138646987953:web:f0f8ee1d83efc34e4dae90",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "myhomedoctorapp.appspot.com",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "myhomedoctorapp.firebaseapp.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "138646987953",
};

// Validate that API key is present
if (!firebaseConfig.apiKey) {
  console.error(
    "❌ NEXT_PUBLIC_FIREBASE_API_KEY is not configured. Set it in .env.local"
  );
}

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    return getFirestore(app);
  }
})();
const functions = getFunctions(app, "us-central1");
const storage = getStorage(app);

export { app, auth, db, functions, storage };
