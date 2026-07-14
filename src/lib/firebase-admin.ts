import * as admin from 'firebase-admin';

function getApp(): admin.app.App {
  if (admin.apps.length) {
    return admin.apps[0]!;
  }
  const projectId = process.env.MHD_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.MHD_FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.MHD_FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.initializeApp();
}

export function getAdminAuth(): admin.auth.Auth {
  return getApp().auth();
}

export function getAdminDb(): FirebaseFirestore.Firestore {
  return getApp().firestore();
}
