# 🚀 MyHomeDoctorApp - Guía Rápida de Configuración

## ✅ Archivos Refactorizados

### 1. **family-profiles.js** ✓
**Estado:** Completo y funcional

**Características:**
- ✅ Guarda todos los campos médicos en Firestore (`app_families`)
  - Nombre, Fecha de Nacimiento (edad auto-calculada)
  - Sexo, Peso (kg)
  - Antecedentes: Patológicos, Quirúrgicos, Alérgicos, Medicamentos
- ✅ Modal para agregar/editar perfiles
- ✅ No redirige a login si no hay usuario (permite revisión del código)

**Ubicación de datos:** `Firestore → app_families`

---

### 2. **triage-chat.js** ✓✓✓
**Estado:** Completamente refactorizado

**Cambios Principales:**

#### 📌 Variables de Configuración (Líneas 11-20):

```javascript
// EDITA AQUÍ - Tu prompt médico personalizado
const SYSTEM_PROMPT = "";

// EDITA AQUÍ - Tu API Key de Gemini (solo si usas opción 1)
const GEMINI_API_KEY = "";
```

**¿Dónde pegar tus valores?**

1. **SYSTEM_PROMPT:** Abre el archivo en VS Code
   - Línea 15: Borra `""` y pega tu prompt médico completo
   - Ejemplo: `const SYSTEM_PROMPT = "Eres un médico experto en triaje...";`

2. **GEMINI_API_KEY:** Obtén de https://aistudio.google.com/app/apikey
   - Línea 19: Pega tu API key (ejemplo: `AIzaSyXx...`)
   - ⚠️ En producción, NO dejes la key aquí. Usa Cloud Function.

#### 🔄 Dos Opciones de Integración:

**OPCIÓN 1: API Directo (Desarrollo)**
- Pega tu API key en `GEMINI_API_KEY`
- Funciona inmediatamente
- ⚠️ NO usar en producción (expone la key)

**OPCIÓN 2: Cloud Function (Producción - RECOMENDADO)**
- Deja `GEMINI_API_KEY = ""`
- Sube tu `functions_index_example.js` a Firebase Cloud Functions
- La app intentará usar Cloud Function automáticamente
- Si no está disponible, cae a Opción 1 (si hay API key)

#### 🧠 Construcción de Prompts:

**Método: `buildSystemPrompt()`** (Línea 380-415)

```javascript
// Automáticamente COMBINA:
// 1. Tu SYSTEM_PROMPT personalizado (si no está vacío)
// 2. Datos del paciente:
//    - Nombre, Edad, Sexo, Peso
//    - Antecedentes médicos (Patológicos, Quirúrgicos, Alérgicos, Medicamentos)
// 3. Si SYSTEM_PROMPT está vacío, usa prompt default médico
```

**Flujo de Mensaje:**
```
Usuario escribe: "Tengo dolor de cabeza"
    ↓
buildSystemPrompt() inyecta contexto del paciente
    ↓
Combine: [SYSTEM_PROMPT] + [DATOS_PACIENTE] + [MENSAJE_USUARIO]
    ↓
Envía a IA → Gemini API o Cloud Function
    ↓
Respuesta inyectada con contexto médico
```

#### 🔐 Autenticación:

- ✅ No redirige si no hay usuario
- ✅ Muestra mensajes de "requiere login"
- ✅ Funciona una vez que el usuario se autentica en Firebase

---

## 📋 Resumen de Métodos Clave

### `family-profiles.js`
| Método | Descripción |
|--------|-------------|
| `loadFamilyProfiles()` | Carga perfiles de Firestore |
| `handleSaveProfile(event)` | Guarda nuevo perfil con todos los campos médicos |
| `selectProfileForTriage(profileId)` | Selecciona perfil para triaje |
| `calculateAge()` | Auto-calcula edad desde DOB |

### `triage-chat.js`
| Método | Descripción |
|--------|-------------|
| `buildSystemPrompt()` | **CLAVE**: Combina SYSTEM_PROMPT + datos del paciente |
| `sendToAI(userMessage)` | Envía a Cloud Function o API Gemini |
| `sendToGeminiAPI()` | Fallback directo a Gemini API |
| `initializeChat()` | Inicia chat para un perfil seleccionado |

---

## 🔗 Flujo de Datos Completo

```
FAMILY-PROFILES                    TRIAGE-CHAT
─────────────────────────────────────────────────
Usuario crea perfil
    ↓
Guarda en Firestore (app_families)
    ↓
El perfil aparece en selector
    ↓
Usuario selecciona un perfil
    ↓
                    → buildSystemPrompt() crea:
                      [SYSTEM_PROMPT] + [DATOS_PACIENTE]
                      ↓
                    Usuario envía mensaje
                      ↓
                    sendToAI() envía:
                      SystemPrompt + UserMessage + HistorialConversación
                      ↓
                    Respuesta guardada en app_triage_sessions
```

---

## 🎯 Próximos Pasos

1. **Si usas OPCIÓN 1 (API Directo):**
   - [ ] Obtén tu API key de Gemini: https://aistudio.google.com/app/apikey
   - [ ] Pega en línea 19 de `triage-chat.js`
   - [ ] Pega tu prompt médico en línea 15

2. **Si usas OPCIÓN 2 (Cloud Function):**
   - [ ] Sube `functions_index_example.js` a Firebase Console
   - [ ] Configura API key en variables de entorno
   - [ ] Deja vacíos `SYSTEM_PROMPT` y `GEMINI_API_KEY` en `triage-chat.js`

3. **Prueba:**
   - [ ] Crea un perfil en "Mi Familia"
   - [ ] Ve a "Triaje Inteligente"
   - [ ] Selecciona el perfil
   - [ ] Envía un mensaje de prueba

---

## 📝 Notas Importantes

- ✅ Ambos archivos **YA ESTÁN CONFIGURADOS** para trabajar juntos
- ✅ Los antecedentes médicos se inyectan automáticamente en los prompts
- ✅ El chat mantiene historial por sesión en Firestore
- ⚠️ NO dejes API keys en cliente en producción
- 🔐 Usa Cloud Functions para seguridad

**¿Preguntas? Revisa los comentarios en el código (/* ... */)**
