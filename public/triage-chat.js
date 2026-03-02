/**
 * MyHomeDoctorApp - Triage Chat System
 * Sistema de triaje inteligente con IA médica
 */

import { auth, db } from './firebase-config.js';

// ============================================================================
// SYSTEM PROMPT DEL DR. GARCIA
// ============================================================================

const DR_GARCIA_SYSTEM_PROMPT = `
Eres el Dr. García, un médico general experimentado trabajando en MyHomeDoctorApp.
Tu rol es realizar un triaje inicial de síntomas para ayudar al paciente a entender
su situación de salud y determinar si necesita atención médica urgente.

DIRECTRICES:
1. Sé empático pero profesional
2. Recopila información sobre síntomas principales
3. Pregunta sobre duración, intensidad y síntomas asociados
4. NUNCA diagnostiques condiciones específicas
5. SIEMPRE recomienda consultar con un médico en persona
6. Si los síntomas son graves (fiebre >39°C, dificultad respiratoria, dolor severo), recomienda urgencia
7. Proporciona orientación general sobre primeros auxilios cuando sea apropiado

Mantén respuestas concisas y enfocadas en recopilar información relevante.
`;

// ============================================================================
// CLASE TRIAGE CHAT
// ============================================================================

class TriageChat {
    constructor() {
        // Usar las instancias importadas desde firebase-config.js
        this.db = db;
        this.auth = auth;
        this.currentUser = null;
        this.selectedProfile = null;
        this.profileSelect = null;
        this.triageMessages = null;
        this.triageForm = null;
        this.triageMessageInput = null;
        this.sendTriageBtn = null;
        this.triageProfileName = null;
        this.profilesLoadTimeoutId = null;

        this.initialize();
    }

    /**
     * Inicializar el chat de triaje
     */
    initialize() {
        this.auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.setupDOM();
                this.setupEventListeners();
                this.loadProfiles();
            }
        });
    }

    /**
     * Configurar referencias del DOM
     */
    setupDOM() {
        this.profileSelect = document.getElementById('profileSelect');
        this.triageMessages = document.getElementById('triageMessages');
        this.triageForm = document.getElementById('triageForm');
        this.triageMessageInput = document.getElementById('triageMessageInput');
        this.sendTriageBtn = document.getElementById('sendTriageBtn');
        this.triageProfileName = document.getElementById('triageProfileName');
    }

    /**
     * Configurar listeners
     */
    setupEventListeners() {
        if (this.profileSelect) {
            console.log('🔗 Agregando listener al profileSelect');
            this.profileSelect.addEventListener('change', (e) => {
                const profileId = e.target.value;
                console.log('👆 Cambio de perfil detectado:', profileId);
                if (profileId) {
                    this.selectProfile(profileId);
                } else {
                    console.warn('⚠️ Se seleccionó opción vacía');
                }
            });
        } else {
            console.warn('⚠️ profileSelect no encontrado en el DOM');
        }

        if (this.triageForm) {
            this.triageForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('📤 Enviando mensaje...');
                await this.sendMessage();
            });
        } else {
            console.warn('⚠️ triageForm no encontrado en el DOM');
        }

        // Escuchar evento de perfil seleccionado desde family-profiles
        window.addEventListener('profileSelected', (e) => {
            this.selectedProfile = e.detail;
            this.updateTriageUI();
        });

        // Escuchar cuando los perfiles están listos (una sola vez)
        const handleProfilesReadyOnce = (e) => {
            console.log('📢 Evento profilesReady recibido con', e.detail.profiles.length, 'perfiles');
            if (this.profilesLoadTimeoutId) {
                clearTimeout(this.profilesLoadTimeoutId);
                this.profilesLoadTimeoutId = null;
            }
            if (e.detail.profiles.length > 0) {
                this.fillProfileSelector(e.detail.profiles);
            }
            window.removeEventListener('profilesReady', handleProfilesReadyOnce);
        };

        window.addEventListener('profilesReady', handleProfilesReadyOnce);
    }

    /**
     * Cargar perfiles disponibles
     */
    async loadProfiles() {
        if (!this.currentUser || !this.profileSelect) {
            console.warn('⚠️ currentUser o profileSelect no disponible');
            return;
        }

        console.log('📋 loadProfiles() iniciado');

        // Estrategia 1: Verificar si el manager ya tiene perfiles cargados
        if (window.familyProfilesManager && Array.isArray(window.familyProfilesManager.profiles)) {
            const profiles = window.familyProfilesManager.profiles;

            if (profiles.length > 0) {
                console.log('✅ Perfiles ya disponibles en manager:', profiles.length);
                this.fillProfileSelector(profiles);
                return;
            }
        }

        // Estrategia 2: Si no están disponibles, escuchar el evento profilesReady
        console.log('⏳ Esperando evento profilesReady...');

        const handleProfilesReady = (event) => {
            const profiles = event.detail.profiles;
            console.log('📢 Evento profilesReady recibido en loadProfiles con', profiles.length, 'perfiles');

            window.removeEventListener('profilesReady', handleProfilesReady);

            if (profiles.length > 0) {
                this.fillProfileSelector(profiles);
            } else {
                this.profileSelect.innerHTML = '<option value="">No hay perfiles creados</option>';
            }
        };

        window.addEventListener('profilesReady', handleProfilesReady);

        // Estrategia 3: Timeout suave de 5 segundos
        const timeoutId = setTimeout(() => {
            console.log('⏱️ Timeout esperando profilesReady...');

            window.removeEventListener('profilesReady', handleProfilesReady);

            if (window.familyProfilesManager && Array.isArray(window.familyProfilesManager.profiles)) {
                const profiles = window.familyProfilesManager.profiles;
                if (profiles.length > 0) {
                    console.log('✅ Perfiles encontrados en verificación final:', profiles.length);
                    this.fillProfileSelector(profiles);
                    return;
                }
            }

            console.log('📭 Sin perfiles disponibles');
            this.profileSelect.innerHTML = '<option value="">Crea un perfil para comenzar</option>';
        }, 5000);

        this.profilesLoadTimeoutId = timeoutId;
    }


    /**
     * Llenar el selector de perfiles
     */
    fillProfileSelector(profiles) {
        if (!this.profileSelect) return;

        if (profiles.length === 0) {
            this.profileSelect.innerHTML = '<option value="">No hay perfiles creados</option>';
            return;
        }

        this.profileSelect.innerHTML = profiles
            .map(p => `<option value="${p.id}">${p.fullName} (${p.age} años)</option>`)
            .join('');

        console.log('✅ Selector de triaje actualizado con', profiles.length, 'perfiles');

        if (profiles.length > 0) {
            const firstProfileId = profiles[0].id;
            this.profileSelect.value = firstProfileId;
            console.log('📌 Perfil pre-seleccionado:', firstProfileId);
        }
    }

    /**
     * Seleccionar un perfil para el triaje
     */
    selectProfile(profileId) {
        console.log('🎯 selectProfile() llamado con ID:', profileId);

        if (!profileId) {
            console.log('⚪ Perfil vacío seleccionado');
            this.selectedProfile = null;
            this.triageMessages.innerHTML = '<div class="text-center text-gray-500 text-sm"><p>Selecciona un familiar para comenzar</p></div>';
            if (this.triageMessageInput) this.triageMessageInput.disabled = true;
            return;
        }

        console.log('🔍 Buscando perfil:', profileId);

        // Buscar el perfil en el manager global
        if (window.familyProfilesManager && typeof window.familyProfilesManager.getProfileById === 'function') {
            console.log('✔️ Manager disponible, buscando getProfileById...');
            this.selectedProfile = window.familyProfilesManager.getProfileById(profileId);
            if (this.selectedProfile) {
                console.log('✅ Perfil encontrado en manager:', this.selectedProfile.fullName);
                this.updateTriageUI();
                return;
            } else {
                console.warn('⚠️ getProfileById retornó null para:', profileId);
            }
        } else {
            console.warn('⚠️ Manager no disponible o getProfileById no existe');
        }

        // Fallback: buscar en Firestore
        console.log('🔄 Buscando perfil en Firestore...');
        this.db.collection('app_families').doc(profileId).get().then(doc => {
            if (doc.exists) {
                this.selectedProfile = { id: doc.id, ...doc.data() };
                console.log('✅ Perfil encontrado en Firestore:', this.selectedProfile.fullName);
                this.updateTriageUI();
            } else {
                console.warn('⚠️ Perfil no encontrado en Firestore:', profileId);
                this.selectedProfile = null;
            }
        }).catch(error => {
            console.error('❌ Error buscando en Firestore:', error.code, error.message);
            this.selectedProfile = null;
        });
    }

    /**
     * Actualizar la UI del triaje
     */
    updateTriageUI() {
        if (!this.selectedProfile) return;

        // Mostrar nombre del perfil
        if (this.triageProfileName) {
            this.triageProfileName.textContent = `- ${this.selectedProfile.fullName}`;
        }

        // Limpiar mensajes
        this.triageMessages.innerHTML = '';

        // Mostrar información del perfil
        const profileInfo = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm mb-4">
                <p class="text-blue-900 mb-2"><strong>${this.selectedProfile.fullName}</strong></p>
                <p class="text-gray-700"><i class="fas fa-birthday-cake mr-1"></i> ${this.selectedProfile.age} años</p>
                <p class="text-gray-700"><i class="fas fa-scale-balanced mr-1"></i> ${this.selectedProfile.weight} kg</p>
                ${this.selectedProfile.antecedents?.pathological ? `<p class="text-gray-700"><i class="fas fa-heartbeat mr-1"></i> Patológicos: ${this.selectedProfile.antecedents.pathological}</p>` : ''}
                ${this.selectedProfile.antecedents?.medications ? `<p class="text-gray-700"><i class="fas fa-pills mr-1"></i> Medicamentos: ${this.selectedProfile.antecedents.medications}</p>` : ''}
            </div>
        `;

        // Mensaje inicial de la IA
        const welcomeMessage = `
            <div class="bg-gray-100 rounded-lg p-4 text-sm text-gray-800 mb-4">
                <p><strong>👨‍⚕️ Dr. García:</strong></p>
                <p>Hola, soy el Dr. García. Voy a ayudarte a evaluar los síntomas de ${this.selectedProfile.fullName}.</p>
                <p class="mt-2">Por favor, describe los síntomas que presenta actualmente.</p>
            </div>
        `;

        this.triageMessages.innerHTML = profileInfo + welcomeMessage;

        // Habilitar input
        if (this.triageMessageInput) {
            this.triageMessageInput.disabled = false;
            this.triageMessageInput.focus();
        }

        // Guardar perfil seleccionado en sessionStorage
        sessionStorage.setItem('selectedProfile', JSON.stringify(this.selectedProfile));
    }

    /**
     * Enviar mensaje al triaje
     */
    async sendMessage() {
        if (!this.selectedProfile || !this.triageMessageInput) return;

        const message = this.triageMessageInput.value.trim();
        if (!message) return;

        // Mostrar mensaje del usuario
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'bg-emerald-100 rounded-lg p-4 text-sm text-emerald-900 text-right mb-3';
        userMessageDiv.innerHTML = `<p><strong>Tú:</strong> ${this.escapeHtml(message)}</p>`;
        this.triageMessages.appendChild(userMessageDiv);

        // Guardar sesión en Firestore (historial)
        try {
            await this.db.collection('app_triage_sessions').add({
                userId: this.currentUser.uid,
                profileId: this.selectedProfile.id,
                profileName: this.selectedProfile.fullName,
                message: message,
                timestamp: new Date().toISOString(),
                userMessage: true
            });
        } catch (error) {
            console.error('❌ Error al guardar sesión de triaje:', error);
        }

        // Limpiar input
        this.triageMessageInput.value = '';

        // Mostrar que está "pensando"
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'bg-gray-100 rounded-lg p-4 text-sm text-gray-800 mb-3';
        thinkingDiv.innerHTML = '<p><strong>👨‍⚕️ Dr. García:</strong> Analizando tu respuesta...</p>';
        this.triageMessages.appendChild(thinkingDiv);

        // Auto scroll al final
        this.triageMessages.scrollTop = this.triageMessages.scrollHeight;

        // Generar respuesta de IA (en producción, esto sería una llamada a Cloud Functions con Gemini)
        setTimeout(() => {
            const aiResponse = this.generateAIResponse(message);
            thinkingDiv.innerHTML = `<p><strong>👨‍⚕️ Dr. García:</strong></p><p>${aiResponse}</p>`;

            // Guardar respuesta en Firestore
            this.db.collection('app_triage_sessions').add({
                userId: this.currentUser.uid,
                profileId: this.selectedProfile.id,
                profileName: this.selectedProfile.fullName,
                message: aiResponse,
                timestamp: new Date().toISOString(),
                userMessage: false
            }).catch(error => console.error('❌ Error guardando respuesta:', error));

            this.triageMessages.scrollTop = this.triageMessages.scrollHeight;
        }, 1500);
    }

    /**
     * Generar respuesta de IA (simulada con palabras clave)
     * En producción, esto llamaría a Cloud Functions que usa Gemini API
     */
    generateAIResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();

        // Palabras clave y respuestas
        const keywords = {
            'fiebre': '🌡️ He detectado que menciones fiebre. ¿Cuál es la temperatura exacta? ¿Cuánto tiempo lleva con fiebre? ¿Hay escalofríos o sudoración?',
            'dolor': '⚠️ Hay presencia de dolor. Es importante conocer: ¿Dónde exactamente duele? ¿Cuál es la intensidad (1-10)? ¿Es constante o intermitente?',
            'tos': '🫁 He identificado que tiene tos. ¿Es seca o produce mucosidad? ¿Cuánto tiempo lleva? ¿Hay dificultad para respirar?',
            'cabeza': '🤕 Dolor de cabeza detectado. ¿Es un dolor pulsátil, constante o intermitente? ¿Qué intensidad tiene (1-10)? ¿Hay náuseas?',
            'garganta': '😷 Dolor de garganta. ¿Hay enrojecimiento? ¿Dificultad para tragar? ¿Amigdalas inflamadas o con pus?',
            'estómago': '🤢 Síntomas gastrointestinales. ¿Hay náuseas, vómitos o diarrea? ¿Desde cuándo comenzó? ¿Qué comió antes?',
            'vómito': '🤢 Vómitos detectados. ¿Cuántas veces ha vomitado? ¿El vómito tiene sangre? ¿Hay deshidratación aparente?',
            'diarrea': '💧 Diarrea identificada. ¿Cuántas deposiciones ha tenido? ¿Hay sangre en las heces? ¿Hay deshidratación?',
            'respiración': '🫁 Problema respiratorio. ¿Tiene dificultad para respirar en reposo o solo con actividad? ¿Hay sibilancias?',
            'alergia': '🔔 Reacción alérgica posible. ¿Tiene antecedentes de alergias? ¿Hay inflamación o picazón? ¿Cuándo empezó?'
        };

        // Buscar coincidencias
        for (const [keyword, response] of Object.entries(keywords)) {
            if (lowerMessage.includes(keyword)) {
                return response;
            }
        }

        // Respuesta por defecto
        return '📋 Entiendo. Basándome en esta información, estoy evaluando los síntomas. ¿Hay otros síntomas asociados o cambios recientes en la salud de ' + this.selectedProfile.fullName + '?';
    }

    /**
     * Escapar HTML para evitar inyecciones
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

let triageChat;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando TriageChat...');
    triageChat = new TriageChat();
});

