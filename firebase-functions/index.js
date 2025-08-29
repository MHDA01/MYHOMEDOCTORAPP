// Cloud Function para crear recursos al registrar un usuario en Firebase Auth
// Guardar como functions/index.js en tu proyecto de Firebase Functions

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');

admin.initializeApp();
const db = admin.firestore();
const storage = new Storage();

const BUCKET_NAME = 'myhomedoctorapp-bucket-20250820';

exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  const userId = user.uid;
  const email = user.email || '';

  // 1. Inicializar estructura en Firestore
  await db.collection('users').doc(userId).set({
    email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    personalInfo: {},
    healthInfo: {
      Allergies: "", // O un valor inicial por defecto
    },
  }, { merge: true });

  // 2. Crear carpeta en Cloud Storage (opcional, GCS es flat, pero se puede crear un objeto vacío)
  const folderPath = `documentos medicos/${userId}/.init`;
  await storage.bucket(BUCKET_NAME).file(folderPath).save('');

  console.log(`Recursos creados para el usuario ${userId}`);
});
