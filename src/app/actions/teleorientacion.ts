// ============================================================
// app/actions/teleorientacion.ts — Server Action: Hilda AI
// El servidor guarda los mensajes y arma el historial; el teléfono solo manda lo nuevo.
// Migrado desde Abacus AI (routellm), que dejó de responder con HTTP 402.
// ============================================================
'use server';

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */
export interface TeleorientacionResponse {
  success: boolean;
  message: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const MODEL_ID = process.env.TELEORIENTACION_MODEL || DEFAULT_GEMINI_MODEL;
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.4;

/**
 * La teleorientación es el único punto donde el modelo decide a qué nivel de
 * atención encaminar, así que aquí sí se le deja razonar antes de responder
 * (-1 = presupuesto dinámico, lo decide el modelo). El resto de los usos
 * —consejo diario, agente de contenido— siguen con el razonamiento apagado.
 *
 * Por eso MAX_TOKENS sube de 2048 a 4096: el razonamiento se descuenta del mismo
 * presupuesto que la respuesta. Medido en un turno real, el modelo gastó ~890
 * tokens pensando y ~670 respondiendo; con 2048 cabía, pero un caso clínico
 * largo dejaría la respuesta sin aire. Solo se factura lo que realmente se usa.
 *
 * **Por qué es una variable de entorno y no una constante (9-nov-2026).** Esos
 * ~890 tokens se cobran como salida, que es el lado caro (seis veces la
 * entrada): son del orden de COP 205 por orientación, la partida más grande que
 * hay. Apagarlos abarataría mucho, pero es un cambio de comportamiento clínico y
 * no se decide desde una hoja de cálculo: se decide corriendo
 * `npm run evaluar:hilda` con el razonamiento apagado y comprobando si los 48/48
 * urgentes derivados se sostienen con 0 escapados.
 *
 * El valor por defecto es el de siempre, así que **nada cambia hasta que alguien
 * lo cambie a propósito**. Poner `TELEORIENTACION_THINKING_BUDGET=0` permite
 * correr esa medición sin tocar el código ni desplegar. La decisión, con la
 * evidencia del evaluador delante, es del médico responsable.
 */
const THINKING_BUDGET = Number.isFinite(Number(process.env.TELEORIENTACION_THINKING_BUDGET))
  ? Number(process.env.TELEORIENTACION_THINKING_BUDGET)
  : -1;

/**
 * El saludo no razona, y esto sí se puede afirmar sin evaluador.
 *
 * El turno del saludo recibe una instrucción cerrada —"saluda, preséntate y
 * explica qué es la teleorientación"— y no tiene delante ni un síntoma ni un
 * antecedente: no hay nada que decidir. Dejarle el presupuesto dinámico le
 * costaba al turno unos ~890 tokens de razonamiento al precio de salida, que es
 * el más caro, para redactar un saludo.
 *
 * Son dos cosas a la vez: menos costo en el primero de los turnos de cada
 * consulta, y menos espera justo donde más se nota, porque el razonamiento
 * ocurre ANTES del primer token visible y el paciente acaba de abrir el chat.
 */
const THINKING_BUDGET_SALUDO = 0;

/**
 * System prompt de Hilda.
 * Define su personalidad, límites éticos y cómo orienta al nivel de atención.
 *
 * Identidad corregida el 21-oct-2026: Hilda ya no se presenta como "Dra." ni
 * como médica. Es un personaje creado con IA, y la misma frase se usa en la
 * portada, en el ingreso y en el inicio.
 *
 * Marco legal corregido el 21-oct-2026 (v2.2): citaba la Resolución 2654 de
 * 2019, derogada por la Resolución 1644 de 2026. La redacción es la que ya
 * existía en la rama `hilda-agentes`, para no escribir una tercera versión.
 *
 * Exploración ampliada el 28-oct-2026, aprobada por el médico responsable: el
 * orden de la Sección 3.1 pasó de siete pasos a nueve. Faltaban si el síntoma
 * es permanente o intermitente, y si la presentación es aguda o viene
 * evolucionando hacia la cronicidad. Son las dos variables que distinguen un
 * lumbago crónico de una lumbalgia aguda, y las que hacen comparable el
 * seguimiento entre la consulta y las reevaluaciones.
 *
 * Esto es texto clínico y legal: no se cambia sin aprobación del médico.
 */
const SYSTEM_PROMPT = `SYSTEM PROMPT — Hilda v2.2 (Res. 1644 de 2026) (myhomedoctorapp)

Eres Hilda, un personaje creado con inteligencia artificial que da orientación en salud en myhomedoctorapp.
NO eres médica ni profesional de la salud, y nunca digas ni insinúes que lo eres: no uses "Dra.", "doctora" ni ningún título para hablar de ti misma.
Si el paciente te llama "doctora", acláralo con amabilidad una sola vez y sigue con la consulta; no lo repitas en cada mensaje.
Tu función es orientar, educar y apoyar al paciente sin reemplazar la consulta médica presencial.

════════════════════════════════════════════════════════
## 1. PROTOCOLO DE SALUDO PROACTIVO (PRIORIDAD MÁXIMA)
════════════════════════════════════════════════════════
- SIEMPRE saluda al inicio de cada nueva sesión o conexión, ANTES de que el usuario escriba.
- Verifica si es un nuevo día o una nueva conexión:
    • Nueva conexión (mismo día) → "¡Hola de nuevo, [Nombre]! Aquí estoy. ¿Cómo te sientes?"
    • Nuevo día → "¡Buenos días/tardes/noches, [Nombre]! Un nuevo día para cuidar tu salud. ¿En qué puedo ayudarte hoy?"
    • Primera vez → Saluda calidamente, preséntate como Hilda, di que eres un personaje creado con inteligencia artificial, y entrega la siguiente explicación de forma empática, clara y estructurada:

      "¡Hola, [Nombre]! Soy Hilda, un personaje creado con inteligencia artificial que te orienta en salud en myhomedoctorapp. Bienvenido/a. Antes de comenzar, quiero contarte brevemente qué es la teleorientación y cómo puedo ayudarte:

      **¿Qué es la teleorientación?**
      La teleorientación es una actividad de telesalud regulada en Colombia por la Resolución 1644 de 2026 del Ministerio de Salud y Protección Social. Consiste en brindarte orientación, educación en salud, consejería y direccionamiento hacia los centros de atención médica que necesites.

      **¿Qué puedo hacer por ti?**
      - Orientarte sobre síntomas, hábitos saludables y prevención de enfermedades.
      - Educarte con información basada en evidencia científica.
      - Ayudarte a identificar si necesitas consulta médica presencial o de urgencias.
      - Guiarte hacia el nivel de atención adecuado (consulta general, especialista o urgencias).

      **¿Qué NO hago?**
      - No realizo diagnósticos definitivos.
      - No formulo ni prescribo medicamentos (la teleorientación no los incluye, según la Resolución 1644 de 2026).
      - No ordeno exámenes de laboratorio ni imágenes diagnósticas.
      - No reemplazo la consulta médica presencial.

      **Tu privacidad es importante:**
      Tus datos de salud son tratados como datos sensibles conforme a la Ley 1581 de 2012 de protección de datos personales. Toda nuestra comunicación viaja bajo protocolos seguros.

      Si en algún momento presentas una emergencia, por favor acude a urgencias o llama al 123.

      Estoy aquí para cuidarte. ¿En qué puedo orientarte hoy?"
- El saludo es OBLIGATORIO aunque existan tareas, recordatorios o conversaciones pendientes.
- El factor humano y la calidez son prioridad antes que cualquier tarea pendiente.
- Usa el nombre del usuario si está disponible en el perfil.
- Adapta el saludo a la hora del día (buenos días / buenas tardes / buenas noches).

════════════════════════════════════════════════════════
## 2. ESTÁNDAR DE EVIDENCIA CIENTÍFICA (OBLIGATORIO)
════════════════════════════════════════════════════════
- Trabajas EXCLUSIVAMENTE con Medicina Basada en la Evidencia (MBE).
- Toda recomendación debe coincidir con guías de práctica clínica vigentes de organismos reconocidos:
    • Colombia: Guías de Práctica Clínica del Ministerio de Salud y Protección Social / IETS.
    • Internacionales: OMS/OPS, CDC, NICE, USPSTF y sociedades científicas reconocidas.
- Da prioridad a lo que esas guías recomiendan de forma fuerte o con calidad de evidencia alta o
  moderada (sistema GRADE), o a lo que sustentan revisiones sistemáticas de ensayos clínicos.

- NO recomiendes ninguna medida que no esté respaldada por esas guías, en particular:
    • Remedios caseros, plantas, tés, productos "naturales", suplementos, homeopatía o terapias
      alternativas. Si el paciente pregunta por ellos, explica con honestidad que no hay evidencia
      suficiente de que sean eficaces y seguros para su caso, no des cantidades ni formas de uso,
      y oriéntalo a consultarlo con su médico.
    • Opinión aislada, anécdotas, consensos informales o información no verificable.

- HONESTIDAD SOBRE LAS FUENTES (sin excepciones):
    • NUNCA inventes ni cites estudios, autores, años, revistas, cifras, DOI ni números de artículo.
      Tu memoria sobre publicaciones puede ser inexacta: ante la menor duda, no cites.
    • NO etiquetes tus recomendaciones con niveles o grados de evidencia ("nivel Ia", "evidencia IIa",
      "GRADE alto"): no puedes verificarlos en cada caso.
    • Puedes mencionar el organismo en términos generales ("según las guías de la OMS...") solo
      cuando estés segura de que esa recomendación sí está en sus guías.
    • Para medidas generales de autocuidado o comodidad cuya evidencia es limitada (reposo, compresas,
      evitar ciertos alimentos...), NO digas "las guías recomiendan" ni "la evidencia muestra":
      preséntalas como medidas generales que a algunas personas les alivian, sin prometer efecto.
    • Si la evidencia es limitada, contradictoria o no la conoces con certeza, dilo:
      "Sobre este tema la evidencia disponible es limitada. Te recomiendo consultarlo con tu médico tratante."

- Si el usuario pregunta en qué te basas o te pide referencias: explica que te apoyas en las guías
  de práctica clínica de los organismos mencionados, que eres una inteligencia artificial que no
  consulta bases de datos en tiempo real y puede equivocarse, y que por eso no das referencias
  específicas; la decisión clínica final siempre corresponde a un profesional de la salud.

════════════════════════════════════════════════════════
## 3. ROL, ALCANCE Y LÍMITES CLÍNICOS
════════════════════════════════════════════════════════
- Tu rol es: orientar, educar y ayudar al paciente a identificar el nivel de atención que necesita.
- NO diagnosticas enfermedades específicas.
- NO prescribes medicamentos ni dosis.
- MEDICAMENTOS: nunca sugieras iniciar, suspender, cambiar, sustituir ni ajustar la dosis de ningún
  medicamento, incluidos los de venta libre, suplementos y productos naturales, y no propongas uno
  "en vez de" otro. Si el paciente pregunta qué tomar, explica que esa indicación debe darla un médico
  (la teleorientación no incluye prescripción; esta corresponde a las modalidades de telemedicina,
  Resolución 1644 de 2026) y oriéntalo al nivel de atención adecuado según sus síntomas.
- ALERGIAS Y ANTECEDENTES DEL PERFIL: tenlos siempre presentes. Si el paciente menciona que va a tomar
  o ya tomó algo de su lista de alergias, adviértele con claridad que no lo haga y oriéntalo a consultar;
  si describe signos de reacción alérgica grave (dificultad para respirar, hinchazón de labios, lengua
  o garganta), escala de inmediato a urgencias.
- NO reemplazas la evaluación clínica presencial, el examen físico ni los estudios paraclínicos.
- Ante signos de alarma o emergencia, responde SIEMPRE:
    "${FRASE_ESCALADA}"
- Signos de alarma que SIEMPRE escalan a urgencias:
    • Dolor torácico, dificultad respiratoria severa, pérdida de consciencia.
    • Signos de ACV (FAST: Face, Arms, Speech, Time).
    • Sangrado activo no controlable, trauma severo.
    • Ideación suicida o crisis de salud mental aguda.

════════════════════════════════════════════════════════
## 3.1. CÓMO PREGUNTAS: UNA SOLA PREGUNTA A LA VEZ
════════════════════════════════════════════════════════
REGLA DURA, SIN EXCEPCIONES SALVO ALARMA: cada mensaje tuyo termina en **UNA
sola pregunta**. Nunca dos. Nunca una lista de preguntas con viñetas. Nunca
"cuéntame A, B y C". Haces la pregunta, te detienes, y esperas la respuesta
antes de la siguiente.

Por qué: a quien está enfermo, asustado o escuchando en voz alta —sin poder
releer la pantalla— varias preguntas juntas lo desbordan. Contesta solo una, se
pierde el resto, y la anamnesis queda incompleta. Una conversación de diez
preguntas cortas da una orientación mucho más precisa que una de dos mensajes
con cinco preguntas cada uno.

Cómo exploras cada síntoma, en este orden, una pregunta por turno:
  1. Desde cuándo lo tiene y cómo empezó (de repente o poco a poco).
  2. Si lo siente todo el tiempo o va y viene.
  3. Si empezó hace poco, o es algo que lleva semanas o meses.
  4. Dónde exactamente lo siente, y si se corre hacia otra parte.
  5. Cómo es: punzante, opresivo, ardor, cólico…
  6. Qué tan intenso, de 1 a 10.
  7. Qué lo mejora y qué lo empeora.
  8. Qué otros síntomas lo acompañan.
  9. Si le ha pasado antes y qué hizo entonces.

Reglas de la conversación:
- Termina de explorar un síntoma antes de pasar al siguiente. Si el paciente
  menciona varios, dile cuál vas a mirar primero y vuelve a los otros después.
- No vuelvas a preguntar algo que el paciente ya dijo, ni algo que está en su
  perfil (edad, sexo, alergias, medicamentos).
- Si el paciente responde varias cosas a la vez, aprovéchalas todas y salta las
  preguntas que ya quedaron contestadas.
- No des la orientación final hasta haber explorado al menos el motivo
  principal. Si el paciente la pide antes, dile con calidez que necesitas un par
  de datos más para orientarlo bien.
- La pregunta va al final del mensaje, en una sola frase corta y en lenguaje
  llano. Antes de la pregunta puedes dar una frase de acompañamiento o una
  explicación breve, pero no otra pregunta.
- ÚNICA EXCEPCIÓN: si aparece una señal de alarma de la Sección 3, dejas de
  preguntar y escalas de inmediato. La seguridad va antes que la anamnesis
  completa.

════════════════════════════════════════════════════════
## 4. TONO, ESTILO Y FORMATO DE RESPUESTA
════════════════════════════════════════════════════════
- Lenguaje: claro, empático, profesional y accesible para pacientes no médicos.
- Usa viñetas o numeración para instrucciones paso a paso.
- Menciona el organismo o la guía de referencia cuando sea relevante y estés segura (ver Sección 2):
    Ejemplos: OMS, CDC, Ministerio de Salud y Protección Social de Colombia, GPC colombianas.
- Responde SIEMPRE en el idioma del usuario (español o inglés según detectes).
- Usa lenguaje probabilístico, nunca certeza absoluta:
    ✅ "La evidencia sugiere..." / "Según las guías actuales..." / "Los estudios muestran..."
    ❌ "Definitivamente tienes..." / "Esto es seguramente..."
- Mantén respuestas concisas pero completas. Evita párrafos largos sin estructura.

════════════════════════════════════════════════════════
## 5. TRANSPARENCIA Y CONFIANZA
════════════════════════════════════════════════════════
- Si no sabes algo, dilo claramente: "No tengo información suficiente sobre esto con el nivel de evidencia requerido."
- Nunca afirmes capacidades que no tienes: no buscas en internet ni consultas bases de datos
  (PubMed, Cochrane u otras) durante la conversación.
- Recuerda al usuario periódicamente (no en cada mensaje) que eres una herramienta de orientación, no un reemplazo médico.
- Protege la privacidad del usuario: no solicites datos sensibles innecesarios.

════════════════════════════════════════════════════════
## 6. LECTURA DE EXÁMENES DE LABORATORIO, INFORMES DE IMÁGENES DIAGNÓSTICAS Y LESIONES CUTÁNEAS
════════════════════════════════════════════════════════
Cuando el paciente adjunte una imagen o texto de un examen, informe o lesión, tu objetivo es
orientarlo con pasos claros y un tono empático y tranquilizador — nunca alarmante ni frío.

- **Exámenes de laboratorio** (ej. hemograma, química sanguínea, uroanálisis):
    1. Identifica los valores fuera del rango de referencia (si el rango aparece en el examen).
    2. Explica en lenguaje sencillo, sin tecnicismos, qué podría significar cada alteración.
    3. Entrega SIEMPRE una lista clara y numerada de pasos a seguir (ej. "1. Esto no es urgente,
       coméntaselo a tu médico en tu próximo control. 2. Mantente bien hidratado. 3. No te
       automediques mientras tanto.").
    4. Si detectas un valor crítico o de pánico, escala de inmediato según la Sección 3
       (atención médica presencial urgente).

- **Informes de imágenes diagnósticas** (ej. radiografía, ecografía, tomografía, resonancia):
    - Lees y explicas en lenguaje sencillo el INFORME escrito (los hallazgos redactados por el
      radiólogo), no la imagen médica cruda — no reemplazas la lectura del especialista.
    - Aclara siempre que estás explicando el informe, no reinterpretando la imagen original.
    - Entrega pasos claros a seguir, igual que con los exámenes de laboratorio.

- **Fotos de lesiones cutáneas** (ej. lunares, erupciones, heridas):
    - Describe de forma objetiva lo que observas (color, forma, bordes, tamaño aproximado,
      simetría) usando un lenguaje descriptivo, no diagnóstico.
    - Cuando aplique, orienta según características de alarma reconocidas en la evidencia
      (regla ABCDE: Asimetría, Bordes irregulares, Color variable, Diámetro >6mm, Evolución/cambio).
    - NUNCA nombres una enfermedad o condición específica como si fuera un diagnóstico confirmado
      (ej. no digas "esto es cáncer de piel" o "esto es psoriasis"); en su lugar usa lenguaje
      probabilístico y orientador ("estas características ameritan valoración presencial por
      dermatología en los próximos días" / "no observo signos de alarma, pero si cambia de
      tamaño, color o forma, consulta pronto").
    - Si observas signos de alarma (ABCDE positivo, sangrado, crecimiento rápido, dolor), indica
      que amerita evaluación presencial prioritaria.

- En todos los casos: mantén el formato de la Sección 4 (viñetas/numeración, lenguaje
  probabilístico, cita la guía o fuente cuando aplique) y respeta siempre los límites de la
  Sección 3 — orientas y educas, nunca diagnosticas con certeza ni reemplazas la evaluación
  presencial.

════════════════════════════════════════════════════════
## 7. VERIFICACIÓN DE SATISFACCIÓN ANTES DE CERRAR
════════════════════════════════════════════════════════
- Después de entregar una orientación completa sobre un tema (ej. un plan de acción, la lectura
  de un examen, o la respuesta a una pregunta de seguimiento), pregunta al paciente si siente que
  su duda quedó resuelta, por ejemplo: "¿Sientes que esta orientación resolvió tu duda, o
  necesitas que profundice en algo más sobre este mismo tema?"
- No hagas esta pregunta después de CADA mensaje — solo cuando el intercambio sobre ese tema
  parezca haber llegado a un punto de cierre natural (ya diste el plan de acción o respondiste
  la pregunta de seguimiento).
- Si el paciente responde afirmativamente (ej. "sí", "sí, gracias", "estoy satisfecho"), agradece
  y despídete cordialmente — esa respuesta es la señal de que la consulta puede cerrarse.
- Si el paciente responde que no, o hace otra pregunta relacionada con el mismo tema, continúa
  orientando con normalidad: seguir profundizando en el mismo caso NUNCA debe tratarse como un
  cambio de tema.`;

/* ------------------------------------------------------------------ */
/*  Servidor del chat                                                  */
/* ------------------------------------------------------------------ */
import { getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import {
  COLECCION_TUTOR,
  DOC_HISTORIAL,
  SUBCOLECCION_CONVERSACIONES,
  SUBCOLECCION_HISTORIAL,
  SUBCOLECCION_INTEGRANTES,
} from '@/lib/constants';
import { fechaDeHoy, fichaDesdePerfil, incorporarHallazgos, type Ficha } from '@/lib/ficha';
import { fichaParaElModelo } from '@/lib/ficha-para-el-modelo';
import { guardarFicha, leerFicha } from '@/lib/ficha-guardada';
import { extraerHallazgos, type Extraccion } from '@/lib/extractor';
import {
  guardarHallazgosDelEpisodio,
  leerHallazgosDelEpisodio,
} from '@/lib/hallazgos-del-episodio';
import { correrElGrafo, resumenParaLog, type GrafoDelTurno } from '@/lib/grafo-del-turno';
import type { HallazgoRegistrado } from '@/lib/hallazgos';
// La frase de escalada vive aquí y la interpola la sección 3 del SYSTEM_PROMPT,
// para que el detector del botón de urgencias no pueda separarse de ella.
import { FRASE_ESCALADA } from '@/lib/senal-de-alarma';
import {
  esTitularGuardado,
  ID_TITULAR,
  perfilDeIntegrante,
  perfilDeTitular,
} from '@/lib/paciente-de-consulta';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getUserTokenState } from '@/lib/token-system';
import {
  generateWithGemini,
  DEFAULT_GEMINI_MODEL,
  type GeminiContent,
  type GeminiPart,
  type GeminiResult,
  type GeminiUso,
} from '@/lib/gemini';
import {
  conAvisoDeUrgencias,
  IMAGEN_NO_VALIDA,
  MAX_CARACTERES_MENSAJE,
  MAX_IMAGENES_POR_MENSAJE,
  MENSAJE_MUY_LARGO,
} from '@/lib/textos-chat';

export interface PatientStructuredContext {
  firstName: string;
  lastName: string;
  age?: number;
  sex?: string;
  allergies?: string[];
  medications?: string[];
}

/** Límites del historial que se manda a la IA en cada turno. */
const MAX_MENSAJES_HISTORIAL = 40;
/** Solo las fotos de los 2 mensajes más recientes con fotos viajan como imagen. */
const MENSAJES_CON_FOTOS_EN_CONTEXTO = 2;
/** Tope de bytes de imagen por pedido (el límite de Gemini para datos en línea es 20 MB). */
const MAX_BYTES_IMAGENES_POR_PEDIDO = 15 * 1024 * 1024;
const MAX_BYTES_IMAGEN = 10 * 1024 * 1024;

type Resultado =
  | {
      success: true;
      message: string;
      /**
       * El grafo disparó una alarma determinista en este turno. Enciende el
       * botón de urgencias **además** del detector de frases, nunca en su
       * lugar: ver `grafo-del-turno.ts`. Ausente quiere decir que no se disparó
       * ninguna, no que no haya peligro.
       */
      alarmaDelGrafo?: boolean;
    }
  | { success: false; message: ''; error: string };

function fallo(error: string): Resultado {
  return { success: false, message: '', error };
}

/**
 * Verifica el Rate Limit del usuario en Firestore.
 * Límite: 20 mensajes cada 60 minutos.
 */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remainingWait?: number }> {
  const rateLimitRef = getAdminDb().collection('rate_limits').doc(userId);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 60 minutos
  const maxRequests = 20;

  return await getAdminDb().runTransaction(async (transaction) => {
    const doc = await transaction.get(rateLimitRef);
    const data = doc.data();

    if (!doc.exists || (now - data?.windowStart) > windowMs) {
      // Nueva ventana
      transaction.set(rateLimitRef, {
        count: 1,
        windowStart: now,
        lastRequest: now,
      });
      return { allowed: true };
    }

    if (data!.count >= maxRequests) {
      const waitTime = Math.ceil((data!.windowStart + windowMs - now) / (1000 * 60));
      return { allowed: false, remainingWait: waitTime };
    }

    transaction.update(rateLimitRef, {
      count: data!.count + 1,
      lastRequest: now,
    });
    return { allowed: true };
  });
}

function conversacionRef(userId: string, convId: string) {
  return getAdminDb().collection(COLECCION_TUTOR).doc(userId).collection(SUBCOLECCION_CONVERSACIONES).doc(convId);
}

/**
 * Persiste un mensaje cifrado. Si el cifrado falla NO se guarda: un dato de salud
 * nunca debe quedar en texto plano. `sistema` marca los textos que genera la app
 * (errores, cierres de consulta): se muestran en el chat pero no se mandan a la IA.
 */
async function persistConversationMessage(
  userId: string,
  convId: string,
  message: { role: string; content: string; imageUrls?: string[]; sistema?: boolean }
): Promise<void> {
  const convRef = conversacionRef(userId, convId);

  await convRef.collection('mensajes').add({
    role: message.role,
    content: encryptField(message.content),
    imageUrls: message.imageUrls || [],
    timestamp: Timestamp.now(),
    isEncrypted: true,
    ...(message.sistema ? { origen: 'sistema' } : {}),
  });

  // createdAt lo pone el cliente al crear la conversación; aquí no se toca.
  await convRef.set({
    updatedAt: FieldValue.serverTimestamp(),
    messageCount: FieldValue.increment(1),
  }, { merge: true });
}

/** uid de la sesión, solo si la conversación existe bajo esa cuenta. */
async function sesionConConversacion(idToken: string, convId: string): Promise<{ uid: string } | { error: string }> {
  if (!idToken || !convId || convId.includes('/')) {
    return { error: 'Solicitud inválida.' };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch (authError) {
    console.error('[Dra. Hilda] Error de verificación de token:', authError);
    return { error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.' };
  }
  const conversacion = await conversacionRef(uid, convId).get();
  if (!conversacion.exists) {
    return { error: 'Conversación no encontrada.' };
  }
  return { uid };
}

/**
 * Deja constancia en los registros del servidor de una foto del chat que no se
 * pudo subir. La subida ocurre en el teléfono y, sin esto, el fallo no deja
 * rastro. Solo datos técnicos: código de error, tipo, peso y navegador.
 */
export async function registrarFalloDeFoto(
  idToken: string,
  detalle: { codigo: string; tipo: string; bytes: number; navegador: string }
): Promise<void> {
  try {
    await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return;
  }
  console.error('[Dra. Hilda] Error subiendo foto desde el teléfono:', JSON.stringify({
    codigo: String(detalle?.codigo ?? '').slice(0, 120),
    tipo: String(detalle?.tipo ?? '').slice(0, 80),
    bytes: Number(detalle?.bytes) || 0,
    navegador: String(detalle?.navegador ?? '').slice(0, 250),
  }));
}

/**
 * Server Action pública para los textos que genera la app (errores y cierres de
 * consulta). El uid sale del token verificado, nunca del cliente.
 */
export async function persistSecureMessage(
  idToken: string,
  convId: string,
  message: { role: string; content: string; imageUrls?: string[]; sistema?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const sesion = await sesionConConversacion(idToken, convId);
  if ('error' in sesion) return { success: false, error: sesion.error };

  try {
    await persistConversationMessage(sesion.uid, convId, message);
    return { success: true };
  } catch (error) {
    console.error('[Dra. Hilda] Error persistiendo mensaje seguro:', error);
    return { success: false, error: 'No se pudo persistir el mensaje en el servidor.' };
  }
}

/**
 * Recupera mensajes de una conversación y los descifra (V#5).
 */
export async function getSecureMessages(idToken: string, convId: string) {
  try {
    if (!idToken || !convId) {
      return [];
    }

    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const snap = await conversacionRef(userId, convId)
      .collection('mensajes')
      .orderBy('timestamp', 'asc')
      .get();

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        role: data.role,
        content: data.isEncrypted ? decryptField(data.content) : data.content,
        imageUrls: data.imageUrls || [],
        timestamp: data.timestamp?.toDate?.() ?? new Date(),
      };
    });
  } catch (error) {
    console.error('[Dra. Hilda] Error recuperando mensajes:', error);
    return [];
  }
}

/**
 * Traduce la URL de descarga de una foto del chat a su ruta en Storage, solo si
 * es del bucket de la app y de la carpeta de esta conversación. Así el servidor
 * nunca descarga direcciones arbitrarias que mande el teléfono.
 */
function rutaDeFotoDeLaConsulta(url: string, uid: string, convId: string): string | null {
  let direccion: URL;
  try {
    direccion = new URL(url);
  } catch {
    return null;
  }
  const hostsPermitidos = ['firebasestorage.googleapis.com'];
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) hostsPermitidos.push(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  if (!hostsPermitidos.includes(direccion.host)) return null;

  const partes = direccion.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!partes || partes[1] !== process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) return null;

  let ruta: string;
  try {
    ruta = decodeURIComponent(partes[2]);
  } catch {
    return null;
  }
  const carpeta = `medical-images/${uid}/${convId}/`;
  if (!ruta.startsWith(carpeta) || ruta.includes('..')) return null;
  return ruta;
}

function archivoDeFoto(ruta: string) {
  return getAdminStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).file(ruta);
}

/** Tipo de imagen si el archivo existe, es imagen y pesa como máximo 10 MB. */
async function fotoValida(ruta: string): Promise<string | null> {
  try {
    const [metadatos] = await archivoDeFoto(ruta).getMetadata();
    const tamano = Number(metadatos.size ?? 0);
    const tipo = String(metadatos.contentType ?? '');
    return tipo.startsWith('image/') && tamano > 0 && tamano <= MAX_BYTES_IMAGEN ? tipo : null;
  } catch (error) {
    console.error('[Dra. Hilda] Error leyendo foto del chat:', error);
    return null;
  }
}

async function leerFoto(ruta: string): Promise<{ mimeType: string; data: Buffer } | null> {
  const tipo = await fotoValida(ruta);
  if (!tipo) return null;
  try {
    const [data] = await archivoDeFoto(ruta).download();
    return { mimeType: tipo, data };
  } catch (error) {
    console.error('[Dra. Hilda] Error descargando foto del chat:', error);
    return null;
  }
}

/**
 * Arma el historial para la IA desde Firestore (no desde el teléfono): los últimos
 * mensajes, sin los textos de sistema, con las fotos de los mensajes recientes.
 */
async function historialParaLaIA(uid: string, convId: string): Promise<GeminiContent[]> {
  const snap = await conversacionRef(uid, convId)
    .collection('mensajes')
    .orderBy('timestamp', 'desc')
    .limit(MAX_MENSAJES_HISTORIAL)
    .get();

  const contenidos: GeminiContent[] = [];
  let mensajesConFotos = 0;
  let bytesDeFotos = 0;

  // Del más nuevo al más viejo, para que las fotos recientes tengan prioridad.
  for (const doc of snap.docs) {
    const datos = doc.data();
    if (datos.origen === 'sistema') continue;

    let texto: string;
    try {
      texto = (datos.isEncrypted ? decryptField(datos.content) : datos.content)?.trim() ?? '';
    } catch {
      continue;
    }

    const partes: GeminiPart[] = [];
    const urls: string[] = Array.isArray(datos.imageUrls) ? datos.imageUrls : [];

    if (urls.length) {
      partes.push({ text: texto || 'Adjunto imágenes para orientación clínica.' });
      let incluidas = 0;
      if (mensajesConFotos < MENSAJES_CON_FOTOS_EN_CONTEXTO) {
        mensajesConFotos++;
        for (const url of urls.slice(0, MAX_IMAGENES_POR_MENSAJE)) {
          const ruta = rutaDeFotoDeLaConsulta(url, uid, convId);
          const foto = ruta ? await leerFoto(ruta) : null;
          if (!foto || bytesDeFotos + foto.data.length > MAX_BYTES_IMAGENES_POR_PEDIDO) continue;
          bytesDeFotos += foto.data.length;
          partes.push({ inlineData: { mimeType: foto.mimeType, data: foto.data.toString('base64') } });
          incluidas++;
        }
      }
      if (incluidas < urls.length) {
        partes.push({ text: `(En este mensaje el paciente adjuntó ${urls.length} imagen(es); no se reenvían en este turno.)` });
      }
    } else if (texto) {
      partes.push({ text: texto });
    }

    if (partes.length) {
      contenidos.push({ role: datos.role === 'assistant' ? 'model' : 'user', parts: partes });
    }
  }

  return contenidos.reverse();
}

/**
 * El contexto del paciente, como primer turno de la conversación.
 *
 * **Por qué no va en `systemInstruction`, que es donde estaba (9-nov-2026).**
 * El prompt de sistema se cachea (`src/lib/gemini-cache.ts`) para no pagar sus
 * ~4.000 tokens en cada turno, y un caché solo sirve si lo que guarda es
 * idéntico siempre. Mezclar ahí el nombre, la edad y las alergias de cada
 * persona haría un caché distinto por paciente: se pagaría el almacenamiento de
 * todos y no se ahorraría en ninguno.
 *
 * Así que se separan: en `systemInstruction` queda lo que no cambia nunca —y se
 * cachea—, y lo del paciente pasa a ser el primer turno de `contents`, que es
 * justo la parte que sí cambia. El modelo recibe el mismo texto; lo que cambia
 * es en qué campo viaja.
 */
/**
 * La ficha de la persona por la que se consulta, leída del servidor.
 *
 * **Por qué no viene del teléfono.** `PatientStructuredContext` lo arma el
 * navegador y llega aplanado: nombre, edad, alergias y medicamentos, sin fecha
 * de nacimiento, sin peso y sin los antecedentes del historial. La ficha se lee
 * aquí por la misma razón por la que `historialParaLaIA` lee los mensajes de
 * Firestore y no del teléfono: son antecedentes clínicos, y quien los arma no
 * puede ser el cliente.
 *
 * Devuelve `null` cuando no se puede leer, y entonces la consulta sigue
 * exactamente como antes. Un fallo leyendo la ficha no puede dejar sin
 * orientación a quien está preguntando.
 */
async function fichaDeLaConsulta(uid: string, convId: string): Promise<Ficha | null> {
  try {
    const conversacion = await conversacionRef(uid, convId).get();
    const memberId = conversacion.get('memberId');
    if (typeof memberId !== 'string' || !memberId) return null;

    const cuentaRef = getAdminDb().collection(COLECCION_TUTOR).doc(uid);
    const hoy = fechaDeHoy();

    const delTitular = async (): Promise<Ficha | null> => {
      const cuenta = await cuentaRef.get();
      return cuenta.exists ? fichaDesdePerfil(perfilDeTitular(memberId, cuenta.data()), hoy) : null;
    };

    if (memberId === ID_TITULAR) return delTitular();

    const integranteRef = cuentaRef.collection(SUBCOLECCION_INTEGRANTES).doc(memberId);
    const [integrante, historial] = await Promise.all([
      integranteRef.get(),
      integranteRef.collection(SUBCOLECCION_HISTORIAL).doc(DOC_HISTORIAL).get(),
    ]);

    // El integrante se borró, o es un documento antiguo del titular dentro de
    // Integrantes, que no trae su salud. Los dos casos los resuelve la cuenta.
    if (!integrante.exists || esTitularGuardado(integrante.data())) return delTitular();

    const delPerfil = fichaDesdePerfil(
      perfilDeIntegrante(memberId, integrante.data(), historial.exists ? historial.data() : null),
      hoy
    );

    // El perfil es la base y lo guardado va encima. En ese orden por dos
    // razones: si la persona corrige sus alergias en la app, el cambio entra; y
    // lo que Hilda aprendió en consultas anteriores no se pierde al recargar el
    // perfil, que es justo lo que hace que la ficha sirva de algo.
    const guardada = await leerFicha(uid, memberId);
    if (!guardada) return delPerfil;
    return { integranteId: memberId, campos: { ...delPerfil.campos, ...guardada.campos } };
  } catch (error) {
    console.error('[Dra. Hilda] Error leyendo la ficha de la consulta:', error);
    return null;
  }
}

/** Lo que dijo la PERSONA, para el extractor. Los turnos de Hilda no entran. */
function loQueDijoLaPersona(contenidos: readonly GeminiContent[]): string[] {
  return contenidos
    .filter((c) => c.role === 'user')
    .map((c) =>
      c.parts
        .map((p) => ('text' in p ? p.text : ''))
        .join(' ')
        .trim()
    )
    .filter(Boolean);
}

/**
 * Guarda en la ficha lo que la consulta dejó saber de la persona.
 *
 * Nunca lanza y nunca bloquea la respuesta: si esto falla, la orientación ya
 * salió y lo único que se pierde es el aprendizaje de este turno. Un extractor
 * caído deja la ficha sin enriquecer, que es un problema de mañana; tumbar la
 * consulta es un problema de ahora.
 */
async function guardarLoAprendido(
  uid: string,
  ficha: Ficha | null,
  extraccion: Extraccion | null
): Promise<void> {
  if (!ficha || !extraccion?.aceptados.length) return;
  try {
    const { ficha: nueva, guardados, omitidos } = incorporarHallazgos(ficha, extraccion.aceptados);
    if (!guardados.length) return;
    await guardarFicha(uid, nueva);
    console.log(
      `[Dra. Hilda] Ficha: ${guardados.length} antecedente(s) guardado(s) (${guardados.join(', ')})` +
        (omitidos.length ? `; ${omitidos.length} fuera de la ficha` : '')
    );
  } catch (error) {
    console.error('[Dra. Hilda] Error guardando la ficha:', error);
  }
}

/**
 * Guarda los hallazgos de hoy de esta consulta, que son los que la ficha
 * descarta por no ser antecedentes.
 *
 * No escribe cuando no hay nada nuevo: un turno de cortesía —"gracias",
 * "listo"— no deja hallazgos, y volver a escribir el mismo arreglo sería pagar
 * una escritura de Firestore por turno sin cambiar un dato.
 *
 * Como `guardarLoAprendido`, nunca lanza: si esto falla, la orientación ya salió
 * y lo que se pierde es la memoria del episodio.
 */
async function guardarElEpisodio(
  uid: string,
  convId: string,
  previos: readonly HallazgoRegistrado[],
  grafo: GrafoDelTurno
): Promise<void> {
  if (grafo.hallazgos.length === previos.length && grafo.hallazgos.every((h, i) => h === previos[i])) {
    return;
  }
  try {
    await guardarHallazgosDelEpisodio(uid, convId, grafo.hallazgos);
  } catch (error) {
    console.error('[Dra. Hilda] Error guardando los hallazgos del episodio:', error);
  }
}

function contextoDelPaciente(paciente: PatientStructuredContext, ficha?: Ficha | null): GeminiContent {
  const limpiar = (valor: unknown, maximo: number) => String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, maximo);
  const lista = (valores?: string[]) =>
    (Array.isArray(valores) ? valores : []).map((v) => limpiar(v, 100)).filter(Boolean).slice(0, 30).join(', ');

  const datos = [
    `Nombre: ${limpiar(paciente?.firstName, 80)} ${limpiar(paciente?.lastName, 80)}`.trim(),
    typeof paciente?.age === 'number' ? `Edad: ${paciente.age} años` : null,
    paciente?.sex ? `Sexo: ${limpiar(paciente.sex, 30)}` : null,
    lista(paciente?.allergies) ? `Alergias: ${lista(paciente?.allergies)}` : null,
    lista(paciente?.medications) ? `Medicamentos: ${lista(paciente?.medications)}` : null,
  ].filter(Boolean).join('\n');

  // La ficha va detrás de los datos básicos y solo si tiene algo que decir:
  // un encabezado vacío se paga igual que uno lleno. Ver `fichaParaElModelo`.
  const bloques = [`Contexto del paciente actual:\n${datos}`, fichaParaElModelo(ficha)].filter(Boolean);
  return { role: 'user', parts: [{ text: bloques.join('\n\n') }] };
}

/**
 * Deja en los registros lo que costó el turno.
 *
 * Importa por una razón concreta: el prompt de sistema son ~4.000 tokens que
 * viajan idénticos en cada turno y son lo más caro de la consulta. Gemini los
 * cobra al 10 % si su caché implícito reconoce el prefijo repetido.
 *
 * Desde el 6-nov-2026 la llamada va por el endpoint nativo precisamente para
 * que ese caché llegue a activarse (por el compatible con OpenAI daba 0 % en
 * nueve turnos seguidos). Pero el caché implícito es **oportunista**: pega a
 * veces. Por eso este número sigue habiendo que mirarlo, y por eso el paso
 * siguiente es el caché **explícito** (`cachedContents`), que lo vuelve
 * determinista en vez de dejarlo a suerte.
 *
 * `razonamiento` importa para la factura tanto como para la espera: se cobra al
 * precio de salida, seis veces el de entrada.
 *
 * No lleva la palabra "Error": la alerta de Cloud Run filtra por ese texto y
 * esto es información, no una incidencia.
 */
function registrarUso(uso?: GeminiUso): void {
  if (!uso) return;
  const porcentaje = uso.entrada > 0 ? Math.round((uso.cacheados / uso.entrada) * 100) : 0;
  console.log(
    `[Dra. Hilda] Uso: entrada ${uso.entrada}, cacheados ${uso.cacheados} (${porcentaje} %), ` +
      `salida ${uso.salida} (razonamiento ${uso.razonamiento})`
  );
}

/**
 * Deja en los registros cuánto tardó cada tramo del turno.
 *
 * Para qué: el teléfono mide la espera entera, pero no puede ver dónde se fue.
 * Esto separa lo que cuesta preparar el turno —media docena de idas y vueltas a
 * Firestore, una detrás de otra— de lo que cuesta la respuesta del modelo, que
 * es lo único que se puede atacar con streaming.
 *
 * Solo duraciones y tamaños: ni lo que preguntó el paciente ni lo que contestó
 * Hilda. Y sin la palabra "Error", igual que `registrarUso`: la alerta de Cloud
 * Run filtra por ese texto y esto es información, no una incidencia.
 */
function registrarTiempos(etiqueta: string, tramos: Array<[string, number]>, extra?: string): void {
  const linea = tramos.map(([nombre, ms]) => `${nombre} ${Math.round(ms)} ms`).join(', ');
  console.log(`[Dra. Hilda] Tiempos ${etiqueta}: ${linea}${extra ? ` (${extra})` : ''}`);
}

async function preguntarALaIA(
  paciente: PatientStructuredContext,
  contenidos: GeminiContent[],
  ficha: Ficha | null,
  thinkingBudget: number = THINKING_BUDGET
): Promise<GeminiResult> {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[Dra. Hilda] GEMINI_API_KEY no configurada');
  }
  const resultado = await generateWithGemini({
    // Solo lo que no cambia nunca: es lo que se cachea. Lo del paciente va de
    // primer turno. Ver `contextoDelPaciente`.
    system: SYSTEM_PROMPT,
    contents: [contextoDelPaciente(paciente, ficha), ...contenidos],
    model: MODEL_ID,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    thinkingBudget,
    // Por el endpoint nativo. Es el único de los dos donde el prompt de
    // sistema —~4.000 tokens idénticos en cada turno— llega a cachearse, y el
    // único que dice cuánto pensó el modelo. Ver la cabecera de `lib/gemini.ts`.
    nativo: true,
    // Caché explícito del prompt: deja de depender de que el implícito tenga a
    // bien activarse. Si no se puede crear, la llamada sigue igual que antes.
    cacheSistema: true,
    timeoutMs: 60_000,
    reintentos: 1,
  });
  if (resultado.ok) registrarUso(resultado.uso);
  return resultado;
}

/** Mensaje para el paciente cuando la IA no respondió. */
function errorDeLaIA(resultado: Exclude<GeminiResult, { ok: true }>): string {
  const statusLabel = resultado.status ? ` ${resultado.status}` : '';
  // También los timeouts: sin este registro la alerta del chat no los veía.
  console.error(`[Dra. Hilda] Error de Gemini (${resultado.kind}${statusLabel}): ${resultado.detail}`);
  if (resultado.kind === 'timeout') {
    return conAvisoDeUrgencias('La solicitud tardó demasiado. Verifica tu conexión e intenta de nuevo.');
  }
  if (resultado.kind === 'blocked') {
    return conAvisoDeUrgencias('No puedo responder a ese contenido. Reformula tu consulta, por favor.');
  }
  return conAvisoDeUrgencias(`Error del servicio de IA${statusLabel}. Intenta de nuevo en unos segundos.`);
}

/** Tokens y límite de 20 mensajes por hora; null si puede seguir. */
async function puedeConsultar(uid: string): Promise<string | null> {
  const tokenState = await getUserTokenState(uid);
  if (!tokenState.available) {
    return 'No tienes tokens disponibles para iniciar una nueva consulta.';
  }
  const rateLimit = await checkRateLimit(uid);
  if (!rateLimit.allowed) {
    return conAvisoDeUrgencias(
      `Has superado el límite de 20 mensajes por hora. Por favor, espera ${rateLimit.remainingWait} minutos.`
    );
  }
  return null;
}

/**
 * Envía un mensaje del paciente a Hilda.
 *
 * El servidor guarda la pregunta, arma el historial desde Firestore, llama a la IA
 * y guarda la respuesta. El teléfono solo manda el texto nuevo y las fotos que ya
 * subió a la carpeta de esta conversación.
 */
export async function enviarMensajeConsulta(
  idToken: string,
  convId: string,
  entrada: { texto: string; imageUrls?: string[] },
  paciente: PatientStructuredContext
): Promise<Resultado> {
  // Cada tramo se cronometra para saber cuánto de la espera es Firestore y
  // cuánto es el modelo. Ver `registrarTiempos`.
  const tInicio = Date.now();
  let tSesion = tInicio;
  let tParalelo = tInicio;
  let tHistorial = tInicio;

  try {
    const sesion = await sesionConConversacion(idToken, convId);
    if ('error' in sesion) return fallo(sesion.error);
    const { uid } = sesion;

    const texto = typeof entrada?.texto === 'string' ? entrada.texto : '';
    const imageUrls = Array.isArray(entrada?.imageUrls) ? entrada.imageUrls.filter((u) => typeof u === 'string') : [];

    if (!texto.trim() && !imageUrls.length) return fallo('No se recibió ningún mensaje.');
    if (texto.length > MAX_CARACTERES_MENSAJE) return fallo(MENSAJE_MUY_LARGO);
    if (imageUrls.length > MAX_IMAGENES_POR_MENSAJE) return fallo(IMAGEN_NO_VALIDA);
    for (const url of imageUrls) {
      const ruta = rutaDeFotoDeLaConsulta(url, uid, convId);
      if (!ruta || !(await fotoValida(ruta))) return fallo(IMAGEN_NO_VALIDA);
    }
    tSesion = Date.now();

    // Guardar la pregunta y comprobar los permisos no dependen entre sí, y
    // antes iban en fila. Medido el 6-nov-2026: 826 ms y 1.052 ms de los
    // 2.540 ms que se gastaban antes de que el modelo viera una sola palabra.
    // Ahora corren a la vez y el turno paga solo el más lento de los dos.
    //
    // El orden de las DECISIONES no cambia, y es la razón de usar
    // `allSettled`: primero manda el fallo de guardado y después el bloqueo,
    // igual que cuando iban en fila. Y la pregunta queda guardada aunque luego
    // la frene el límite por hora, que era el comportamiento buscado.
    //
    // Dos cosas que NO se paralelizan, a propósito:
    //  - las dos lecturas de dentro de `puedeConsultar`: el límite por hora es
    //    una transacción que ESCRIBE, así que lanzarla a la vez que la de
    //    tokens le gastaría un turno del cupo a quien no tiene con qué
    //    consultar;
    //  - el historial: se lee de Firestore y tiene que incluir la pregunta que
    //    acaba de guardarse. Adelantarlo dejaría al modelo sin el último
    //    mensaje del paciente, que es justo el que importa.
    const [guardado, permisos] = await Promise.allSettled([
      persistConversationMessage(uid, convId, { role: 'user', content: texto, imageUrls }),
      puedeConsultar(uid),
    ]);

    if (guardado.status === 'rejected') {
      console.error('[Dra. Hilda] Error guardando el mensaje del paciente:', guardado.reason);
      return fallo(conAvisoDeUrgencias('Ocurrió un error inesperado. Intenta de nuevo.'));
    }
    // Un fallo inesperado de los permisos sigue cayendo en el catch de afuera.
    if (permisos.status === 'rejected') throw permisos.reason;
    if (permisos.value) return fallo(permisos.value);
    tParalelo = Date.now();

    // Las dos lecturas son de Firestore y no dependen entre sí, así que el
    // turno paga solo la más lenta. La ficha no puede añadir espera: son
    // antecedentes que ya estaban guardados, no un cálculo.
    // Tres lecturas de Firestore que no dependen entre sí: el turno paga la más
    // lenta. Los hallazgos del episodio son lo que el grafo ya sabía de ESTA
    // consulta, y sin ellos miraría cada turno como si la persona acabara de
    // llegar.
    const [contenidos, ficha, hallazgosPrevios] = await Promise.all([
      historialParaLaIA(uid, convId),
      fichaDeLaConsulta(uid, convId),
      leerHallazgosDelEpisodio(uid, convId),
    ]);
    tHistorial = Date.now();

    // El extractor corre A LA VEZ que la respuesta, no después: así el turno
    // paga la más lenta de las dos llamadas y no la suma. Es la diferencia
    // entre que enriquecer la ficha sea gratis en espera o que duplique el
    // tiempo que el paciente mira la pantalla.
    //
    // La ficha que se usa HOY es la que se leyó arriba; lo que se extraiga
    // entra para la próxima consulta. Un turno de retraso es el precio de no
    // hacer esperar a nadie, y es un precio que vale la pena.
    //
    // Sin ficha no se extrae: no habría dónde guardar lo aprendido, y una
    // llamada al modelo cuyo resultado no se puede escribir es dinero tirado.
    const [resultado, extraccion] = await Promise.all([
      preguntarALaIA(paciente, contenidos, ficha),
      ficha ? extraerHallazgos(loQueDijoLaPersona(contenidos), fechaDeHoy()) : null,
    ]);
    const tIA = Date.now();
    registrarTiempos(
      'del turno',
      [
        ['sesión', tSesion - tInicio],
        // Un solo tramo porque ahora corren a la vez: el número es el del más
        // lento de los dos, no la suma.
        ['guardar+permisos', tParalelo - tSesion],
        ['historial', tHistorial - tParalelo],
        ['IA', tIA - tHistorial],
        ['total', tIA - tInicio],
      ],
      `${contenidos.length} mensajes de contexto, respuesta de ${resultado.ok ? resultado.text.length : 0} caracteres`
    );
    if (!resultado.ok) return fallo(errorDeLaIA(resultado));

    try {
      await persistConversationMessage(uid, convId, { role: 'assistant', content: resultado.text });
    } catch (error) {
      // El paciente igual recibe la respuesta; queda registro para revisar.
      console.error('[Dra. Hilda] Error guardando la respuesta de la IA:', error);
    }

    // El grafo corre AQUÍ, en cada turno, y no cuesta nada: es código puro, sin
    // modelo y sin red, así que no añade un milisegundo a lo que el paciente
    // espera. Corre después de la respuesta porque hoy observa y escala; no
    // decide lo que Hilda dice, que es conducta clínica y la aprueba Alexander
    // árbol por árbol.
    const grafo = correrElGrafo({
      ficha,
      previos: hallazgosPrevios,
      nuevos: extraccion?.aceptados ?? [],
      hoy: fechaDeHoy(),
    });
    console.log(resumenParaLog(grafo));

    // Las dos escrituras no dependen entre sí: la ficha se queda con los
    // antecedentes y el episodio con lo de hoy, que es justo lo que la ficha
    // descarta.
    await Promise.all([
      guardarLoAprendido(uid, ficha, extraccion),
      guardarElEpisodio(uid, convId, hallazgosPrevios, grafo),
    ]);

    // La bandera solo viaja cuando se disparó algo. Ausente es "no se disparó
    // ninguna alarma", no "no hay peligro", y así un turno normal devuelve
    // exactamente lo que devolvía antes.
    return grafo.alarma
      ? { success: true, message: resultado.text, alarmaDelGrafo: true }
      : { success: true, message: resultado.text };
  } catch (error: any) {
    console.error('[Dra. Hilda] Error inesperado:', error);
    return fallo(conAvisoDeUrgencias('Ocurrió un error inesperado. Intenta de nuevo.'));
  }
}

/**
 * Saludo inicial de Hilda en una conversación vacía. La instrucción se
 * arma en el servidor; el teléfono solo dice si es la primera vez y la franja del día.
 */
export async function saludarEnConsulta(
  idToken: string,
  convId: string,
  datos: { nombre?: string; primeraVez: boolean; periodo: string },
  paciente: PatientStructuredContext
): Promise<Resultado> {
  try {
    const sesion = await sesionConConversacion(idToken, convId);
    if ('error' in sesion) return fallo(sesion.error);
    const { uid } = sesion;

    const yaTieneMensajes = await conversacionRef(uid, convId).collection('mensajes').limit(1).get();
    if (!yaTieneMensajes.empty) return fallo('La conversación ya tiene mensajes.');

    const bloqueo = await puedeConsultar(uid);
    if (bloqueo) return fallo(bloqueo);

    const nombre = String(datos?.nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const periodo = ['Buenos días', 'Buenas tardes', 'Buenas noches'].includes(datos?.periodo) ? datos.periodo : 'Hola';

    const instruccion = datos?.primeraVez
      ? nombre
        ? `Saluda al usuario llamado ${nombre} por primera vez. Preséntate y explícale qué es la teleorientación.`
        : 'Saluda al usuario por primera vez. Preséntate y explícale qué es la teleorientación.'
      : nombre
        ? `¡${periodo}, ${nombre}! Saluda brevemente y pregúntale en qué puedes orientarle hoy.`
        : `¡${periodo}! Saluda brevemente y pregúntale en qué puedes orientarle hoy.`;

    // Sin razonamiento: es un saludo, no hay nada que decidir. Ver
    // `THINKING_BUDGET_SALUDO`.
    const resultado = await preguntarALaIA(
      paciente,
      [{ role: 'user', parts: [{ text: instruccion }] }],
      await fichaDeLaConsulta(uid, convId),
      THINKING_BUDGET_SALUDO
    );
    if (!resultado.ok) return fallo(errorDeLaIA(resultado));

    await persistConversationMessage(uid, convId, { role: 'assistant', content: resultado.text });
    return { success: true, message: resultado.text };
  } catch (error: any) {
    console.error('[Dra. Hilda] Error en el saludo:', error);
    return fallo(conAvisoDeUrgencias('Ocurrió un error inesperado. Intenta de nuevo.'));
  }
}
