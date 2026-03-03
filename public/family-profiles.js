/**
 * MyHomeDoctorApp - Family Profiles Management
 * Gestión de perfiles familiares con almacenamiento en Firestore
 * Nueva estructura: Cuentas_Tutor/{userId}/Integrantes
 */

import { auth, db, firebase } from './firebase-config.js';

// Constantes de colecciones
const COLECCION_TUTOR = 'Cuentas_Tutor';
const SUBCOLECCION_INTEGRANTES = 'Integrantes';

class FamilyProfilesManager {
    constructor() {
        this.currentUser = null;
        this.profiles = [];
        this.snapshotListener = null; // Para evitar múltiples listeners
        // Usar las instancias importadas desde firebase-config.js
        this.db = db;
        this.auth = auth;
        
        // Referencias a listeners para poder removerlos
        this.formSubmitBound = null;
        this.openAddProfileModalBound = null;
        this.calculateAgeBound = null;
        
        this.initialize();
    }

    /**
     * Inicializar el manager
     */
    initialize() {
        // Esperar a que Firebase esté listo
        this.auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                console.log('👤 Usuario autenticado:', user.email);
                
                // Delay para asegurar que Firestore está completamente listo (4 segundos)
                setTimeout(() => {
                    console.log('⏱️ Inicializando carga de perfiles...');
                    this.loadFamilyProfiles();
                    this.setupEventListeners();
                }, 4000);
            } else {
                // Redirigir a login si no está autenticado
                window.location.href = 'login.html';
            }
        });
    }

    /**
     * Cargar perfiles de localStorage (backup offline)
     */
    loadProfilesFromLocalStorage() {
        try {
            const key = 'familyProfiles_' + this.currentUser.uid;
            console.log('💾 Intentando cargar de localStorage con key:', key);
            
            const stored = localStorage.getItem(key);
            console.log('💾 Valor en localStorage:', stored);
            
            if (stored) {
                const profiles = JSON.parse(stored);
                console.log('💾 ✅ Perfiles cargados desde localStorage:', profiles.length, profiles);
                return profiles;
            } else {
                console.log('💾 localStorage vacío para esta key');
            }
        } catch (e) {
            console.error('❌ Error cargando localStorage:', e.message, e);
        }
        return [];
    }

    /**
     * Guardar perfiles en localStorage (backup offline)
     */
    saveProfilesToLocalStorage() {
        try {
            const key = 'familyProfiles_' + this.currentUser.uid;
            const data = JSON.stringify(this.profiles);
            console.log('💾 Guardando', this.profiles.length, 'perfiles en localStorage con key:', key);
            console.log('💾 Datos guardados:', data);
            
            localStorage.setItem(key, data);
            console.log('✅ Perfiles guardados correctamente en localStorage');
        } catch (e) {
            console.error('❌ Error guardando localStorage:', e.message, e);
        }
    }

    /**
     * Cargar perfiles de la familia desde Firestore
     */
    loadFamilyProfiles() {
        if (!this.currentUser) {
            console.warn('⚠️ currentUser no disponible');
            return;
        }

        console.log('📋 Iniciando carga de perfiles para:', this.currentUser.uid);

        // Delay adicional para asegurar que Firestore esté completamente sincronizado (1 segundo)
        setTimeout(() => {
            console.log('🚀 Ejecutando onSnapshot con userId:', this.currentUser.uid);
            
            // Desuscribir del listener anterior si existe
            if (this.snapshotListener) {
                console.log('🔄 Desuscribiendo listener anterior');
                this.snapshotListener();
            }
            
            // Guardar la referencia del listener para poder detenerlo después si es necesario
            // Nueva estructura: Cuentas_Tutor/{userId}/Integrantes
            this.snapshotListener = this.db
                .collection(COLECCION_TUTOR)
                .doc(this.currentUser.uid)
                .collection(SUBCOLECCION_INTEGRANTES)
                .onSnapshot(
                    (snapshot) => {
                        console.log('✅ Snapshot recibido con', snapshot.docs.length, 'perfiles');
                        console.log('🔍 Query: app_families WHERE userId ==', this.currentUser.uid);
                        
                        // ✨ NO RESETEAR - Merge inteligentemente
                        const remoteDocs = [];
                        snapshot.forEach((doc) => {
                            console.log('📄 Documento encontrado:', doc.id);
                            console.log('📋 Datos:', JSON.stringify(doc.data(), null, 2));
                            remoteDocs.push({
                                id: doc.id,
                                ...doc.data()
                            });
                        });

                        // Si Firestore está offline, cargar de localStorage
                        let profilesFromFirestore = remoteDocs;
                        if (remoteDocs.length === 0) {
                            console.log('📡 Snapshot vacío (posiblemente offline), intentando localStorage...');
                            const fromStorage = this.loadProfilesFromLocalStorage();
                            if (fromStorage && fromStorage.length > 0) {
                                profilesFromFirestore = fromStorage;
                                console.log('💾 ✅ Recuperados', fromStorage.length, 'perfiles de localStorage');
                            }
                        }

                        // Mantener perfiles locales que NO están en Firestore
                        const localProfiles = this.profiles.filter(p => p.id && p.id.startsWith('local_'));
                        
                        // Combinar: remotos + locales
                        this.profiles = [...profilesFromFirestore, ...localProfiles];

                        // Ordenar localmente por createdAt
                        this.profiles.sort((a, b) => {
                            const dateA = new Date(a.createdAt || 0);
                            const dateB = new Date(b.createdAt || 0);
                            return dateB - dateA; // Descendente
                        });

                        // ✨ GUARDAR EN LOCALSTORAGE para backup
                        this.saveProfilesToLocalStorage();

                        console.log('📊 Total perfiles después de merge:', this.profiles.length);
                        console.log('📊 Total perfiles cargados:', this.profiles.length);
                        this.renderProfilesList();
                        
                        // Notificar que los perfiles están listos (solo si hay cambios)
                        window.dispatchEvent(new CustomEvent('profilesReady', {
                            detail: { profiles: this.profiles }
                        }));
                    },
                    (error) => {
                        console.error('❌ Error en onSnapshot:', error.code, error.message);
                        console.log('🔄 Intentando con get() como alternativa...');
                        this.db
                            .collection(COLECCION_TUTOR)
                            .doc(this.currentUser.uid)
                            .collection(SUBCOLECCION_INTEGRANTES)
                            .get()
                            .then(snapshot => {
                                this.profiles = [];
                                snapshot.forEach((doc) => {
                                    this.profiles.push({
                                        id: doc.id,
                                        ...doc.data()
                                    });
                                });
                                this.profiles.sort((a, b) => {
                                    const dateA = new Date(a.createdAt || 0);
                                    const dateB = new Date(b.createdAt || 0);
                                    return dateB - dateA;
                                });
                                console.log('✅ Perfiles cargados con get():', this.profiles.length);
                                this.renderProfilesList();
                                
                                // Notificar que los perfiles están listos
                                window.dispatchEvent(new CustomEvent('profilesReady', {
                                    detail: { profiles: this.profiles }
                                }));
                            })
                            .catch(getError => {
                                console.error('❌ Error en get():', getError.code, getError.message);
                            });
                    }
                );
        }, 500);
    }

    /**
     * Configurar oyentes de eventos
     */
    setupEventListeners() {
        // Botón para abrir modal de agregar familiar
        const addProfileBtn = document.getElementById('addProfileBtn');
        if (addProfileBtn) {
            addProfileBtn.removeEventListener('click', this.openAddProfileModalBound);
            this.openAddProfileModalBound = () => this.openAddProfileModal();
            addProfileBtn.addEventListener('click', this.openAddProfileModalBound);
        }

        // Formulario de nuevo perfil
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            // Remover listener anterior si existe
            if (this.formSubmitBound) {
                profileForm.removeEventListener('submit', this.formSubmitBound);
            }
            // Crear nueva referencia y guardarla
            this.formSubmitBound = (e) => this.handleSaveProfile(e);
            profileForm.addEventListener('submit', this.formSubmitBound);
        }

        // Calcular edad automáticamente
        const dobInput = document.getElementById('profileDOB');
        if (dobInput) {
            dobInput.removeEventListener('change', this.calculateAgeBound);
            this.calculateAgeBound = () => this.calculateAge();
            dobInput.addEventListener('change', this.calculateAgeBound);
        }

        // Cerrar modal
        const closeModalBtn = document.getElementById('closeProfileModal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal());
        }

        // Botón cancelar
        const cancelBtn = document.getElementById('cancelProfileBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }

        // Cerrar modal al hacer click en el fondo
        const modal = document.getElementById('profileModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }
    }

    /**
     * Abrir modal para agregar nuevo perfil
     */
    openAddProfileModal() {
        const modal = document.getElementById('profileModal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }

        // Limpiar formulario
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.reset();
        }
    }

    /**
     * Cerrar modal
     */
    closeModal() {
        console.log('🎯 closeModal() iniciando...');
        
        const modal = document.getElementById('profileModal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            console.log('🎯 Modal ocultado');
        } else {
            console.warn('⚠️ Modal no encontrado');
        }

        // Limpiar formulario
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.reset();
            console.log('🎯 Formulario reseteado');
            
            // Remover listener de submit anterior
            if (this.formSubmitBound) {
                profileForm.removeEventListener('submit', this.formSubmitBound);
                this.formSubmitBound = null;
                console.log('🎯 Listener de submit removido');
            }
        } else {
            console.warn('⚠️ Formulario no encontrado');
        }

        // Limpiar sessionStorage de edición
        sessionStorage.removeItem('editingProfileId');

        // Resetear título del modal
        const modalTitle = document.querySelector('#profileModal h3');
        if (modalTitle) {
            modalTitle.textContent = 'Agregar Nuevo Perfil';
        }

        // Resetear display de edad
        const ageDisplay = document.getElementById('ageDisplay');
        if (ageDisplay) {
            ageDisplay.textContent = 'Edad: -';
        }
        
        console.log('🎯 closeModal() completado');
    }

    /**
     * Obtener un perfil por su ID
     */
    getProfileById(profileId) {
        return this.profiles.find(p => p.id === profileId) || null;
    }

    /**
     * Mostrar selector de perfiles en la sección de triaje
     */
    showProfileSelection() {
        const profileSelect = document.getElementById('profileSelect');
        if (!profileSelect) {
            console.warn('⚠️ profileSelect no encontrado en el DOM');
            return;
        }

        console.log('🎯 showProfileSelection() llamado con', this.profiles.length, 'perfiles');

        // Actualizar opciones del selector con perfiles actualizados
        if (this.profiles && this.profiles.length > 0) {
            profileSelect.innerHTML = this.profiles
                .map(p => `<option value="${p.id}">${p.fullName} (${p.age} años)</option>`)
                .join('');
            
            // Seleccionar el primero por defecto
            const firstProfileId = this.profiles[0].id;
            console.log('📌 Seleccionando primer perfil:', firstProfileId);
            profileSelect.value = firstProfileId;
            
            // Disparar el evento change para que se ejecute el listener
            const event = new Event('change', { bubbles: true });
            profileSelect.dispatchEvent(event);
            console.log('📡 Evento change disparado');
        } else {
            profileSelect.innerHTML = '<option value="">No hay perfiles creados</option>';
        }
    }

    /**
     * Abrir modal para editar perfil
     */
    openEditProfileModal(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) {
            alert('❌ Perfil no encontrado');
            return;
        }

        // Llenar formulario con datos existentes
        document.getElementById('profileFullName').value = profile.fullName;
        document.getElementById('profileDOB').value = profile.dateOfBirth;
        document.getElementById('profileSex').value = profile.sex;
        document.getElementById('profileWeight').value = profile.weight;
        document.getElementById('profileRelationship').value = profile.relationship;
        document.getElementById('profilePathological').value = profile.antecedents?.pathological || '';
        document.getElementById('profileSurgical').value = profile.antecedents?.surgical || '';
        document.getElementById('profileAllergic').value = profile.antecedents?.allergic || '';
        document.getElementById('profileMedications').value = profile.antecedents?.medications || '';

        // Guardar el ID del perfil que se está editando
        sessionStorage.setItem('editingProfileId', profileId);

        // Cambiar título del modal
        const modalTitle = document.querySelector('#profileModal h3');
        if (modalTitle) {
            modalTitle.textContent = `Editar Perfil: ${profile.fullName}`;
        }

        // Abrir modal
        const modal = document.getElementById('profileModal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }
    }

    /**
     * Calcular edad automáticamente desde fecha de nacimiento
     */
    calculateAge() {
        const dobInput = document.getElementById('profileDOB');
        const ageDisplay = document.getElementById('ageDisplay');

        if (!dobInput.value || !ageDisplay) return;

        const dob = new Date(dobInput.value);
        const today = new Date();

        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();

        if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < dob.getDate())
        ) {
            age--;
        }

        ageDisplay.textContent = `Edad: ${age} años`;
    }

    /**
     * Guardar nuevo perfil en Firestore
     */
    async handleSaveProfile(event) {
        event.preventDefault();
        console.log('🔴 handleSaveProfile() iniciado');

        // Validación de usuario
        if (!this.currentUser) {
            alert('❌ Usuario no autenticado');
            return;
        }

        // Validación de Firestore
        if (!this.db) {
            alert('❌ Error: Base de datos no disponible');
            console.error('Firestore no está inicializado');
            return;
        }

        // Recopilar datos del formulario
        const fullName = document.getElementById('profileFullName')?.value.trim() || '';
        const dob = document.getElementById('profileDOB')?.value || '';
        const sex = document.getElementById('profileSex')?.value || '';
        const weight = document.getElementById('profileWeight')?.value || '';
        const relationship = document.getElementById('profileRelationship')?.value || '';
        const pathological = document.getElementById('profilePathological')?.value.trim() || '';
        const surgical = document.getElementById('profileSurgical')?.value.trim() || '';
        const allergic = document.getElementById('profileAllergic')?.value.trim() || '';
        const medications = document.getElementById('profileMedications')?.value.trim() || '';

        // Validaciones
        if (!fullName || !dob || !sex || !weight || !relationship) {
            alert('⚠️ Por favor, completa todos los campos requeridos');
            return;
        }

        // ✨ CIERRE INMEDIATO: Cerrar modal AHORA
        console.log('🚀 Cerrando modal INMEDIATAMENTE (sin esperar Firestore)');
        this.closeModal();
        console.log('✅ Modal cerrado, formulario rehabilitado');

        // ✨ GUARDAR EN BACKGROUND: Firestore se guarda sin bloquear la UI
        console.log('📝 Guardando perfil en background...');
        this.saveProfileToFirestore(fullName, dob, sex, weight, relationship, pathological, surgical, allergic, medications);

        alert(`✅ Perfil de ${fullName} guardado`);
    }

    /**
     * Guardar perfil en Firestore (sin bloquear la UI)
     */
    async saveProfileToFirestore(fullName, dob, sex, weight, relationship, pathological, surgical, allergic, medications) {
        try {
            const age = this.calculateAgeFromDOB(dob);
            const editingProfileId = sessionStorage.getItem('editingProfileId');

            console.log('📦 Preparando datos del perfil...');
            console.log('👤 userId:', this.currentUser.uid);
            console.log('📝 fullName:', fullName);
            console.log('🎂 dateOfBirth:', dob);

            const profileData = {
                userId: this.currentUser.uid,
                fullName: fullName,
                dateOfBirth: dob,
                age: age,
                sex: sex,
                weight: parseFloat(weight),
                relationship: relationship,
                antecedents: {
                    pathological: pathological,
                    surgical: surgical,
                    allergic: allergic,
                    medications: medications
                }
            };

            console.log('📦 profileData completo:', JSON.stringify(profileData, null, 2));

            if (editingProfileId) {
                // MODO EDICIÓN
                profileData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                
                try {
                    // Nueva estructura: Cuentas_Tutor/{userId}/Integrantes/{profileId}
                    const updatePromise = this.db
                        .collection(COLECCION_TUTOR)
                        .doc(this.currentUser.uid)
                        .collection(SUBCOLECCION_INTEGRANTES)
                        .doc(editingProfileId)
                        .update(profileData);
                    await Promise.race([
                        updatePromise,
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Timeout')), 15000)
                        )
                    ]);
                    console.log('✅ Perfil actualizado en Firestore');
                } catch (err) {
                    console.warn('⚠️ Error Firestore (actualización):', err.message);
                }
                
                const profileIndex = this.profiles.findIndex(p => p.id === editingProfileId);
                if (profileIndex >= 0) {
                    this.profiles[profileIndex] = {
                        ...this.profiles[profileIndex],
                        ...profileData,
                        id: editingProfileId
                    };
                }
                sessionStorage.removeItem('editingProfileId');
            } else {
                // MODO CREACIÓN
                console.log('➕ MODO CREACIÓN - Agregando timestamps...');
                profileData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                profileData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                console.log('⏰ serverTimestamp asignados');

                // ✨ NO ESPERAR - Solo enviar a Firestore sin bloquear
                // El listener automáticamente recibirá los cambios
                try {
                    console.log('🔄 Enviando perfil a Firestore (sin esperar)...');
                    // Nueva estructura: Cuentas_Tutor/{userId}/Integrantes
                    const addPromise = this.db
                        .collection(COLECCION_TUTOR)
                        .doc(this.currentUser.uid)
                        .collection(SUBCOLECCION_INTEGRANTES)
                        .add(profileData);
                    
                    // Guardamos el ID si se resuelve rápido (máximo 1 segundo)
                    addPromise
                        .then(docRef => {
                            console.log('✅ Perfil confirmado en Firestore:', docRef.id);
                            profileData.id = docRef.id;
                        })
                        .catch(err => {
                            console.warn('⚠️ Error en confirmación de Firestore:', err.message);
                            profileData.id = 'local_' + Date.now();
                        });
                    
                    // NO esperar - continuar inmediatamente
                    console.log('✅ Perfil enviado, continuando sin esperar...');
                } catch (err) {
                    console.error('❌ Error al iniciar guardado:', err.message);
                    profileData.id = 'local_' + Date.now();
                }
                
                this.profiles.push(profileData);
                console.log('✅ Perfil en array local. Total:', this.profiles.length);
                
                // ✨ Guardar en localStorage inmediatamente
                this.saveProfilesToLocalStorage();
            }

            window.dispatchEvent(new CustomEvent('perfilesActualizados', {
                detail: { profiles: this.profiles }
            }));
            console.log('📢 Evento disparado');
        } catch (error) {
            console.error('❌ Error:', error.message);
        }
    }

    /**
     * Calcular edad desde DOB
     */
    calculateAgeFromDOB(dobString) {
        const dob = new Date(dobString);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    }

    /**
     * Renderizar lista de perfiles
     */
    renderProfilesList() {
        const profilesList = document.getElementById('profilesList');
        if (!profilesList) return;

        if (this.profiles.length === 0) {
            profilesList.innerHTML = `
                <div class="text-center py-8 col-span-full">
                    <i class="fas fa-inbox text-4xl text-gray-300 mb-3 block"></i>
                    <p class="text-gray-500">No hay perfiles de familiares aún.</p>
                    <p class="text-gray-400 text-sm">Agrega el primero para comenzar.</p>
                </div>
            `;
            return;
        }

        profilesList.innerHTML = this.profiles
            .map(profile => {
                // Determinar icono de género
                const sexIcon = profile.sex === 'M' || profile.sexo === 'Masculino' ? '👨' : 
                               profile.sex === 'F' || profile.sexo === 'Femenino' ? '👩' : '👤';
                
                // Determinar si es titular
                const esTitular = profile.esTitular || profile.parentesco === 'Titular' || profile.relationship === 'Titular';
                const titularBadge = esTitular ? 
                    '<span class="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-1 rounded-full ml-1">⭐ Titular</span>' : '';
                
                // Formatear parentesco
                const parentesco = profile.relationship || profile.parentesco || 'Familiar';
                
                // Info demográfica
                const edad = profile.age !== null && profile.age !== undefined ? `${profile.age} años` : '';
                const peso = profile.weight ? `${profile.weight} kg` : '';
                const infoDemo = [edad, peso].filter(Boolean).join(' • ');
                
                // Antecedentes (solo mostrar si existen)
                let antecedentesHtml = '';
                if (profile.antecedents) {
                    const ant = profile.antecedents;
                    if (ant.pathological) {
                        antecedentesHtml += `<p class="text-gray-600"><i class="fas fa-heartbeat text-red-400 mr-1"></i> ${ant.pathological}</p>`;
                    }
                    if (ant.allergic) {
                        antecedentesHtml += `<p class="text-gray-600"><i class="fas fa-allergies text-orange-400 mr-1"></i> ${ant.allergic}</p>`;
                    }
                    if (ant.medications) {
                        antecedentesHtml += `<p class="text-gray-600"><i class="fas fa-pills text-blue-400 mr-1"></i> ${ant.medications}</p>`;
                    }
                }
                
                // Estado de perfil completo
                const perfilIncompleto = !profile.dateOfBirth || !profile.sex && !profile.sexo;
                const incompletoBadge = perfilIncompleto ? 
                    '<span class="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full"><i class="fas fa-exclamation-circle mr-1"></i>Completar datos</span>' : '';
                
                return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer profile-card ${esTitular ? 'ring-2 ring-amber-200' : ''}" data-profile-id="${profile.id}">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2 flex-wrap">
                                <span class="text-2xl">${sexIcon}</span>
                                <h4 class="font-semibold text-blue-950 text-lg">${profile.fullName || profile.nombres || 'Sin nombre'}</h4>
                                ${titularBadge}
                            </div>
                            <div class="flex flex-wrap gap-2 mb-2">
                                <span class="bg-teal-100 text-teal-800 text-xs font-semibold px-2 py-1 rounded-full">
                                    ${parentesco}
                                </span>
                                ${incompletoBadge}
                            </div>
                            ${infoDemo ? `<p class="text-gray-600 text-sm mb-2">${infoDemo}</p>` : ''}
                            ${antecedentesHtml ? `<div class="mt-3 space-y-1 text-xs border-t pt-2">${antecedentesHtml}</div>` : ''}
                        </div>
                        <div class="flex flex-col gap-2 ml-4">
                            <button class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition edit-profile-btn" data-profile-id="${profile.id}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${!esTitular ? `
                            <button class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition delete-profile-btn" data-profile-id="${profile.id}" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            })
            .join('');

        // Agregar listeners a botones de acción
        document.querySelectorAll('.edit-profile-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const profileId = btn.dataset.profileId;
                this.openEditProfileModal(profileId);
            });
        });

        document.querySelectorAll('.delete-profile-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const profileId = btn.dataset.profileId;
                if (confirm('¿Estás seguro de que deseas eliminar este perfil?')) {
                    this.deleteProfile(profileId);
                }
            });
        });

        // Al hacer click en una tarjeta, seleccionar para triaje
        document.querySelectorAll('.profile-card').forEach(card => {
            card.addEventListener('click', () => {
                const profileId = card.dataset.profileId;
                this.selectProfileForTriage(profileId);
            });
        });
    }

    /**
     * Eliminar perfil
     */
    async deleteProfile(profileId) {
        try {
            // Nueva estructura: Cuentas_Tutor/{userId}/Integrantes/{profileId}
            await this.db
                .collection(COLECCION_TUTOR)
                .doc(this.currentUser.uid)
                .collection(SUBCOLECCION_INTEGRANTES)
                .doc(profileId)
                .delete();

            alert('✅ Perfil eliminado exitosamente');

        } catch (error) {
            console.error('Error del sistema: No se pudo eliminar el perfil');
            alert(`❌ Error: ${error.message}`);
        }
    }

    /**
     * Seleccionar perfil para triaje
     */
    selectProfileForTriage(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;

        // Guardar en sessionStorage para que TriageChat pueda acceder
        sessionStorage.setItem('selectedProfile', JSON.stringify(profile));

        // Disparar evento personalizado
        const event = new CustomEvent('profileSelected', { detail: profile });
        window.dispatchEvent(event);
    }

    /**
     * Cargar perfiles desde localStorage (fallback cuando Firebase no disponible)
     */
    loadProfilesFromLocalStorage() {
        const stored = localStorage.getItem('app_families');
        if (stored) {
            this.profiles = JSON.parse(stored);
        } else {
            this.profiles = [];
        }
        this.renderProfilesList();
    }

    /**
     * Guardar perfiles en localStorage (fallback)
     */
    saveProfilesToLocalStorage() {
        localStorage.setItem('app_families', JSON.stringify(this.profiles));
    }

    /**
     * Obtener perfil seleccionado
     */
    getSelectedProfile() {
        const stored = sessionStorage.getItem('selectedProfile');
        return stored ? JSON.parse(stored) : null;
    }

    /**
     * Obtener perfil por ID
     */
    getProfileById(profileId) {
        return this.profiles.find(p => p.id === profileId);
    }
}

// ============================================================================
// INICIALIZAR CUANDO FIREBASE ESTÉ LISTO
// ============================================================================

let familyProfilesManager;

document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que Firebase esté disponible
    if (typeof firebase !== 'undefined') {
        familyProfilesManager = new FamilyProfilesManager();
        window.familyProfilesManager = familyProfilesManager;
        console.log('✅ familyProfilesManager disponible en window.familyProfilesManager');
    } else {
        setTimeout(() => {
            familyProfilesManager = new FamilyProfilesManager();
            window.familyProfilesManager = familyProfilesManager;
            console.log('✅ familyProfilesManager disponible en window.familyProfilesManager');
        }, 1000);
    }
});
