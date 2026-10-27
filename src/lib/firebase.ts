import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

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
// Por defecto el SDK reintenta una subida fallida hasta 10 minutos sin avisar:
// el paciente veía el chat "pensando" y nada salía. Con 2 minutos el error llega
// al chat ("No pude subir la imagen...") y el borrador vuelve al cuadro de texto.
storage.maxUploadRetryTime = 2 * 60 * 1000;

/**
 * Modo emuladores: solo para probar en la máquina de un desarrollador.
 *
 * Sin esto, `npm run dev` habla con el Firebase de PRODUCCIÓN, así que abrir la
 * app con sesión significaba crear una cuenta real entre las de los pacientes.
 * Con `NEXT_PUBLIC_USAR_EMULADORES=1` el cliente apunta a los emuladores del
 * proyecto de mentira `demo-mhda`, los mismos que usa `npm test`.
 *
 * Se conectan los cuatro servicios, incluido Functions aunque su emulador no
 * siempre esté levantado: así una llamada por descuido falla en la máquina en
 * vez de llegar a producción. En producción la variable no existe y este bloque
 * no se ejecuta.
 */
if (process.env.NEXT_PUBLIC_USAR_EMULADORES === "1" && typeof window !== "undefined") {
  const maquina = "127.0.0.1";
  connectAuthEmulator(auth, `http://${maquina}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, maquina, 8080);
  connectStorageEmulator(storage, maquina, 9199);
  connectFunctionsEmulator(functions, maquina, 5001);
  console.info(`[Firebase] Emuladores en ${maquina}: proyecto ${firebaseConfig.projectId}. Ningún dato sale de esta máquina.`);
}

export { app, auth, db, functions, storage };
