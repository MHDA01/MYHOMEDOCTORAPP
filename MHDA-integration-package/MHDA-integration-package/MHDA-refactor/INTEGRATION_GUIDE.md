# 🏠 MyHomeDoctorApp — Guía de Integración del Frontend Refactorizado

## Estructura de archivos nuevos

```
📁 tu-proyecto/
├── 📁 public/images/
│   ├── dra_hilda_avatar.png          ← Avatar de la Dra. Hilda (NUEVO)
│   └── logo.png                       ← Logo de la app (NUEVO)
│
├── 📁 src/
│   ├── 📁 types/
│   │   └── chat.ts                    ← Tipos TypeScript compartidos
│   │
│   ├── 📁 hooks/
│   │   └── useSpeechRecognition.ts    ← Hook de speech-to-text
│   │
│   ├── 📁 components/
│   │   ├── 📁 ui/
│   │   │   └── Avatar.tsx             ← Avatar reutilizable
│   │   │
│   │   ├── 📁 chat/
│   │   │   ├── index.ts              ← Barrel exports
│   │   │   ├── ChatInterface.tsx      ← Componente principal del chat
│   │   │   ├── ChatMessage.tsx        ← Burbuja de mensaje
│   │   │   ├── ChatInput.tsx          ← Input con micrófono
│   │   │   ├── ChatHeader.tsx         ← Cabecera con avatar
│   │   │   ├── TriageBanner.tsx       ← Banner de advertencia
│   │   │   └── TypingIndicator.tsx    ← Indicador de "escribiendo..."
│   │   │
│   │   └── 📁 layout/
│   │       ├── index.ts              ← Barrel exports
│   │       ├── Sidebar.tsx            ← Menú lateral hamburguesa
│   │       └── DashboardLayout.tsx    ← Layout con sidebar
│   │
│   └── 📁 app/
│       ├── globals.css                ← Estilos adicionales (FUSIONAR)
│       └── 📁 dashboard/
│           └── 📁 teleorientacion/
│               └── page.tsx           ← Página refactorizada (REEMPLAZAR)
│
└── tailwind.config.ts                 ← Colores de marca (FUSIONAR)
```

---

## Pasos de Integración

### 1️⃣ Copiar imágenes
```bash
# Copia el avatar y el logo a public/images/
cp dra_hilda_avatar.png  public/images/
cp LOGO_1.png             public/images/logo.png
```

### 2️⃣ Copiar tipos y hooks
```bash
# Copia los nuevos archivos
cp -r src/types/         tu-proyecto/src/types/
cp -r src/hooks/         tu-proyecto/src/hooks/
```

### 3️⃣ Copiar componentes
```bash
# Copia todos los componentes nuevos
cp -r src/components/ui/      tu-proyecto/src/components/ui/
cp -r src/components/chat/    tu-proyecto/src/components/chat/
cp -r src/components/layout/  tu-proyecto/src/components/layout/
```

### 4️⃣ Fusionar tailwind.config.ts
Agrega los colores `brand` y `medical` a tu `theme.extend.colors`:

```typescript
// En tu tailwind.config.ts existente, agrega:
colors: {
  brand: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#1E5F8B',
    700: '#1A4F75',
    800: '#153D5E',
    900: '#0F2B47',
    950: '#091A2E',
  },
  medical: {
    green: '#2BAD8E',
    red: '#DC2626',
    amber: '#F59E0B',
  },
},
```

### 5️⃣ Fusionar globals.css
Agrega las clases de scrollbar y la animación `pulse-ring` a tu `globals.css`.

### 6️⃣ Conectar con tu backend
En `page.tsx`, descomenta y ajusta el import de tu server action:

```typescript
// Cambia esto:
// import { sendTeleorientacionMessage } from '@/app/actions/teleorientacion';

// Y en handleSendMessage, reemplaza el placeholder con tu llamada real:
const response = await sendTeleorientacionMessage({
  message: content,
  memberId: currentMember.id,
  sessionId: currentSession.id,
});
```

### 7️⃣ Datos del usuario
Reemplaza los datos hardcodeados en `page.tsx` con datos reales de Firebase Auth:

```typescript
// Obtener datos del usuario autenticado
const { user } = useAuth(); // Tu hook de auth
const memberName = user?.displayName || 'Usuario';
```

### 8️⃣ Sidebar — Datos del usuario
En `Sidebar.tsx`, reemplaza el nombre hardcodeado con datos dinámicos del usuario:

```typescript
// Pasar como prop o usar context
<p>{user.displayName}</p>
<p>{user.email}</p>
```

---

## Funcionalidades incluidas

| Feature | Componente | Estado |
|---------|-----------|--------|
| Chat tipo LLM moderno | `ChatInterface` | ✅ |
| Avatar de Dra. Hilda | `DraHildaAvatar` | ✅ |
| Speech-to-text (micrófono) | `ChatInput` + `useSpeechRecognition` | ✅ |
| Menú hamburguesa | `Sidebar` | ✅ |
| Indicador de escritura | `TypingIndicator` | ✅ |
| Banner de triage | `TriageBanner` | ✅ |
| Responsive (móvil/desktop) | Todos | ✅ |
| Auto-scroll a último mensaje | `ChatInterface` | ✅ |
| Auto-resize del textarea | `ChatInput` | ✅ |
| Envío con Enter (Shift+Enter para nueva línea) | `ChatInput` | ✅ |
| Sidebar visible permanente en desktop | `Sidebar` | ✅ |
| Overlay al abrir menú en móvil | `Sidebar` | ✅ |
| Cerrar menú con Escape | `Sidebar` | ✅ |
| Timestamps en mensajes | `ChatMessage` | ✅ |
| Colores de marca coherentes | `tailwind.config.ts` | ✅ |

---

## Notas importantes

1. **No se rompe la funcionalidad existente**: Solo se cambia la capa de presentación.
2. **Server Action**: La lógica de `teleorientacion.ts` se mantiene intacta.
3. **TypeScript**: Todos los componentes están tipados correctamente.
4. **Web Speech API**: Funciona en Chrome, Edge y Safari. Firefox tiene soporte limitado.
5. **Idioma del reconocimiento de voz**: Configurado en `es-CO` (español Colombia).
