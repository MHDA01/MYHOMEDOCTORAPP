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

/**
 * Mapeo de tipos de cuenta a etiquetas legibles
 */
const ACCOUNT_TYPE_LABELS = {
    'tutor': 'Responsable Familiar',
    'individual': 'Usuario Individual'
};

/**
 * Crea el documento del usuario en Firestore
 * @param {object} user - Usuario de Firebase Auth
 * @param {string} userRole - Rol del usuario ('patient' o 'doctor')
 * @param {string} accountType - Tipo de cuenta ('tutor' o 'individual')
 */
async function setupUserDocument(user, userRole = 'patient', accountType = 'tutor') {
    try {
        console.log('🔧 Configurando documento de usuario:', user.uid);
        console.log('📋 Tipo de cuenta:', accountType);
        
        // Usar la nueva colección Cuentas_Tutor
        const tutorRef = db.collection(COLECCION_TUTOR).doc(user.uid);
        
        // Verificar si ya existe
        const tutorDoc = await tutorRef.get();
        
        if (!tutorDoc.exists) {
            const timestamp = firebase.firestore.FieldValue.serverTimestamp();
            
            // 1. Crear documento de cuenta tutor
            const cuentaData = {
                email: user.email || '',
                displayName: user.displayName || 'Usuario',
                role: userRole,
                accountType: accountType,
                accountTypeLabel: ACCOUNT_TYPE_LABELS[accountType] || accountType,
                estado_cuenta: 'activa',
                fecha_creacion: timestamp,
                updatedAt: timestamp,
                // Campos adicionales para organización
                totalIntegrantes: 1,
                planActivo: 'free'
            };
            
            await tutorRef.set(cuentaData);
            console.log('✅ Cuenta Tutor creada:', cuentaData);
            
            // 2. Crear el primer integrante como "Titular" o "Usuario" según tipo
            const integranteId = generateId();
            const integranteRef = tutorRef.collection(SUBCOLECCION_INTEGRANTES).doc(integranteId);
            
            const parentesco = accountType === 'tutor' ? 'Titular' : 'Usuario';
            const nombres = user.displayName?.split(' ')[0] || 'Usuario';
            const apellidos = user.displayName?.split(' ').slice(1).join(' ') || '';
            
            const integranteData = {
                // Identificación
                id: integranteId,
                
                // Datos personales
                fullName: user.displayName || 'Usuario',
                nombres: nombres,
                apellidos: apellidos,
                parentesco: parentesco,
                relationship: parentesco,
                
                // Campos demográficos (para completar)
                dateOfBirth: null,
                age: null,
                sexo: '',
                sex: '',
                weight: null,
                pais: '',
                country: '',
                eps: '',
                insuranceProvider: '',
                
                // Historia clínica (vacía para completar)
                antecedents: {
                    pathological: '',
                    surgical: '',
                    allergic: '',
                    medications: '',
                    gynecological: '',
                    familyHistory: ''
                },
                alergias: [],
                antecedentes_patologicos: '',
                antecedentes_quirurgicos: '',
                medicamentos: [],
                contactos_emergencia: [],
                
                // Documentos y citas
                citas: [],
                documentos: [],
                
                // Metadatos
                userId: user.uid,
                es_usuario_original: true,
                esTitular: accountType === 'tutor',
                createdAt: timestamp,
                updatedAt: timestamp
            };
            
            await integranteRef.set(integranteData);
            console.log('✅ Integrante creado:', integranteData);
            
        } else {
            console.log('ℹ️ Cuenta Tutor ya existe en Firestore');
            
            // Verificar si tiene al menos un integrante
            const integrantesSnapshot = await tutorRef.collection(SUBCOLECCION_INTEGRANTES).limit(1).get();
            
            if (integrantesSnapshot.empty) {
                console.log('⚠️ Cuenta sin integrantes, creando titular...');
                await crearIntegranteTitular(tutorRef, user, accountType);
            }
        }
        
        console.log('🎉 Configuración de usuario completada');
        return true;
        
    } catch (error) {
        console.error('❌ Error en setupUserDocument:', error);
        throw error;
    }
}

/**
 * Crea un integrante titular para una cuenta existente
 */
async function crearIntegranteTitular(tutorRef, user, accountType = 'tutor') {
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    const integranteId = generateId();
    const integranteRef = tutorRef.collection(SUBCOLECCION_INTEGRANTES).doc(integranteId);
    
    const parentesco = accountType === 'tutor' ? 'Titular' : 'Usuario';
    
    await integranteRef.set({
        id: integranteId,
        fullName: user.displayName || 'Usuario',
        nombres: user.displayName?.split(' ')[0] || 'Usuario',
        apellidos: user.displayName?.split(' ').slice(1).join(' ') || '',
        parentesco: parentesco,
        relationship: parentesco,
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
        esTitular: true,
        createdAt: timestamp,
        updatedAt: timestamp
    });
    
    console.log('✅ Integrante Titular creado (cuenta existente):', integranteId);
}

/**
 * Redirigir a dashboard de paciente (family-health.html)
 */
async function redirectByRole(user) {
    try {
        await setupUserDocument(user, 'patient', 'tutor');
        window.location.href = 'family-health.html';
    } catch (error) {
        console.error('Error en redirectByRole:', error);
        window.location.href = 'family-health.html';
    }
}

// Exportar funciones para módulos
export { setupUserDocument, redirectByRole };
