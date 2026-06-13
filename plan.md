# Plan: Redisenar Sidebar de Integrantes a Historial de Conversaciones estilo ChatGPT

## Contexto
Actualmente la columna izquierda muestra una lista de "Integrantes" (familiares). Se debe reemplazar por un historial de conversaciones agrupadas por fecha, con un selector de integrante al crear nueva conversacion.

## Decisiones del usuario
- Al crear "Nueva conversacion" se pregunta para que integrante es (selector/modal)
- Titulo automatico: "Consulta - [Nombre] - [Fecha]"
- Agrupacion por fecha: Hoy, Ayer, Ultimos 7 dias, Ultimos 30 dias, Anteriores

## Cambios necesarios

### 1. Nuevo modelo de datos en Firestore
**Ruta actual:** `Cuentas_Tutor/{uid}/Integrantes/{memberId}/orientaciones/default/mensajes/{msgId}`
**Ruta nueva:** `Cuentas_Tutor/{uid}/conversaciones/{conversationId}`
  - `memberId: string`
  - `memberName: string`
  - `title: string` (ej: "Consulta - Alexander - 09/Jun/2026")
  - `createdAt: Timestamp`
  - `updatedAt: Timestamp`
  - `messageCount: number`

**Mensajes:** `Cuentas_Tutor/{uid}/conversaciones/{conversationId}/mensajes/{msgId}`
  - role, content, timestamp, imageUrls (igual que ahora)

### 2. Nuevo componente: ConversationSidebar
Reemplaza `MemberSidebar` dentro de `teleorientacion-chat.tsx`:
- Boton "+ Nueva conversacion" arriba
- Lista de conversaciones agrupada por fecha (Hoy, Ayer, Ultimos 7 dias, etc.)
- Cada item muestra: titulo truncado, hora/fecha relativa
- Seleccion resalta la activa
- Responsive: overlay en mobile, fijo en desktop

### 3. Selector de integrante al crear nueva conversacion
Al presionar "+ Nueva conversacion":
- Dialog/modal con lista de integrantes
- Al seleccionar uno, se crea un doc en `conversaciones/` con titulo auto
- Se carga esa conversacion vacia en el chat

### 4. Modificar teleorientacion-chat.tsx
- Estado principal cambia de `selectedMember` a `selectedConversation`
- Cargar lista de conversaciones al inicio (query ordenada por updatedAt desc)
- Al seleccionar conversacion: cargar mensajes de esa conversacion
- Al enviar mensaje: actualizar `updatedAt` y `messageCount` del doc de conversacion
- Mantener `selectedMember` derivado de la conversacion activa (para context del paciente)
- "Nueva sesion" ahora crea una conversacion nueva (no solo limpia UI)

### 5. Migrar datos existentes
- Opcional: script o logica que al detectar mensajes en la ruta vieja los mueva
- Minimo: la app debe funcionar aunque no haya conversaciones previas

### 6. Header del chat
- Mostrar titulo de la conversacion activa
- Mostrar nombre del integrante y datos (edad, sexo) como subtitulo
- Mantener boton "Nueva sesion" (que ahora abre el selector de integrante)

### 7. Archivos a modificar
- `src/components/dashboard/teleorientacion-chat.tsx` - Componente principal (mayor cambio)
- `src/lib/constants.ts` - Nueva constante para coleccion de conversaciones
- `src/types/chat.ts` - Nuevo tipo `Conversation`
- `firestore.rules` - Permisos para nueva coleccion

### 8. Archivos a crear
- Ninguno nuevo necesario, todo se integra en el componente existente

## Orden de ejecucion
1. Agregar constante y tipo nuevo
2. Reescribir MemberSidebar -> ConversationSidebar (dentro del mismo archivo)
3. Agregar selector de integrante (Dialog dentro del mismo archivo)
4. Modificar logica de carga/persistencia de mensajes
5. Modificar header y "Nueva sesion"
6. Actualizar firestore.rules
7. Verificar compilacion
