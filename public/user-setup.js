/**
 * User Setup Module
 * Crea automáticamente el documento del usuario en Firestore con su rol
 */

import { db } from './firebase-config.js';

async function setupUserDocument(user, userRole = 'patient') {
    try {
        // Usar la instancia importada de Firestore desde firebase-config.js
        const userRef = db.collection('users').doc(user.uid);
        
        // Verificar si ya existe
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            // Crear documento con el rol
            await userRef.set({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || 'Usuario',
                role: userRole, // 'patient' o 'doctor'
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ Usuario creado con rol:', userRole);
        } else {
            console.log('ℹ️ Usuario ya existe en Firestore');
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
