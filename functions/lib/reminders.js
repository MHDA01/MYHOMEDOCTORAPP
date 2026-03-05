"use strict";
/**
 * @fileoverview LÃ³gica para los recordatorios de citas y medicamentos.
 * Contiene las Cloud Functions programadas que se encargan de enviar
 * notificaciones push a los usuarios.
 *
 * Estructura Firestore canÃ³nica:
 *   Cuentas_Tutor/{uid}/appointments/{id}   â† citas del Titular
 *   Cuentas_Tutor/{uid}/medications/{id}    â† medicamentos del Titular
 *   Cuentas_Tutor/{uid}.notificationToken   â† FCM token del dispositivo
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMedicationReminders = exports.checkAppointmentReminders = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
try {
    admin.initializeApp();
}
catch (e) {
    // Ya inicializado en otro mÃ³dulo
}
const db = admin.firestore();
const messaging = admin.messaging();
/**
 * FunciÃ³n programada para verificar y enviar recordatorios de citas.
 * Se ejecuta cada 5 minutos.
 *
 * Lee appointments de todas las cuentas usando collectionGroup para
 * evitar N+1 consultas de usuarios.
 */
exports.checkAppointmentReminders = functions
    .region("us-central1")
    .pubsub.schedule("every 5 minutes")
    .onRun(async (_context) => {
    var _a, _b, _c;
    console.log("Iniciando verificaciÃ³n de recordatorios de citas.");
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    try {
        // Consulta todas las citas pendientes con recordatorio no enviado
        // collectionGroup abarca Cuentas_Tutor/{uid}/appointments sin iterar usuarios
        const snapshot = await db
            .collectionGroup("appointments")
            .where("notified", "==", false)
            .where("status", "==", "Upcoming")
            .get();
        const notificationPromises = [];
        for (const docSnap of snapshot.docs) {
            const cita = docSnap.data();
            if (!cita.date || !cita.reminder)
                continue;
            const fechaCita = cita.date.toDate();
            // Mapear clave de reminder a horas (ej: '1h' â†’ 1, '2d' â†’ 48)
            const reminderMap = { '1h': 1, '2h': 2, '24h': 24, '2d': 48 };
            const reminderHours = (_a = reminderMap[cita.reminder]) !== null && _a !== void 0 ? _a : 24;
            const reminderTime = new Date(fechaCita.getTime() - reminderHours * 60 * 60 * 1000);
            if (reminderTime < now || reminderTime >= oneHourFromNow)
                continue;
            // El uid es el ancestro en el path: Cuentas_Tutor/{uid}/appointments/{id}
            const uid = (_b = docSnap.ref.parent.parent) === null || _b === void 0 ? void 0 : _b.id;
            if (!uid)
                continue;
            const userSnap = await db.collection("Cuentas_Tutor").doc(uid).get();
            const token = (_c = userSnap.data()) === null || _c === void 0 ? void 0 : _c.notificationToken;
            if (!token)
                continue;
            const promise = messaging.send({
                notification: {
                    title: "Recordatorio de Cita MÃ©dica",
                    body: `No olvides tu cita con ${cita.doctor || 'el mÃ©dico'} (${cita.specialty || ''}) a las ${fechaCita.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}.`,
                },
                token,
            })
                .then(() => docSnap.ref.update({ notified: true }))
                .catch(err => console.error(`Error al enviar recordatorio de cita ${docSnap.id}:`, err));
            notificationPromises.push(promise);
        }
        await Promise.all(notificationPromises);
        console.log("VerificaciÃ³n de recordatorios de citas completada.");
    }
    catch (error) {
        console.error("Error general en checkAppointmentReminders:", error);
    }
    return null;
});
/**
 * FunciÃ³n programada para verificar y enviar recordatorios de medicamentos.
 * Se ejecuta cada 5 minutos.
 */
exports.checkMedicationReminders = functions
    .region("us-central1")
    .pubsub.schedule("every 5 minutes")
    .onRun(async (_context) => {
    console.log("Iniciando verificaciÃ³n de recordatorios de medicamentos.");
    const nowTime = new Date();
    try {
        const usersSnapshot = await db.collection("Cuentas_Tutor").get();
        const notificationPromises = [];
        for (const userDoc of usersSnapshot.docs) {
            const token = userDoc.data().notificationToken;
            if (!token)
                continue;
            const medicationsSnapshot = await db
                .collection("Cuentas_Tutor")
                .doc(userDoc.id)
                .collection("medications")
                .where("active", "==", true)
                .get();
            for (const medDoc of medicationsSnapshot.docs) {
                const med = medDoc.data();
                if (!med.time || !med.frequency)
                    continue;
                for (const timeStr of med.time) {
                    const [hour, minute] = timeStr.split(":").map(Number);
                    // Enviar si los HH:mm del momento actual coinciden con el slot (ventana de 5 min)
                    if (nowTime.getHours() === hour &&
                        nowTime.getMinutes() >= minute &&
                        nowTime.getMinutes() < minute + 5) {
                        const promise = messaging.send({
                            notification: {
                                title: "Recordatorio de Medicamento",
                                body: `Es hora de tomar tu dosis de ${med.name} (${med.dosage}).`,
                            },
                            token,
                        })
                            .then(() => console.log(`Recordatorio de ${med.name} enviado a ${userDoc.id}`))
                            .catch(err => console.error(`Error al enviar recordatorio de medicamento ${medDoc.id}:`, err));
                        notificationPromises.push(promise);
                        break; // una notificaciÃ³n por medicamento por ejecuciÃ³n
                    }
                }
            }
        }
        await Promise.all(notificationPromises);
        console.log("VerificaciÃ³n de recordatorios de medicamentos completada.");
    }
    catch (error) {
        console.error("Error general en checkMedicationReminders:", error);
    }
    return null;
});
//# sourceMappingURL=reminders.js.map