// MyHomeDoctorApp - Patient App Lógica Principal
// Versión 2.0 - Dashboard Profesional con IA

class PatientApp {
    constructor() {
        this.currentDoctor = null;
        this.patients = [];
        this.currentPatient = null;
        this.aiReady = false;
        
        // Elementos del DOM
        this.elements = {
            doctorName: document.getElementById('doctorName'),
            dateDisplay: document.getElementById('dateDisplay'),
            totalPacientes: document.getElementById('totalPacientes'),
            consultasHoy: document.getElementById('consultasHoy'),
            casosPendientes: document.getElementById('casosPendientes'),
            medicalNoteInput: document.getElementById('medicalNoteInput'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            aiForm: document.getElementById('aiForm'),
            aiResult: document.getElementById('aiResult'),
            aiLoading: document.getElementById('aiLoading'),
            aiMotivo: document.getElementById('aiMotivo'),
            aiDiagnostico: document.getElementById('aiDiagnostico'),
            aiSintomas: document.getElementById('aiSintomas'),
            aiPlan: document.getElementById('aiPlan'),
            patientsTable: document.getElementById('patientsTable'),
            logoutBtn: document.getElementById('logoutBtn'),
            logoutBtnMobile: document.getElementById('logoutBtnMobile'),
        };
        
        this.initialize();
    }
    
    /**
     * Inicializar la aplicación
     */
    initialize() {
        this.setupEventListeners();
        this.updateDate();
        this.checkAuthentication();
        
        // Actualizar fecha cada minuto
        setInterval(() => this.updateDate(), 60000);
    }
    
    /**
     * Configurar oyentes de eventos
     */
    setupEventListeners() {
        // Formulario IA
        this.elements.aiForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.analyzeWithAI();
        });
        
        // Logout
        this.elements.logoutBtn.addEventListener('click', () => this.logout());
        this.elements.logoutBtnMobile.addEventListener('click', () => this.logout());
    }
    
    /**
     * Actualizar fecha y hora
     */
    updateDate() {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        const dateStr = now.toLocaleDateString('es-ES', options);
        this.elements.dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
    
    /**
     * Verificar autenticación
     */
    checkAuthentication() {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                this.currentDoctor = user;
                this.loadDoctorInfo();
                this.loadPatients();
                this.enableAI();
            } else {
                window.location.href = 'login.html';
            }
        });
    }
    
    /**
     * Cargar información del médico
     */
    loadDoctorInfo() {
        const firstName = this.currentDoctor.displayName?.split(' ')[0] || 'Doctor';
        this.elements.doctorName.textContent = firstName;
    }
    
    /**
     * Cargar lista de pacientes desde Firestore
     */
    loadPatients() {
        const db = firebase.firestore();
        
        db.collection('patients')
            .where('doctorId', '==', this.currentDoctor.uid)
            .orderBy('createdAt', 'desc')
            .onSnapshot(
                (snapshot) => {
                    this.patients = [];
                    snapshot.forEach((doc) => {
                        this.patients.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                    
                    this.updateStats();
                    this.renderPatients();
                },
                (error) => {
                    console.error('Error del sistema: No se pudieron cargar los pacientes');
                }
            );
    }
    
    /**
     * Actualizar estadísticas
     */
    updateStats() {
        this.elements.totalPacientes.textContent = this.patients.length;
        
        // Consultas de hoy (simulado)
        const today = new Date().toDateString();
        const consultasHoy = this.patients.filter(p => 
            p.lastConsultDate?.toDate?.()?.toDateString?.() === today
        ).length;
        this.elements.consultasHoy.textContent = consultasHoy;
        
        // Casos pendientes (simulado)
        this.elements.casosPendientes.textContent = Math.max(0, Math.floor(this.patients.length * 0.2));
    }
    
    /**
     * Renderizar lista de pacientes
     */
    renderPatients() {
        const tbody = this.elements.patientsTable;
        
        if (this.patients.length === 0) {
            tbody.innerHTML = `
                <tr class="border-b border-slate-200">
                    <td colspan="4" class="py-8 px-4 text-center text-slate-500">
                        <i class="fas fa-inbox text-2xl mb-2 block opacity-30"></i>
                        No hay pacientes registrados aún.
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.patients.map(patient => `
            <tr class="border-b border-slate-200 hover:bg-slate-50 cursor-pointer" data-patient-id="${patient.id}">
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                            <i class="fas fa-user text-teal-600 text-sm"></i>
                        </div>
                        <span class="font-medium text-slate-900">${patient.name || 'Paciente'}</span>
                    </div>
                </td>
                <td class="py-3 px-4 hidden sm:table-cell text-slate-600">${patient.age || '-'} años</td>
                <td class="py-3 px-4 hidden md:table-cell text-slate-600">${patient.lastDiagnosis || '-'}</td>
                <td class="py-3 px-4 text-slate-600 text-xs">
                    ${this.formatDate(patient.lastConsultDate)}
                </td>
            </tr>
        `).join('');
    }
    
    /**
     * Formatear fecha
     */
    formatDate(date) {
        if (!date) return 'Nunca';
        
        try {
            const d = date.toDate ? date.toDate() : new Date(date);
            const now = new Date();
            const diff = now - d;
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) return 'Hoy';
            if (days === 1) return 'Ayer';
            if (days < 7) return `${days}d atrás`;
            if (days < 30) return `${Math.floor(days / 7)}s atrás`;
            
            return d.toLocaleDateString('es-ES');
        } catch (e) {
            return '-';
        }
    }
    
    /**
     * Habilitar función IA
     */
    enableAI() {
        this.aiReady = true;
        this.elements.analyzeBtn.disabled = false;
    }
    
    /**
     * Analizar caso con IA (Gemini)
     */
    async analyzeWithAI() {
        const note = this.elements.medicalNoteInput.value.trim();
        
        if (!note) {
            alert('⚠️ Por favor, ingresa una nota clínica');
            return;
        }
        
        if (!this.aiReady) {
            alert('❌ IA no está disponible. Intenta más tarde.');
            return;
        }
        
        // Mostrar carga
        this.elements.aiLoading.classList.remove('hidden');
        this.elements.aiResult.classList.add('hidden');
        this.elements.analyzeBtn.disabled = true;
        
        try {
            // Llamar Cloud Function
            const functions = firebase.functions('us-central1');
            const analyzeMedicalRecord = functions.httpsCallable('analyzeMedicalRecord');
            
            const result = await analyzeMedicalRecord({ text: note });
            
            // Mostrar resultados
            this.displayAIResult(result.data.analysis);
            
        } catch (error) {
            console.error('Error del sistema: No se pudo procesar el análisis');
            alert(`❌ Error: ${error.message}`);
        } finally {
            this.elements.aiLoading.classList.add('hidden');
            this.elements.analyzeBtn.disabled = false;
        }
    }
    
    /**
     * Mostrar resultados del análisis IA
     */
    displayAIResult(analysis) {
        // Limpiar
        this.elements.aiResult.classList.remove('hidden');
        
        // Motivo Consulta
        this.elements.aiMotivo.textContent = analysis.motivo_consulta || '-';
        
        // Diagnóstico
        this.elements.aiDiagnostico.textContent = analysis.diagnostico_sugerido || '-';
        
        // Síntomas
        const sintomas = analysis.sintomas || [];
        this.elements.aiSintomas.innerHTML = sintomas.length > 0 
            ? sintomas.map(s => `<li>${s}</li>`).join('')
            : '<li>-</li>';
        
        // Plan de Acción
        const plan = analysis.plan_accion || [];
        this.elements.aiPlan.innerHTML = plan.length > 0
            ? plan.map(p => `<li>${p}</li>`).join('')
            : '<li>-</li>';
        
        // Guardar en BD (opcional)
        this.saveAnalysisToDatabase(analysis);
    }
    
    /**
     * Guardar análisis en Firestore
     */
    async saveAnalysisToDatabase(analysis) {
        try {
            const db = firebase.firestore();
            
            await db.collection('medicalAnalysis').add({
                doctorId: this.currentDoctor.uid,
                analysis: analysis,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                note: this.elements.medicalNoteInput.value,
            });
            
        } catch (error) {
            console.warn('Error del sistema: No se pudo guardar el análisis');
        }
    }
    
    /**
     * Cerrar sesión
     */
    logout() {
        firebase.auth().signOut()
            .then(() => {
                window.location.href = 'login.html';
            })
            .catch((error) => {
                console.error('Error del sistema: No se pudo cerrar la sesión');
                alert('Error al cerrar sesión');
            });
    }
}

// ============================================================================
// INICIALIZAR CUANDO EL DOM ESTÉ LISTO
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    new PatientApp();
});

// Manejo de errores global
window.addEventListener('error', (event) => {
    console.error('Error global no capturado');
});
