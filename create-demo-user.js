require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const projectId = process.env.MHD_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.MHD_FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyRaw = process.env.MHD_FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, '\n') : undefined;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase admin credentials.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const auth = admin.auth();
const db = admin.firestore();

const email = 'demo@myhomedoctorapp.local';
const password = 'Demo1234!';
const displayName = 'Demo Usuario';

(async () => {
  try {
    let user;
    try {
      user = await auth.getUserByEmail(email);
      console.log('Usuario ya existe:', user.uid);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/user-not-found') {
        user = await auth.createUser({ email, password, displayName });
        console.log('Usuario creado:', user.uid);
      } else {
        throw err;
      }
    }

    const uid = user.uid;
    const tutorRef = db.collection('Cuentas_Tutor').doc(uid);
    const titularRef = tutorRef.collection('integrantes').doc('titular');
    const tokenRef = tutorRef.collection('tokens').doc('config');
    const now = admin.firestore.Timestamp.now();
    const freePeriodEnds = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

    await tutorRef.set({
      personalInfo: {
        firstName: 'Demo',
        lastName: 'Usuario',
        sex: 'other',
        dateOfBirth: new Date().toISOString(),
        country: 'colombia',
        insuranceProvider: '',
        insuranceProviderName: '',
      },
      healthInfo: {
        allergies: [],
        medications: [],
        pathologicalHistory: '',
        surgicalHistory: '',
        gynecologicalHistory: '',
        emergencyContacts: [],
      },
      legalConsent: {
        dataProtection: true,
        teleorientationDisclaimer: true,
        termsAndConditions: true,
        consentVersion: '1.0',
        acceptedAt: now,
      },
    }, { merge: true });

    await titularRef.set({
      userId: uid,
      firstName: 'Demo',
      lastName: 'Usuario',
      sex: 'other',
      dateOfBirth: new Date().toISOString().split('T')[0],
      relationship: 'Titular',
      esTitular: true,
      allergies: [],
      medications: [],
      hasHistory: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await tokenRef.set({
      free: 6,
      paid: 0,
      dailyReset: now,
      freePeriodEnds,
    }, { merge: true });

    console.log('Firestore inicializado para el usuario de prueba.');
    console.log('Email: demo@myhomedoctorapp.local');
    console.log('Password: Demo1234!');
    process.exit(0);
  } catch (error) {
    console.error('Error creando la cuenta de prueba:', error);
    process.exit(1);
  }
})();
