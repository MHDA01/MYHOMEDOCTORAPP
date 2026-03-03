/**
 * User Setup Module
 * Crea automáticamente el documento del usuario en Firestore con su rol
 * Nueva estructura: Cuentas_Tutor/{userId}/Integrantes/{integranteId}
 */

import { db, firebase } from './firebase-config.js';

// Constantes de colecciones
const COLECCION_TUTOR = 'Cuentas_Tutor';
const SUBCOLECCION_INTEGRANTES = 'Integrantes';

/**
 * Genera un ID único para el integrante
 */
function generateId() {
    return 'int_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function setupUserDocument(user, userRole = 'patient') {
    try {
        // Usar la nueva colección Cuentas_Tutor
        const tutorRef = db.collection(COLECCION_TUTOR).doc(user.uid);
        
        // Verificar si ya existe
        const tutorDoc = await tutorRef.get();
        
        if (!tutorDoc.exists) {
            const timestamp = firebase.firestore.FieldValue.serverTimestamp();
            
            // 1. Crear documento de cuenta tutor
            await tutorRef.set({
                email: user.email || '',
                displayName: user.displayName || 'Usuario',
                role: userRole, // 'patient' o 'doctor'
                estado_cuenta: 'activa',
                fecha_creacion: timestamp,
                updatedAt: timestamp
            });
            
            console.log('✅ Cuenta Tutor creada con rol:', userRole);
            
            // 2. Crear el primer integrante como "Titular"
            const integranteId = generateId();
            const integranteRef = tutorRef.collection(SUBCOLECCION_INTEGRANTES).doc(integranteId);
            
            await integranteRef.set({
                // Datos básicos del titular
                fullName: user.displayName || 'Usuario',
                nombres: user.displayName?.split(' ')[0] || 'Usuario',
                apellidos: user.displayName?.split(' ').slice(1).join(' ') || '',
                parentesco: 'Titular',
                relationship: 'Titular',
                
                // Campos demográficos (vacíos para completar después)
                dateOfBirth: null,
                age: null,
                sexo: '',
                sex: '',
                weight: null,
                pais: '',
                country: '',
                eps: '',
                insuranceProvider: '',
                
                // Campos de salud (vacíos para completar después)
                antecedents: {
                    pathological: '',
                    surgical: '',
                    allergic: '',
                    medications: ''
                },
                alergias: [],
                antecedentes_patologicos: '',
                antecedentes_quirurgicos: '',
                medicamentos: [],
                
                // Metadatos
                userId: user.uid,
                es_usuario_original: true,
                createdAt: timestamp,
                updatedAt: timestamp
            });
            
            console.log('✅ Integrante Titular creado:', integranteId);
            
        } else {
            console.log('ℹ️ Cuenta Tutor ya existe en Firestore');
            
            // Verificar si tiene al menos un integrante
            const integrantesSnapshot = await tutorRef.collection(SUBCOLECCION_INTEGRANTES).limit(1).get();
            
            if (integrantesSnapshot.empty) {
                // Crear integrante titular si no existe
                const timestamp = firebase.firestore.FieldValue.serverTimestamp();
                const integranteId = generateId();
                const integranteRef = tutorRef.collection(SUBCOLECCION_INTEGRANTES).doc(integranteId);
                
                await integranteRef.set({
                    fullName: user.displayName || 'Usuario',
                    nombres: user.displayName?.split(' ')[0] || 'Usuario',
                    apellidos: user.displayName?.split(' ').slice(1).join(' ') || '',
                    parentesco: 'Titular',
                    relationship: 'Titular',
                    dateOfBirth: null,
                    age: null,
                    sexo: '',
                    sex: '',
                    weight: null,
                    antecedents: {
                        pathological: '',
                        surgical: '',
                        allergic: '',
                        medications: ''
                    },
                    userId: user.uid,
                    es_usuario_original: true,
                    createdAt: timestamp,
                    updatedAt: timestamp
                });
                
                console.log('✅ Integrante Titular creado (cuenta existente):', integranteId);
            }
        }
    } catch (error) {
        console.error('❌ Error en setupUserDocument:', error);
        throw error; // Re-lanzar para que el llamador sepa que falló
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
