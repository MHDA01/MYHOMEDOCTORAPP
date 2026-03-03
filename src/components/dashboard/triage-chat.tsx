'use client';

/**
 * TriageChatPage
 * ──────────────────────────────────────────────────────────────────────────
 * Triaje Inteligente — Dr. García powered by Gemini 2.0 Flash (via Genkit)
 *
 * Flujo:
 * 1. Se muestran las tarjetas de los integrantes del grupo familiar.
 * 2. El usuario selecciona a quién quiere consultar.
 * 3. Se carga su contexto médico (alergias, historial, peso…).
 * 4. Se inicia el chat con el Dr. García que ya conoce al paciente.
 * 5. Cada turno llama a la Server Action `sendTriageMessage` (Gemini API).
 * 6. Las sesiones quedan guardadas en Firestore `app_triage_sessions`.
 */

import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import type { FamilyProfile, FamilyProfileMedical } from '@/lib/types';
import {
  sendTriageMessage,
  type TriageMessage,
  type TriagePatientContext,
} from '@/app/actions/triage';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Stethoscope, Send, ArrowLeft, User, AlertCircle,
  Loader2, HeartPulse, Pill, ShieldAlert, Sparkles,
} from 'lucide-react';

// ── Constantes Firestore ─────────────────────────────────────────────────────
const COLECCION_TUTOR = 'Cuentas_Tutor';
const SUBCOLECCION_INTEGRANTES = 'Integrantes';
const SUBCOLECCION_HISTORIAL = 'historial';
const DOC_HISTORIAL = 'registro';
const COLECCION_SESIONES = 'app_triage_sessions';

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

function sexLabel(sex: string): string {
  return sex === 'male' ? 'Masculino' : sex === 'female' ? 'Femenino' : 'Otro';
}

// ── Componente ───────────────────────────────────────────────────────────────
export function TriageChatPage() {
  const context = useContext(UserContext);
  const userId = context?.user?.uid;

  // ── Estados de step ──────────────────────────────────────────────────────
  const [view, setView] = useState<View>('select-member');
  const [profiles, setProfiles] = useState<FamilyProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // ── Estado del paciente seleccionado ─────────────────────────────────────
  const [selectedProfile, setSelectedProfile] = useState<FamilyProfile | null>(null);
  const [patientContext, setPatientContext] = useState<TriagePatientContext | null>(null);

  // ── Estado del chat ───────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [history, setHistory] = useState<TriageMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Cargar perfiles del grupo familiar ───────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const ref = collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES);
    const unsub = onSnapshot(ref, (snap) => {
      const data: FamilyProfile[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FamilyProfile, 'id'>),
      }));
      // Titular primero
      data.sort((a, b) => (b.esTitular ? 1 : 0) - (a.esTitular ? 1 : 0));
      setProfiles(data);
      setLoadingProfiles(false);
    }, () => setLoadingProfiles(false));
    return () => unsub();
  }, [userId]);

  // ── Auto-scroll al último mensaje ────────────────────────────────────────
  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Seleccionar integrante ────────────────────────────────────────────────
  const handleSelectProfile = useCallback(async (profile: FamilyProfile) => {
    if (!userId) return;
    setSelectedProfile(profile);
    setView('loading-context');

    // Cargar historial médico pesado (subcolección)
    let medical: FamilyProfileMedical = {};
    try {
      const histRef = doc(
        db, COLECCION_TUTOR, userId,
        SUBCOLECCION_INTEGRANTES, profile.id,
        SUBCOLECCION_HISTORIAL, DOC_HISTORIAL
      );
      const snap = await getDoc(histRef);
      if (snap.exists()) medical = snap.data() as FamilyProfileMedical;
    } catch (e) {
      console.warn('No se pudo cargar historial médico para triaje:', e);
    }

    const ctx: TriagePatientContext = {
      fullName: `${profile.firstName} ${profile.lastName}`,
      age: profile.age ?? (profile.dateOfBirth ? calcAge(profile.dateOfBirth) : undefined),
      sex: profile.sex,
      weight: profile.weight,
      allergies: profile.allergies,
      medications: profile.medications,
      pathologicalHistory: medical.pathologicalHistory,
      surgicalHistory: medical.surgicalHistory,
      gynecologicalHistory: medical.gynecologicalHistory,
    };
    setPatientContext(ctx);

    // Mensaje de bienvenida del Dr. García (generado por Gemini con el contexto)
    const welcomeResult = await sendTriageMessage({
      patientContext: ctx,
      userMessage: 'Hola, ya estoy listo para comenzar la consulta.',
      conversationHistory: [],
    });

    const welcomeText = welcomeResult.success
      ? welcomeResult.response
      : `Hola ${ctx.fullName}, soy el Dr. García. Cuéntame, ¿qué síntomas o molestias presentas hoy?`;

    const welcomeEntry: ChatEntry = {
      role: 'model',
      content: welcomeText,
      timestamp: new Date(),
    };
    setMessages([welcomeEntry]);
    setHistory([{ role: 'model', content: welcomeText }]);
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [userId]);

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || !patientContext || sending) return;

    setInputValue('');
    setAiError(null);
    setSending(true);

    // 1 — Añadir mensaje del usuario inmediatamente
    const userEntry: ChatEntry = { role: 'user', content: text, timestamp: new Date() };
    const newHistory: TriageMessage[] = [...history, { role: 'user', content: text }];
    setMessages((prev) => [...prev, userEntry]);

    // 2 — Placeholder "pensando..."
    const thinkingEntry: ChatEntry = { role: 'model', content: '...', timestamp: new Date() };
    setMessages((prev) => [...prev, thinkingEntry]);

    try {
      // 3 — Llamar Server Action (Gemini)
      const result = await sendTriageMessage({
        patientContext,
        userMessage: text,
        conversationHistory: history,
      });

      const aiText = result.success
        ? result.response
        : '⚠️ No pude conectar con la IA en este momento. Por favor intenta de nuevo.';

      if (!result.success) setAiError(result.error ?? null);

      const aiEntry: ChatEntry = { role: 'model', content: aiText, timestamp: new Date() };

      // 4 — Reemplazar placeholder con respuesta real
      setMessages((prev) => {
        const withoutThinking = prev.slice(0, -1);
        return [...withoutThinking, aiEntry];
      });

      const updatedHistory: TriageMessage[] = [...newHistory, { role: 'model', content: aiText }];
      setHistory(updatedHistory);

      // 5 — Guardar sesión en Firestore
      if (userId && selectedProfile) {
        addDoc(collection(db, COLECCION_SESIONES), {
          userId,
          profileId: selectedProfile.id,
          profileName: `${selectedProfile.firstName} ${selectedProfile.lastName}`,
          userMessage: text,
          aiResponse: aiText,
          timestamp: serverTimestamp(),
        }).catch((e) => console.warn('No se pudo guardar sesión de triaje:', e));
      }
    } catch (e: any) {
      setMessages((prev) => prev.slice(0, -1));
      setAiError(e?.message ?? 'Error inesperado');
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Reiniciar consulta ────────────────────────────────────────────────────
  const handleReset = () => {
    setView('select-member');
    setSelectedProfile(null);
    setPatientContext(null);
    setMessages([]);
    setHistory([]);
    setInputValue('');
    setAiError(null);
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
                <div className="p-2 bg-accent/10 rounded-xl">
                  <Stethoscope className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-primary font-headline">
                    Triaje Inteligente
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    ¿Para quién es la consulta de hoy?
                  </p>
                </div>
              </div>

              {/* Aviso informativo */}
              <Alert className="border-accent/30 bg-accent/5">
                <Sparkles className="h-4 w-4 text-accent" />
                <AlertDescription className="text-sm text-foreground/80">
                  El <strong>Dr. García</strong> (IA médica) evaluará los síntomas con el historial clínico del
                  integrante seleccionado. Recuerda que este servicio <strong>no reemplaza</strong> la
                  consulta médica presencial.
                </AlertDescription>
              </Alert>

              {/* Grid de perfiles */}
              {loadingProfiles ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-xl" />
                  ))}
                </div>
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <User className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">
                    No hay perfiles en tu grupo familiar.<br />
                    Añade integrantes desde <strong>Mi Salud y la de mi Familia</strong>.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profiles.map((profile) => {
                    const age = profile.age ?? (profile.dateOfBirth ? calcAge(profile.dateOfBirth) : null);
                    return (
                      <button
                        key={profile.id}
                        onClick={() => handleSelectProfile(profile)}
                        className="group flex items-center gap-4 p-4 rounded-xl border bg-card hover:border-accent hover:shadow-md transition-all duration-200 text-left"
                      >
                        <Avatar className="h-12 w-12 shrink-0 bg-primary/10 text-primary">
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {initials(profile.firstName, profile.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {profile.firstName} {profile.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {profile.relationship}{age ? ` · ${age} años` : ''} · {sexLabel(profile.sex)}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {profile.esTitular && (
                              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary px-1.5 py-0">
                                Titular
                              </Badge>
                            )}
                            {profile.allergies?.length ? (
                              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 px-1.5 py-0 flex items-center gap-0.5">
                                <AlertCircle className="h-2.5 w-2.5" />
                                {profile.allergies.length} alergia{profile.allergies.length > 1 ? 's' : ''}
                              </Badge>
                            ) : null}
                            {profile.hasHistory && (
                              <Badge variant="outline" className="text-[10px] border-accent/40 text-accent px-1.5 py-0 flex items-center gap-0.5">
                                <ShieldAlert className="h-2.5 w-2.5" />
                                Antecedentes
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Stethoscope className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Cargando contexto médico ─────────────────────────── */}
          {view === 'loading-context' && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
                  <Stethoscope className="h-8 w-8 text-accent" />
                </div>
                <Loader2 className="h-5 w-5 text-accent animate-spin absolute -bottom-1 -right-1" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">
                  Preparando la consulta para {selectedProfile?.firstName}…
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  El Dr. García está revisando el historial médico del paciente.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 3: Chat ──────────────────────────────────────────────── */}
          {view === 'chat' && selectedProfile && patientContext && (
            <div className="flex flex-col flex-1 min-h-0 gap-3">

              {/* Barra de paciente */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-card shrink-0">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                      {initials(selectedProfile.firstName, selectedProfile.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-sm text-foreground leading-none">
                      {patientContext.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {patientContext.age ? `${patientContext.age} años` : ''}
                      {patientContext.weight ? ` · ${patientContext.weight} kg` : ''}
                      {patientContext.sex ? ` · ${sexLabel(patientContext.sex)}` : ''}
                    </p>
                  </div>
                </div>

                {/* Chips de contexto médico */}
                <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
                  {patientContext.allergies?.length ? (
                    <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 gap-0.5">
                      <AlertCircle className="h-2.5 w-2.5" />
                      {patientContext.allergies.join(', ')}
                    </Badge>
                  ) : null}
                  {patientContext.medications?.length ? (
                    <Badge variant="outline" className="text-[10px] border-accent/40 text-accent gap-0.5">
                      <Pill className="h-2.5 w-2.5" />
                      {patientContext.medications.slice(0, 2).join(', ')}
                      {patientContext.medications.length > 2 ? ` +${patientContext.medications.length - 2}` : ''}
                    </Badge>
                  ) : null}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Cambiar</span>
                </Button>
              </div>

              {/* Dr. García badge */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="p-1.5 bg-accent/10 rounded-lg">
                  <Stethoscope className="h-4 w-4 text-accent" />
                </div>
                <p className="text-sm font-semibold text-accent">Dr. García</p>
                <Badge className="bg-accent/10 text-accent border-0 text-[10px]">
                  <Sparkles className="h-2.5 w-2.5 mr-1" />
                  Gemini IA
                </Badge>
              </div>

              {/* Mensajes */}
              <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 pr-1">
                <div className="space-y-3 pb-2">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'model' && (
                        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                          <AvatarFallback className="bg-accent/10 text-accent text-xs">
                            <HeartPulse className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : msg.content === '...'
                              ? 'bg-muted text-muted-foreground rounded-bl-sm'
                              : 'bg-card border text-foreground rounded-bl-sm shadow-sm'
                        }`}
                      >
                        {msg.content === '...' ? (
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>El Dr. García está analizando…</span>
                          </span>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {initials(selectedProfile.firstName, selectedProfile.lastName)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Error de IA */}
              {aiError && (
                <Alert variant="destructive" className="shrink-0 py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{aiError}</AlertDescription>
                </Alert>
              )}

              {/* Input */}
              <div className="flex gap-2 shrink-0">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Describe los síntomas de ${patientContext.fullName}…`}
                  disabled={sending}
                  className="flex-1 bg-card"
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !inputValue.trim()}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground shrink-0"
                >
                  {sending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </div>

              {/* Descargo de responsabilidad */}
              <p className="text-[10px] text-muted-foreground text-center shrink-0 leading-relaxed">
                Este chat es orientativo y no reemplaza la consulta médica presencial.
                En caso de emergencia llama al <strong>131</strong> (SAMU) o dirígete a urgencias.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
