'use client';

/**
 * TeleorientacionChatPage
 * ──────────────────────────────────────────────────────────────────────────
 * Orientación Médica Familiar Empática — powered by Gemini 1.5 Pro
 *
 * Flujo:
 * 1. Selector de integrante familiar (oncSnapshot en Firestore).
 * 2. Al seleccionar, carga contexto médico completo:
 *    - Datos base del perfil (alergias, medicamentos, peso…)
 *    - Historial clínico completo (subcolección historial/registro)
 *    - Últimos laboratorios procesados por IDP (idpStatus === 'done')
 * 3. El chat inyecta un bloque [CONTEXTO DEL PACIENTE] oculto en cada turno.
 * 4. El modelo (Gemini 1.5 Pro) responde con orientación personalizada.
 * 5. Cambiar de integrante limpia el chat y actualiza el contexto instntáneamente.
 */

import {
  useState, useEffect, useRef, useContext, useCallback,
} from 'react';
import {
  collection, onSnapshot, doc, getDoc, getDocs, query, where,
  addDoc, setDoc, serverTimestamp, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import type { FamilyProfile, FamilyProfileMedical } from '@/lib/types';
import {
  COLECCION_TUTOR, SUBCOLECCION_INTEGRANTES,
  SUBCOLECCION_HISTORIAL, DOC_HISTORIAL,
} from '@/lib/constants';
import {
  sendOrientacionMessage,
  type TeleorientacionMessage,
  type TeleorientacionPatientContext,
  type LabResult,
} from '@/app/actions/teleorientacion';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MessageCircleHeart, Send, ArrowLeft, User,
  Loader2, Sparkles, FlaskConical, AlertCircle,
  ShieldAlert, RotateCcw,
} from 'lucide-react';

// ── Constante ruta Firestore ─────────────────────────────────────────────────
const SUB_ORIENTACIONES = 'orientaciones';
const SUB_MENSAJES      = 'mensajes';

// ── Tipos locales ────────────────────────────────────────────────────────────

interface ChatEntry {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

type View = 'select-member' | 'loading-context' | 'chat';

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

function sexLabel(sex?: string): string {
  return sex === 'male' ? 'Masculino' : sex === 'female' ? 'Femenino' : 'Otro';
}

function sexBadgeColor(sex?: string): string {
  return sex === 'male'
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : sex === 'female'
    ? 'bg-pink-100 text-pink-700 border-pink-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';
}

// Carga los últimos resultados IDP del integrante
async function fetchLabResults(
  userId: string,
  profileId: string,
  isTitular: boolean,
): Promise<LabResult[]> {
  try {
    const collPath = isTitular
      ? collection(db, COLECCION_TUTOR, userId, 'documents')
      : collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, profileId, 'Documentos');

    const q = query(collPath, where('idpStatus', '==', 'done'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data().idpExtracted as LabResult)
      .filter(Boolean);
  } catch (e) {
    console.warn('No se pudieron cargar resultados IDP:', e);
    return [];
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function TeleorientacionChatPage() {
  const context = useContext(UserContext);
  const userId  = context?.user?.uid;

  const [view, setView]                 = useState<View>('select-member');
  const [profiles, setProfiles]         = useState<FamilyProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<FamilyProfile | null>(null);
  const [patientContext, setPatientContext]    = useState<TeleorientacionPatientContext | null>(null);
  const [messages, setMessages]         = useState<ChatEntry[]>([]);
  const [history, setHistory]           = useState<TeleorientacionMessage[]>([]);
  const [inputValue, setInputValue]     = useState('');
  const [sending, setSending]           = useState(false);
  const [aiError, setAiError]           = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  // sessionIdRef evita problemas de stale closure en las funciones de guardado
  const sessionIdRef  = useRef<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);

  // ── Helper: guardar un mensaje en Firestore ───────────────────────────────
  const saveMsg = async (
    profile: FamilyProfile,
    role: 'user' | 'model',
    content: string,
  ) => {
    if (!userId || !sessionIdRef.current) return;
    try {
      const msgsRef = collection(
        db,
        COLECCION_TUTOR, userId,
        SUBCOLECCION_INTEGRANTES, profile.id,
        SUB_ORIENTACIONES, sessionIdRef.current,
        SUB_MENSAJES,
      );
      await addDoc(msgsRef, { role, content, timestamp: serverTimestamp() });
    } catch (e) {
      console.warn('No se pudo guardar mensaje en Firestore:', e);
    }
  };

  // ── Cargar perfiles ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const ref = collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES);
    const unsub = onSnapshot(ref, (snap) => {
      const data: FamilyProfile[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FamilyProfile, 'id'>),
      }));
      data.sort((a, b) => (b.esTitular ? 1 : 0) - (a.esTitular ? 1 : 0));
      setProfiles(data);
      setLoadingProfiles(false);
    }, () => setLoadingProfiles(false));
    return () => unsub();
  }, [userId]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Seleccionar integrante ────────────────────────────────────────────────
  const handleSelectProfile = useCallback(async (profile: FamilyProfile, forceNew = false) => {
    if (!userId) return;
    setMessages([]);
    setHistory([]);
    setInputValue('');
    setAiError(null);
    setSelectedProfile(profile);
    setView('loading-context');
    setLoadingSession(true);

    // 1. Historial médico (subcolección historial/registro)
    let medical: FamilyProfileMedical = {};
    try {
      const histRef = doc(
        db, COLECCION_TUTOR, userId,
        SUBCOLECCION_INTEGRANTES, profile.id,
        SUBCOLECCION_HISTORIAL, DOC_HISTORIAL,
      );
      const snap = await getDoc(histRef);
      if (snap.exists()) medical = snap.data() as FamilyProfileMedical;
    } catch (e) {
      console.warn('No se pudo cargar historial médico:', e);
    }

    // 2. Últimos resultados IDP
    const labResults = await fetchLabResults(userId, profile.id, profile.esTitular ?? false);

    const age = profile.age ?? (profile.dateOfBirth ? calcAge(profile.dateOfBirth) : undefined);

    const ctx: TeleorientacionPatientContext = {
      fullName: `${profile.firstName} ${profile.lastName}`,
      age,
      sex: profile.sex,
      weight: profile.weight,
      allergies: profile.allergies,
      medications: profile.medications,
      pathologicalHistory: medical.pathologicalHistory,
      surgicalHistory: medical.surgicalHistory,
      gynecologicalHistory: medical.gynecologicalHistory,
      lastLabResults: labResults,
    };
    setPatientContext(ctx);

    // 3. Intentar recuperar sesión del día de hoy (si no se fuerza nueva)
    if (!forceNew) {
      try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const orientRef = collection(
          db, COLECCION_TUTOR, userId,
          SUBCOLECCION_INTEGRANTES, profile.id,
          SUB_ORIENTACIONES,
        );
        const q = query(
          orientRef,
          where('createdAt', '>=', Timestamp.fromDate(startOfToday)),
          orderBy('createdAt', 'desc'),
          limit(1),
        );
        const sesionSnap = await getDocs(q);
        if (!sesionSnap.empty) {
          const sesionDoc = sesionSnap.docs[0];
          sessionIdRef.current = sesionDoc.id;

          // Cargar mensajes guardados
          const msgsSnap = await getDocs(
            query(
              collection(sesionDoc.ref, SUB_MENSAJES),
              orderBy('timestamp', 'asc'),
            ),
          );
          if (!msgsSnap.empty) {
            const recovered: ChatEntry[] = msgsSnap.docs.map((d) => {
              const data = d.data();
              const ts = data.timestamp instanceof Timestamp
                ? data.timestamp.toDate()
                : new Date();
              return { role: data.role as 'user' | 'model', content: data.content, timestamp: ts };
            });
            const recoveredHistory = recovered.map(m => ({ role: m.role, content: m.content }));
            setMessages(recovered);
            setHistory(recoveredHistory);
            setLoadingSession(false);
            setView('chat');
            setTimeout(() => inputRef.current?.focus(), 100);
            return; // sesión recuperada — no generar bienvenida nueva
          }
        }
      } catch (e) {
        console.warn('No se pudo recuperar sesión anterior:', e);
      }
    }

    // 4. Crear nueva sesión en Firestore
    const newSessionId = `sess_${Date.now()}`;
    sessionIdRef.current = newSessionId;
    try {
      await setDoc(
        doc(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, profile.id, SUB_ORIENTACIONES, newSessionId),
        {
          tutorId: userId,
          pacienteId: profile.id,
          pacienteName: `${profile.firstName} ${profile.lastName}`,
          createdAt: serverTimestamp(),
        },
      );
    } catch (e) {
      console.warn('No se pudo crear sesión en Firestore:', e);
    }

    // 5. Mensaje de bienvenida empático generado por IA
    const welcomeResult = await sendOrientacionMessage({
      patientContext: ctx,
      userMessage: `Hola, soy el familiar responsable de ${profile.firstName}. Tengo una consulta sobre su salud.`,
      conversationHistory: [],
    });

    const welcomeText = welcomeResult.success
      ? welcomeResult.response
      : `Hola, estoy aquí para orientarte sobre la salud de ${profile.firstName} 💙. Cuéntame, ¿en qué puedo ayudarte hoy?`;

    // Guardar bienvenida en Firestore
    const welcomeEntry: ChatEntry = { role: 'model', content: welcomeText, timestamp: new Date() };
    setMessages([welcomeEntry]);
    setHistory([{ role: 'model', content: welcomeText }]);
    await saveMsg(profile, 'model', welcomeText);

    setLoadingSession(false);
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || !patientContext || sending) return;

    setInputValue('');
    setAiError(null);
    setSending(true);

    const userEntry: ChatEntry = { role: 'user', content: text, timestamp: new Date() };
    const newHistory: TeleorientacionMessage[] = [...history, { role: 'user', content: text }];
    setMessages((prev) => [...prev, userEntry]);

    // Placeholder "pensando"
    setMessages((prev) => [...prev, { role: 'model', content: '__thinking__', timestamp: new Date() }]);

    // Guardar mensaje del usuario en Firestore
    if (selectedProfile) await saveMsg(selectedProfile, 'user', text);

    try {
      const result = await sendOrientacionMessage({
        patientContext,
        userMessage: text,
        conversationHistory: history,
      });

      const aiText = result.success
        ? result.response
        : '⚠️ No pude conectar con el asistente en este momento. Por favor, intenta de nuevo.';

      if (!result.success) setAiError(result.error ?? null);

      const aiEntry: ChatEntry = { role: 'model', content: aiText, timestamp: new Date() };
      setMessages((prev) => [...prev.slice(0, -1), aiEntry]);
      setHistory([...newHistory, { role: 'model', content: aiText }]);

      // Guardar respuesta de IA en Firestore
      if (selectedProfile) await saveMsg(selectedProfile, 'model', aiText);
    } catch (e: any) {
      setMessages((prev) => prev.slice(0, -1));
      setAiError(e?.message ?? 'Error inesperado');
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleReset = () => {
    setView('select-member');
    setSelectedProfile(null);
    setPatientContext(null);
    setMessages([]);
    setHistory([]);
    setInputValue('');
    setAiError(null);
    sessionIdRef.current = null;
  };

  // Nueva sesión para el mismo integrante
  const handleNewSession = () => {
    if (selectedProfile) {
      handleSelectProfile(selectedProfile, true);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader />

      <main className="flex-1 overflow-hidden flex flex-col p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl w-full flex flex-col flex-1 min-h-0">

          {/* ── STEP 1: Selección de integrante ──────────────────────────── */}
          {view === 'select-member' && (
            <div className="space-y-6">
              {/* Encabezado */}
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-xl">
                  <MessageCircleHeart className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-primary font-headline">
                    Teleorientación Médica
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    ¿Sobre quién necesitas orientación hoy?
                  </p>
                </div>
              </div>

              {/* Aviso informativo */}
              <Alert className="border-emerald-200 bg-emerald-50">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-sm text-foreground/80">
                  Nuestro Asistente de Orientación Médica conoce el historial clínico completo
                  de cada integrante de tu familia y te brindará orientación{' '}
                  <strong>personalizada y empática</strong>. No reemplaza la consulta médica presencial.
                </AlertDescription>
              </Alert>

              {/* Grid de perfiles */}
              {loadingProfiles ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <User className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No hay integrantes registrados</p>
                  <p className="text-sm mt-1">Agrega tu perfil familiar en la sección "Mi Salud".</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profiles.map((profile) => {
                    const age = profile.age ?? (profile.dateOfBirth ? calcAge(profile.dateOfBirth) : null);
                    return (
                      <button
                        key={profile.id}
                        onClick={() => handleSelectProfile(profile)}
                        className="flex items-center gap-4 p-4 text-left rounded-xl border bg-card hover:bg-accent/5 hover:border-emerald-300 hover:shadow-md transition-all duration-200 group"
                      >
                        <Avatar className="h-12 w-12 border-2 border-emerald-100 group-hover:border-emerald-300 transition-colors">
                          <AvatarFallback className="bg-emerald-50 text-emerald-700 font-bold text-sm">
                            {initials(profile.firstName, profile.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {profile.firstName} {profile.lastName}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {age !== null && (
                              <span className="text-xs text-muted-foreground">{age} años</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sexBadgeColor(profile.sex)}`}>
                              {sexLabel(profile.sex)}
                            </span>
                            {profile.esTitular && (
                              <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50">
                                Titular
                              </Badge>
                            )}
                          </div>
                          {profile.allergies?.length ? (
                            <p className="text-xs text-amber-600 mt-1 truncate">
                              ⚠️ Alergia: {profile.allergies.slice(0, 2).join(', ')}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Cargando contexto ────────────────────────────────── */}
          {view === 'loading-context' && (
            <div className="flex flex-col items-center justify-center flex-1 gap-5">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <MessageCircleHeart className="h-8 w-8 text-emerald-600" />
                </div>
                <Loader2 className="h-20 w-20 absolute -top-2 -left-2 animate-spin text-emerald-400 opacity-60" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-foreground">Preparando orientación personalizada…</p>
                <p className="text-sm text-muted-foreground">
                  Cargando historial clínico, laboratorios y sesiones previas de{' '}
                  <span className="font-medium text-emerald-600">{selectedProfile?.firstName}</span>
                </p>
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground mt-2">
                {['Historial clínico', 'Alergias y medicamentos', 'Laboratorios IDP', 'Sesión anterior'].map((item) => (
                  <span key={item} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full">
                    <Loader2 className="h-3 w-3 animate-spin" /> {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 3: Chat ─────────────────────────────────────────────── */}
          {view === 'chat' && selectedProfile && patientContext && (
            <div className="flex flex-col flex-1 min-h-0 gap-3">

              {/* Cabecera contextual obligatoria */}
              <div className="flex items-center gap-3 bg-card rounded-xl border border-emerald-200 px-4 py-3 shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={handleReset}
                  title="Cambiar integrante"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>

                <Avatar className="h-10 w-10 border-2 border-emerald-200 shrink-0">
                  <AvatarFallback className="bg-emerald-50 text-emerald-700 font-bold text-sm">
                    {initials(selectedProfile.firstName, selectedProfile.lastName)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">
                    Orientando sobre
                  </p>
                  <p className="font-bold text-foreground truncate">
                    {patientContext.fullName}
                    <span className="font-normal text-muted-foreground text-sm ml-2">
                      {patientContext.age !== undefined && `${patientContext.age} años`}
                      {patientContext.age !== undefined && patientContext.sex && ' · '}
                      {patientContext.sex && `Sexo: ${sexLabel(patientContext.sex)}`}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {patientContext.lastLabResults?.length ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs gap-1 hidden sm:flex">
                      <FlaskConical className="h-3 w-3" />
                      {patientContext.lastLabResults.length} lab{patientContext.lastLabResults.length > 1 ? 's' : ''}
                    </Badge>
                  ) : null}
                  {patientContext.allergies?.length ? (
                    <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-xs hidden sm:flex">
                      ⚠️ Alergias
                    </Badge>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNewSession}
                    disabled={sending || loadingSession}
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground px-2 hidden sm:flex"
                    title="Iniciar nueva sesión de orientación"
                  >
                    <RotateCcw className="h-3 w-3" /> Nueva sesión
                  </Button>
                </div>
              </div>

              {/* ── Banner legal fijo (Escudo Legal) ─────────────────── */}
              <div className="flex gap-2.5 items-start rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 shrink-0">
                <ShieldAlert className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed text-red-800">
                  <strong>Atención:</strong> Este es un servicio de orientación asistido por Inteligencia Artificial.
                  <strong> NO emite diagnósticos ni reemplaza una consulta médica formal.</strong> Si usted o su
                  familiar presenta una emergencia vital (dolor en el pecho, dificultad para respirar, pérdida de
                  conocimiento), diríjase inmediatamente a urgencias o comuníquese con la línea{' '}
                  <strong>123</strong>.
                </p>
              </div>

              {/* Área de mensajes */}
              <ScrollArea className="flex-1 min-h-0 rounded-xl border bg-muted/20" ref={scrollAreaRef}>
                <div className="p-4 space-y-4">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {/* Avatar */}
                      {msg.role === 'model' ? (
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-1">
                          <MessageCircleHeart className="h-4 w-4 text-emerald-600" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                      )}

                      {/* Burbuja */}
                      <div className={`max-w-[78%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-tr-sm'
                              : 'bg-card text-foreground border border-border rounded-tl-sm'
                          }`}
                        >
                          {msg.content === '__thinking__' ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span className="italic text-xs">El asistente está pensando…</span>
                            </span>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground px-1">
                          {msg.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Error IA */}
              {aiError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{aiError}</AlertDescription>
                </Alert>
              )}

              {/* Input */}
              <div className="flex gap-2 items-center bg-card rounded-xl border px-3 py-2 shadow-sm focus-within:border-emerald-300 focus-within:ring-1 focus-within:ring-emerald-200 transition-all">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Escribe tu consulta sobre ${selectedProfile.firstName}…`}
                  disabled={sending}
                  className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm flex-1"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || sending}
                  className="h-8 w-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  {sending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                </Button>
              </div>

              <p className="text-center text-[10px] text-muted-foreground">
                Este asistente <strong>no diagnóstica ni receta</strong>. Para evaluación clínica, agenda una teleconsulta con el Dr. García.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
