// firebase-config.js - SOLUCIÓN ROBUSTA DE COMPATIBILIDAD
// 1. Importamos los scripts solo para que se ejecuten y creen 'window.firebase'
import "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js";
import "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js";
import "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js";

// --- CREDENCIALES DE FIREBASE (MyHomeDoctor) ---
const firebaseConfig = {
  apiKey: "AIzaSyDV2KnAQTBsr2PWZFTeAbZRJd2EfUu3RXM",
  authDomain: "myhomedc-1c41e.firebaseapp.com",
  projectId: "myhomedc-1c41e",
  storageBucket: "myhomedc-1c41e.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// 2. EL TRUCO: Accedemos directamente al objeto global
const firebase = window.firebase;

// 3. Verificamos que cargó correctamente antes de usarlo
if (!firebase) {
    console.error("❌ Error crítico: Firebase no se cargó globalmente.");
} else {
    // Inicialización segura
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("✅ Firebase (Compat) inicializado correctamente");
    } else {
        console.log("✅ Firebase ya estaba inicializado");
    }
}

// 4. Extraemos las herramientas
const app = firebase.app();
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

console.log("✅ Firebase Auth initialized");
console.log("✅ Firebase Firestore initialized");

// 5. Configuración de persistencia (con manejo de errores mejorado)
// Deshabilitado: synchronizeTabs causa conflictos de permisos
// db.enablePersistence({ synchronizeTabs: true })
db.enablePersistence()
    .then(() => {
        console.log("✅ Persistencia de Firestore habilitada (modo single-tab)");
    })
    .catch(err => {
        // Estos errores son normales si:
        // - failed-precondition: Múltiples pestañas
        // - unimplemented: Navegador no soporta
        if (err.code === 'failed-precondition') {
            console.log("ℹ️ Persistencia: Múltiples pestañas del navegador detectadas");
        } else if (err.code === 'unimplemented') {
            console.log("ℹ️ Persistencia: No soportada en este navegador");
        } else {
            console.log("ℹ️ Persistencia: Info de error -", err.code, err.message);
        }
    });

// 6. Exportamos todo lo necesario
export { app, auth, db, googleProvider, firebase };
export default firebase;

