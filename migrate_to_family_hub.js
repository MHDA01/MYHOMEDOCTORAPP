/**
 * Script de Migración: Usuario Único -> Hub Familiar (Familiograma)
 * 
 * Este script migra la estructura plana de la colección "users" a una
 * estructura jerárquica con "Cuentas_Tutor" y subcolección "Integrantes".
 * 
 * Ejecución: node migrate_to_family_hub.js
 */

const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Inicializar Firebase Admin con las credenciales del proyecto
const serviceAccount = require('./serviceAcountkey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Colecciones
const COLECCION_ORIGEN = 'users';
const COLECCION_CITAS = 'appointments';
const COLECCION_DESTINO = 'Cuentas_Tutor';
const SUBCOLECCION_INTEGRANTES = 'Integrantes';

/**
 * Función principal de migración
 */
async function migrateToFamilyHub() {
  console.log('='.repeat(60));
  console.log('INICIANDO MIGRACIÓN: Usuario Único -> Hub Familiar');
  console.log('='.repeat(60));
  console.log(`Fecha de ejecución: ${new Date().toISOString()}`);
  console.log('');

  let totalUsuarios = 0;
  let exitosos = 0;
  let fallidos = 0;

  try {
    // Obtener todos los documentos de la colección users
    const usuariosSnapshot = await db.collection(COLECCION_ORIGEN).get();
    totalUsuarios = usuariosSnapshot.size;

    console.log(`📊 Total de usuarios a migrar: ${totalUsuarios}`);
    console.log('-'.repeat(60));

    if (totalUsuarios === 0) {
      console.log('⚠️  No se encontraron usuarios para migrar.');
      return;
    }

    // Obtener todas las citas para asociarlas luego
    const citasSnapshot = await db.collection(COLECCION_CITAS).get();
    console.log(`📅 Total de citas encontradas: ${citasSnapshot.size}`);

    // Iterar sobre cada usuario
    for (const usuarioDoc of usuariosSnapshot.docs) {
      const userId = usuarioDoc.id;
      const userData = usuarioDoc.data();

      try {
        // Buscar citas asociadas a este usuario
        const citasUsuario = citasSnapshot.docs
          .filter(citaDoc => citaDoc.data().userId === userId)
          .map(citaDoc => ({ id: citaDoc.id, ...citaDoc.data() }));

        await migrarUsuario(userId, userData, citasUsuario);
        exitosos++;
        console.log(`✅ [${exitosos}/${totalUsuarios}] Usuario ${userId} migrado exitosamente.`);
      } catch (error) {
        fallidos++;
        console.error(`❌ [ERROR] Usuario ${userId}: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Error crítico durante la migración:', error.message);
    throw error;
  }

  // Resumen final
  console.log('');
  console.log('='.repeat(60));
  console.log('RESUMEN DE MIGRACIÓN');
  console.log('='.repeat(60));
  console.log(`Total procesados: ${totalUsuarios}`);
  console.log(`✅ Exitosos: ${exitosos}`);
  console.log(`❌ Fallidos: ${fallidos}`);
  console.log('');
  console.log('⚠️  IMPORTANTE: La colección original "users" NO fue eliminada.');
  console.log('   Verifica los datos en "Cuentas_Tutor" antes de eliminarla manualmente.');
  console.log('='.repeat(60));
}

/**
 * Migra un usuario individual a la nueva estructura
 * @param {string} userId - ID del usuario original
 * @param {object} userData - Datos del usuario original
 * @param {array} citasUsuario - Citas asociadas al usuario
 */
async function migrarUsuario(userId, userData, citasUsuario) {
  // Generar un nuevo ID para el integrante
  const integranteId = uuidv4();
  const fechaActual = admin.firestore.FieldValue.serverTimestamp();

  // Extraer datos del usuario original
  const personalInfo = userData.personalInfo || {};
  const healthInfo = userData.healthInfo || {};

  // Extraer email del usuario (si existe) o usar un placeholder
  const email = userData.email || `usuario_${userId}@pendiente.com`;

  // ========================================
  // BLOQUE 1: Crear documento en Cuentas_Tutor
  // ========================================
  const cuentaTutorData = {
    email: email,
    fecha_creacion: userData.createdAt || fechaActual,
    estado_cuenta: 'activa',
    fcmTokens: userData.fcmTokens || [],
    migrado_desde: COLECCION_ORIGEN,
    fecha_migracion: fechaActual,
    id_usuario_original: userId
  };

  const cuentaTutorRef = db.collection(COLECCION_DESTINO).doc(userId);
  await cuentaTutorRef.set(cuentaTutorData);

  // ========================================
  // BLOQUE 2: Crear documento en Integrantes (subcolección)
  // ========================================
  
  // Bloque 1 - Demografía (mapeando desde personalInfo)
  const demografiaData = {
    nombres: personalInfo.firstName || '',
    apellidos: personalInfo.lastName || '',
    parentesco: 'Titular', // Por defecto para el usuario original
    sexo: mapearSexo(personalInfo.sex),
    fecha_nacimiento: personalInfo.dateOfBirth || null,
    pais: personalInfo.country || '',
    eps: personalInfo.insuranceProvider || ''
  };

  // Bloque 2 - Historial Médico (mapeando desde healthInfo)
  const historialData = {
    alergias: healthInfo.allergies || [],
    antecedentes_patologicos: healthInfo.pathologicalHistory || '',
    antecedentes_quirurgicos: healthInfo.surgicalHistory || '',
    antecedentes_ginecologicos: healthInfo.gynecologicalHistory || '',
    medicamentos: healthInfo.medications || [],
    contactos_emergencia: healthInfo.emergencyContacts || []
  };

  // Bloque 3 - Citas y Documentos
  const citasDocsData = {
    citas: citasUsuario,
    documentos: userData.documents || []
  };

  // Combinar todos los bloques para el integrante
  const integranteData = {
    ...demografiaData,
    ...historialData,
    ...citasDocsData,
    fecha_creacion: fechaActual,
    es_usuario_original: true,
    id_usuario_original: userId
  };

  // Guardar en la subcolección Integrantes
  const integranteRef = cuentaTutorRef.collection(SUBCOLECCION_INTEGRANTES).doc(integranteId);
  await integranteRef.set(integranteData);
}

/**
 * Mapea el valor de sexo al formato en español
 * @param {string} sex - Valor original (male, female, other)
 * @returns {string} - Valor mapeado
 */
function mapearSexo(sex) {
  const mapeo = {
    'male': 'Masculino',
    'female': 'Femenino',
    'other': 'Otro'
  };
  return mapeo[sex] || sex || '';
}

// Ejecutar la migración
migrateToFamilyHub()
  .then(() => {
    console.log('');
    console.log('🎉 Migración completada.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 La migración falló:', error);
    process.exit(1);
  });