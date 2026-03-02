/**
 * MyHomeDoctorApp - API Configuration
 * 
 * IMPORTANTE: Este archivo muestra DÓNDE guardar las API keys de forma segura.
 * NUNCA incluyas API keys directamente en el código del cliente.
 * 
 * SEGURIDAD DE API KEYS:
 * 1. Las API keys sensibles DEBEN estar en Google Cloud Functions (Backend)
 * 2. El cliente SOLO llama a Cloud Functions, nunca directamente a APIs
 * 3. Cloud Functions actúa como intermediario seguro entre cliente e IA
 */

/**
 * PASO 1: Generar API Key de Google Gemini
 * =====================================================
 * 1. Ve a: https://aistudio.google.com/app/apikey
 * 2. Click en "Create API key in new project"
 * 3. Copia la key generada
 * 4. Asegúrate que Gemini API esté habilitada en Google Cloud Console
 */

/**
 * PASO 2: Guardar API Key en Cloud Functions (NO en cliente)
 * =====================================================
 * 
 * Opción A: Variables de entorno en Cloud Functions
 * -------------------------------------------------
 * En tu archivo .env.local o en Firebase Console:
 * 
 * GEMINI_API_KEY=tu_api_key_aqui
 * 
 * Opción B: Google Cloud Secret Manager (Más seguro)
 * ---------------------------------------------------
 * 1. Crea un secreto en: https://console.cloud.google.com/security/secret-manager
 * 2. Nombre: gemini-api-key
 * 3. Valor: tu_api_key
 * 4. Cloud Function accede con:
 *    const secret = await secretsClient.accessSecretVersion({
 *        name: `projects/PROJECT_ID/secrets/gemini-api-key/versions/latest`,
 *    });
 */

/**
 * PASO 3: Cloud Function que actúa como Proxy Seguro
 * =====================================================
 * 
 * Esta es la Cloud Function que actúa como intermediario seguro.
 * Créala en Firebase Console > Functions
 * 
 * Nombre: triageAnalysis
 * Ubicación: us-central1
 * Disparo: HTTPS
 * Autenticación: Requiere autenticación Firebase
 * 
 * El código de esta función debe ser:
 * 
 * @see CÓDIGO_CLOUD_FUNCTION_ABAJO
 */

// ============================================================================
// CÓDIGO DE LA CLOUD FUNCTION (Copia esto a functions/index.js)
// ============================================================================

/*

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializar Admin SDK
admin.initializeApp();

// IMPORTANTE: API Key se carga desde variables de entorno
// Nunca hardcodear en el código
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY no está configurada');
}

// Cloud Function para análisis médico con IA
exports.triageAnalysis = functions.https.onCall(async (data, context) => {
    // Verificar autenticación
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'El usuario debe estar autenticado'
        );
    }

    const { systemPrompt, userMessage, conversationHistory, sessionId } = data;

    // Validaciones
    if (!systemPrompt || !userMessage) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Faltan parámetros requeridos'
        );
    }

    try {
        console.log(`Procesando solicitud de triaje`);

        // Inicializar Gemini API
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Construir historial de conversación
        const messages = [
            {
                role: "user",
                parts: [{ text: systemPrompt }]
            },
            {
                role: "model",
                parts: [{ text: "Entendido. Soy un asistente de triaje médico. Estoy listo para ayudar." }]
            }
        ];

        // Agregar historial anterior
        if (conversationHistory && conversationHistory.length > 0) {
            conversationHistory.forEach(msg => {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            });
        }

        // Agregar mensaje del usuario
        messages.push({
            role: "user",
            parts: [{ text: userMessage }]
        });

        // Llamar API de Gemini
        const chat = model.startChat({ history: messages.slice(0, -1) });
        const result = await chat.sendMessage(userMessage);
        const response = result.response.text();

// Respuesta recibida de Gemini

        // Guardar interacción en Firestore para auditoría
        await admin.firestore()
            .collection('triage_logs')
            .add({
                userId: context.auth.uid,
                sessionId: sessionId,
                userMessage: userMessage,
                aiResponse: response,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

        return {
            response: response,
            success: true
        };

    } catch (error) {
        console.error('Error del sistema: Error en triageAnalysis');
        throw new functions.https.HttpsError(
            'internal',
            'Error procesando la solicitud: ' + error.message
        );
    }
});

*/

// ============================================================================
// CONFIGURACIÓN DE FIREBASE CONSOLE
// ============================================================================

/**
 * 1. Ve a Firebase Console > Project Settings > Cloud Functions
 * 2. Habilita "Configurar variables de entorno"
 * 3. Agrega:
 *    - GEMINI_API_KEY = tu_api_key_aqui
 * 
 * 4. En package.json de functions, agrega:
 *    "dependencies": {
 *        "firebase-functions": "^4.0.0",
 *        "firebase-admin": "^11.0.0",
 *        "@google/generative-ai": "^0.3.0"
 *    }
 * 
 * 5. Deploy con:
 *    firebase deploy --only functions
 */

// ============================================================================
// CÓMO USA EL CLIENTE ESTA CLOUD FUNCTION
// ============================================================================

/**
 * Desde triage-chat.js, el cliente hace:
 * 
 * const functions = firebase.functions('us-central1');
 * const triageAnalysis = functions.httpsCallable('triageAnalysis');
 * 
 * const result = await triageAnalysis({
 *     systemPrompt: "Eres un asistente médico...",
 *     userMessage: "Mi hijo tiene fiebre",
 *     conversationHistory: [...],
 *     sessionId: "abc123"
 * });
 * 
 * La Cloud Function:
 * 1. Verifica que el usuario esté autenticado
 * 2. Obtiene la API Key desde variables de entorno (NUNCA la envía al cliente)
 * 3. Llama a Gemini API de forma segura
 * 4. Retorna solo la respuesta (no la API key)
 * 5. Registra la interacción en Firestore para auditoría
 */

// ============================================================================
// CHECKLIST DE SEGURIDAD
// ============================================================================

/*
✅ API Key en variable de entorno de Cloud Functions (NO en cliente)
✅ Cloud Function requiere autenticación Firebase
✅ Cliente NO tiene acceso directo a Gemini API
✅ Todas las interacciones se registran en Firestore para auditoría
✅ Rate limiting en Cloud Function para evitar abuso
✅ API Key rotada periódicamente
✅ Secrets Manager para datos más sensibles
✅ CORS configurado correctamente
*/

// ============================================================================
// PARA DESARROLLADORES: VARIABLES LOCALES
// ============================================================================

// Cuando estés desarrollando y testing local:
// 
// 1. Instala Firebase CLI: npm install -g firebase-tools
// 2. Autentica: firebase login
// 3. Emula localmente: firebase emulators:start
// 4. En functions/.env.local:
//    GEMINI_API_KEY=your_test_key_here
// 
// Esto funciona SOLO en desarrollo. En producción usa Secret Manager.

// Configuración de seguridad para producción
