/**
 * User Setup Module
 * Crea automáticamente el documento del usuario en Firestore con su rol
 * Nueva estructura: Cuentas_Tutor/{userId}
 */

import { db } from './firebase-config.js';

async function setupUserDocument(user, userRole = 'patient') {
    try {
        // Usar la nueva colección Cuentas_Tutor
        const tutorRef = db.collection('Cuentas_Tutor').doc(user.uid);
        
        // Verificar si ya existe
        const tutorDoc = await tutorRef.get();
        
        if (!tutorDoc.exists) {
            // Crear documento de cuenta tutor
            await tutorRef.set({
                email: user.email || '',
                displayName: user.displayName || 'Usuario',
                role: userRole, // 'patient' o 'doctor'
                estado_cuenta: 'activa',
                fecha_creacion: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ Cuenta Tutor creada con rol:', userRole);
        } else {
            console.log('ℹ️ Cuenta Tutor ya existe en Firestore');
        }
    } catch (error) {
        console.error('❌ Error en setupUserDocument:', error);
    }
}

/**
 * Redirigir a dashboard de paciente (family-health.html)
 */
async function redirectByRole(user) {
    try {
        // Asegurar que el documento existe
        await setupUserDocument(user, 'patient');
        // Todos los usuarios van a family-health.html
        window.location.href = 'family-health.html';
    } catch (error) {
        console.error('Error en redirectByRole:', error);
        window.location.href = 'family-health.html';
    }
}

// Exportar funciones para módulos
export { setupUserDocument, redirectByRole };
