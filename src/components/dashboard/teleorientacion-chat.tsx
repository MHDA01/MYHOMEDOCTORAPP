// ============================================================
// components/dashboard/teleorientacion-chat.tsx
// Pagina completa de Teleorientacion con Dra. Hilda AI.
// Sidebar estilo ChatGPT con historial de conversaciones.
// ============================================================
'use client';

import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { UserContext } from '@/context/user-context';
import { auth, db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  doc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import {
  sendTeleorientacionMessage,
  persistSecureMessage,
  getSecureMessages,
  type TeleorientacionMessage,
  type PatientStructuredContext,
} from '@/app/actions/teleorientacion';
import { 
  saveFamilyMember,
  getSecureFamilyMembers 
} from '@/app/actions/family';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import type { ChatMessage, Conversation } from '@/types/chat';
import type { FamilyProfile } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import ChatInterface from '@/components/chat/ChatInterface';
import { 
  COLECCION_TUTOR, 
  SUBCOLECCION_INTEGRANTES, 
  SUBCOLECCION_CONVERSACIONES 
} from '@/lib/constants';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function calcAge(dob: string | undefined): number | undefined {
  if (!dob) return undefined;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 ? age : 0;
}

function sexLabel(sex: string | undefined): string {
  if (!sex) return '';
  const map: Record<string, string> = {
    male: 'Masculino',
    female: 'Femenino',
    other: 'Otro',
  };
  return map[sex] ?? sex;
}

function buildPatientContext(
  member: FamilyProfile,
  allergies?: string[]
): PatientStructuredContext {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    age: calcAge(member.dateOfBirth),
    sex: sexLabel(member.sex),
    allergies: [...(member.allergies ?? []), ...(allergies ?? [])].filter(Boolean),
    medications: member.medications ?? [],
  };
}

interface StoredChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrls?: string[];
  timestamp?: Timestamp;
}

function getConversationsCollectionRef(userUid: string) {
  return collection(db, COLECCION_TUTOR, userUid, SUBCOLECCION_CONVERSACIONES);
}

function getConvMessagesCollectionRef(userUid: string, convId: string) {
  return collection(db, COLECCION_TUTOR, userUid, SUBCOLECCION_CONVERSACIONES, convId, 'mensajes');
}

function getDayPeriodGreeting(): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatConvDate(date: Date): string {
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

type DateGroup = 'Hoy' | 'Ayer' | 'Últimos 7 días' | 'Últimos 30 días' | 'Anteriores';

function getDateGroup(date: Date): DateGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays <= 7) return 'Últimos 7 días';
  if (diffDays <= 30) return 'Últimos 30 días';
  return 'Anteriores';
}

function groupConversations(convs: Conversation[]): Record<DateGroup, Conversation[]> {
  const groups: Record<DateGroup, Conversation[]> = {
    'Hoy': [],
    'Ayer': [],
    'Últimos 7 días': [],
    'Últimos 30 días': [],
    'Anteriores': [],
  };
  for (const c of convs) {
    const group = getDateGroup(c.updatedAt);
    groups[group].push(c);
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/*  Componente: Sidebar de conversaciones estilo ChatGPT               */
/* ------------------------------------------------------------------ */

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
  onNewConversation: () => void;
  onDelete: (convId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  onDelete,
  isOpen,
  onClose,
}: ConversationSidebarProps) {
  const grouped = groupConversations(conversations);
  const groupOrder: DateGroup[] = ['Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 30 días', 'Anteriores'];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9990] bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[9991] w-72 transform border-r border-slate-200 bg-white transition-transform duration-200 lg:relative lg:z-0 lg:translate-x-0 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center border-b border-slate-200 px-4 flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-800">
            Conversaciones
          </h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-slate-400 hover:text-slate-600 lg:hidden"
            aria-label="Cerrar menú"
          >
            \u2715
          </button>
        </div>

        <div className="px-3 py-3 flex-shrink-0">
          <button
            onClick={() => {
              onNewConversation();
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Nueva conversación
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-slate-400">
              No hay conversaciones aún. Inicia una nueva.
            </p>
          )}
          {groupOrder.map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-3">
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {group}
                </p>
                {items.map((c) => {
                  const isSelected = c.id === selectedId;
                  return (
                    <div
                      key={c.id}
                      className={`group mb-0.5 flex items-center rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-teal-50 text-teal-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <button
                        onClick={() => {
                          onSelect(c);
                          onClose();
                        }}
                        className="flex-1 min-w-0 px-3 py-2.5 text-left"
                      >
                        <p className="truncate text-sm font-medium">
                          {c.title}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {c.memberName}
                        </p>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c.id);
                        }}
                        className="mr-2 rounded-lg p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                        aria-label="Eliminar conversación"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Componente: Selector de integrante (modal)                         */
/* ------------------------------------------------------------------ */

interface MemberPickerProps {
  open: boolean;
  members: FamilyProfile[];
  onSelect: (member: FamilyProfile) => void;
  onClose: () => void;
}

function MemberPicker({ open, members, onSelect, onClose }: MemberPickerProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Para quién es esta consulta?</DialogTitle>
          <DialogDescription>
            Selecciona el integrante de tu familia que necesita orientación.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {members.map((m) => {
            const age = calcAge(m.dateOfBirth);
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-teal-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">
                  {m.firstName?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {m.relationship ?? 'Integrante'}
                    {age !== undefined ? ` · ${age} años` : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Componente principal exportado                                      */
/* ------------------------------------------------------------------ */

export function TeleorientacionChatPage() {
  const ctx = useContext(UserContext);
  const user = ctx?.user ?? null;
  const personalInfo = ctx?.personalInfo ?? null;
  const healthInfo = ctx?.healthInfo ?? null;

  const [members, setMembers] = useState<FamilyProfile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [selectedMember, setSelectedMember] = useState<FamilyProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const initialGreetingTriggeredRef = useRef<Record<string, boolean>>({});

  /* ---- Cargar integrantes ---- */
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const list = await getSecureFamilyMembers(idToken);
        
        // Ordenar por nombre
        const sorted = (list as FamilyProfile[]).sort((a, b) => 
          (a.firstName || '').localeCompare(b.firstName || '')
        );
        
        setMembers(sorted);
      } catch (err) {
        console.error('[Teleorientación] Error cargando integrantes:', err);
      }
    };
    load();
  }, [user]);

  /* ---- Crear titular por defecto si no existe ---- */
  useEffect(() => {
    if (!user || !personalInfo || members.length > 0) return;

    const createTitularProfile = async () => {
      try {
        const titularRef = doc(
          db,
          COLECCION_TUTOR,
          user.uid,
          SUBCOLECCION_INTEGRANTES,
          'titular'
        );

        const dateOfBirth =
          personalInfo.dateOfBirth instanceof Date
            ? personalInfo.dateOfBirth.toISOString().split('T')[0]
            : '';

        const fallbackMember: FamilyProfile = {
          id: 'titular',
          userId: user.uid,
          firstName: personalInfo.firstName || 'Titular',
          lastName: personalInfo.lastName || '',
          sex: personalInfo.sex,
          dateOfBirth,
          country: personalInfo.country,
          insuranceProvider: personalInfo.insuranceProvider,
          insuranceProviderName: personalInfo.insuranceProviderName || '',
          relationship: 'Titular',
          esTitular: true,
          allergies: healthInfo?.allergies ?? [],
          medications: healthInfo?.medications ?? [],
          hasHistory: !!(
            healthInfo?.pathologicalHistory ||
            healthInfo?.surgicalHistory ||
            healthInfo?.gynecologicalHistory
          ),
        };

        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;

        await saveFamilyMember(idToken, 'titular', {
          userId: fallbackMember.userId,
          firstName: fallbackMember.firstName,
          lastName: fallbackMember.lastName,
          sex: fallbackMember.sex,
          dateOfBirth: fallbackMember.dateOfBirth,
          country: fallbackMember.country,
          insuranceProvider: fallbackMember.insuranceProvider,
          insuranceProviderName: fallbackMember.insuranceProviderName,
          relationship: fallbackMember.relationship,
          esTitular: fallbackMember.esTitular,
          allergies: fallbackMember.allergies,
          medications: fallbackMember.medications,
          hasHistory: fallbackMember.hasHistory,
        });


        setMembers([fallbackMember]);
      } catch (err) {
        console.error('[Teleorientación] Error creando titular por defecto:', err);
      }
    };

    createTitularProfile();
  }, [user, personalInfo, members.length, healthInfo]);

  /* ---- Cargar conversaciones ---- */
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const q = query(
          getConversationsCollectionRef(user.uid),
          orderBy('updatedAt', 'desc')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            memberId: data.memberId,
            memberName: data.memberName,
            title: data.title,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
            updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
            messageCount: data.messageCount ?? 0,
          } as Conversation;
        });
        setConversations(list);
        if (list.length > 0 && !selectedConv) {
          setSelectedConv(list[0]);
        }
      } catch (err) {
        console.error('[Teleorientación] Error cargando conversaciones:', err);
      }
    };
    load();
  }, [user]);

  /* ---- Resolver miembro seleccionado cuando cambia la conversacion ---- */
  useEffect(() => {
    if (!selectedConv || members.length === 0) return;
    const member = members.find((m) => m.id === selectedConv.memberId);
    setSelectedMember(member ?? null);
  }, [selectedConv, members]);

  /* ---- Cargar mensajes de la conversacion seleccionada ---- */
  useEffect(() => {
    if (!user || !selectedConv) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setIsHistoryLoading(true);
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        
        const loaded = await getSecureMessages(idToken, selectedConv.id);
        setMessages(loaded as ChatMessage[]);
      } catch (err) {
        console.error('[Teleorientación] Error cargando mensajes:', err);
        setMessages([]);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    loadMessages();
  }, [user, selectedConv?.id]);

  /* ---- Handlers de Conversación ---- */
  const handleCreateConversation = useCallback(async (member: FamilyProfile) => {
    if (!user) return;
    try {
      const convsRef = getConversationsCollectionRef(user.uid);
      const newConvData = {
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        title: `Consulta para ${member.firstName}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messageCount: 0,
      };
      
      const docRef = await addDoc(convsRef, newConvData);
      
      const newConv: Conversation = {
        id: docRef.id,
        memberId: member.id,
        memberName: newConvData.memberName,
        title: newConvData.title,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0,
      };
      
      setConversations(prev => [newConv, ...prev]);
      setSelectedConv(newConv);
      setMessages([]);
      setShowMemberPicker(false);
    } catch (err) {
      console.error('[Teleorientación] Error creando conversación:', err);
    }
  }, [user]);

  const handleDeleteConversation = useCallback(async (convId: string) => {
    if (!user) return;
    if (!confirm('¿Estás seguro de que deseas eliminar esta conversación?')) return;
    
    try {
      const docRef = doc(db, COLECCION_TUTOR, user.uid, SUBCOLECCION_CONVERSACIONES, convId);
      await deleteDoc(docRef);
      
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (selectedConv?.id === convId) {
        setSelectedConv(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('[Teleorientación] Error eliminando conversación:', err);
    }
  }, [user, selectedConv]);

  /* ---- Saludo inicial ---- */

  useEffect(() => {
    if (!user || !selectedConv || !selectedMember || isHistoryLoading || members.length === 0) return;

    const convKey = selectedConv.id;
    if (initialGreetingTriggeredRef.current[convKey]) return;

    if (messages.length > 0) return;

    const sendGreeting = async () => {
      try {
        initialGreetingTriggeredRef.current[convKey] = true;
        setIsLoading(true);

        const userName = selectedMember.firstName?.trim();
        const isFirstEver = conversations.length <= 1 && messages.length === 0;

        let greetingInstruction: string;
        if (isFirstEver) {
          greetingInstruction = userName
            ? `Saluda al usuario llamado ${userName} por primera vez. Preséntate y explícale qué es la teleorientación.`
            : 'Saluda al usuario por primera vez. Preséntate y explícale qué es la teleorientación.';
        } else {
          const dayPeriod = getDayPeriodGreeting();
          greetingInstruction = userName
            ? `¡${dayPeriod}, ${userName}! Saluda brevemente y pregúntale en qué puedes orientarle hoy.`
            : `¡${dayPeriod}! Saluda brevemente y pregúntale en qué puedes orientarle hoy.`;
        }

        const patientCtx = buildPatientContext(selectedMember, healthInfo?.allergies);
        const idToken = (await auth.currentUser?.getIdToken()) || '';

        const result = await sendTeleorientacionMessage(
          [{ role: 'user', content: greetingInstruction }],
          patientCtx,
          idToken
        );

        if (!result.success) {
          initialGreetingTriggeredRef.current[convKey] = false;
          return;
        }

        const assistantMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content: result.message,
          timestamp: new Date(),
        };

        setMessages((prev) => {
          if (prev.length > 0) return prev;
          return [assistantMsg];
        });
        await persistSecureMessage(user.uid, selectedConv.id, assistantMsg);
      } catch (err) {
        console.error('[Teleorientación] Error enviando saludo:', err);
        initialGreetingTriggeredRef.current[convKey] = false;
      } finally {
        setIsLoading(false);
      }
    };

    sendGreeting();
  }, [user, selectedConv?.id, selectedMember, isHistoryLoading, members.length, messages.length, healthInfo, user?.uid, conversations.length]);

  /* ---- Enviar mensaje ---- */
  const handleSendMessage = useCallback(
    async (text: string, images?: File[]) => {
      if (!user || !selectedConv || !selectedMember) return;
      if (!text.trim() && (!images || images.length === 0)) return;

      let imageUrls: string[] = [];
      if (images?.length) {
        
        imageUrls = await Promise.all(
          images.map(async (file) => {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.uid}/${selectedConv.id}/${uid()}.${fileExt}`;
            const storageRef = ref(storage, `medical-images/${fileName}`);
            
            const metadata = {
              contentType: file.type,
              customMetadata: {
                owner: user.uid,
                phi: 'true'
              }
            };
            
            const uploadResult = await uploadBytes(storageRef, file, metadata);
            return await getDownloadURL(uploadResult.ref);
          })
        );
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setIsLoading(true);

      try {
        await persistSecureMessage(user.uid, selectedConv.id, userMsg);

        const history: TeleorientacionMessage[] = nextMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          imageUrls: m.imageUrls,
        }));

        const patientCtx = selectedMember
          ? buildPatientContext(selectedMember, healthInfo?.allergies)
          : { firstName: 'Paciente', lastName: '' };

        const idToken = (await auth.currentUser?.getIdToken()) || '';

        const result = await sendTeleorientacionMessage(history, patientCtx, idToken);

        if (result.success) {
          const assistantMsg: ChatMessage = {
            id: uid(),
            role: 'assistant',
            content: result.message,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
          await persistSecureMessage(user.uid, selectedConv.id, assistantMsg);
        } else {
          const errorMsg: ChatMessage = {
            id: uid(),
            role: 'assistant',
            content: result.error ?? 'Lo siento, no pude procesar tu consulta. Intenta de nuevo.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMsg]);
          await persistSecureMessage(user.uid, selectedConv.id, errorMsg);
        }
      } catch (err) {
        console.error('[Teleorientación] Error enviando mensaje:', err);
        const errorMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content: 'Ocurrió un error de conexión. Verifica tu internet e intenta de nuevo.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        await persistSecureMessage(user.uid, selectedConv.id, errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, selectedConv, selectedMember, healthInfo, user]
  );

  /* ---- Nueva sesion ---- */
  const handleNewSession = useCallback(() => {
    if (members.length === 1) {
      handleCreateConversation(members[0]);
    } else {
      setShowMemberPicker(true);
    }
  }, [members, handleCreateConversation]);

  /* ---- Datos del miembro para la cabecera ---- */
  const memberAge = selectedMember ? calcAge(selectedMember.dateOfBirth) : undefined;
  const memberSex = selectedMember ? sexLabel(selectedMember.sex) : undefined;
  const memberName = selectedMember
    ? `${selectedMember.firstName} ${selectedMember.lastName}`.trim()
    : undefined;

  if (!user || ctx?.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-teal-500" />
          <p className="text-sm text-slate-500">Cargando teleorientación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <ConversationSidebar
        conversations={conversations}
        selectedId={selectedConv?.id ?? null}
        onSelect={(conv) => {
          setSelectedConv(conv);
          setMessages([]);
        }}
        onNewConversation={handleNewSession}
        onDelete={handleDeleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {selectedConv ? (
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            memberName={memberName}
            memberAge={memberAge}
            memberSex={memberSex}
            onMenuToggle={() => setSidebarOpen((prev) => !prev)}
            onNewSession={handleNewSession}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center bg-slate-50">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50">
              <MessageSquarePlus className="h-8 w-8 text-teal-500" />
            </div>
            <div>
              <h3 className="mb-1 text-lg font-semibold text-slate-800">Bienvenido a Teleorientación</h3>
              <p className="text-sm text-slate-500">Inicia una nueva conversación para recibir orientación médica.</p>
            </div>
            <button
              onClick={handleNewSession}
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700"
            >
              Nueva conversación
            </button>
          </div>
        )}
      </div>

      <MemberPicker
        open={showMemberPicker}
        members={members}
        onSelect={handleCreateConversation}
        onClose={() => setShowMemberPicker(false)}
      />
    </div>
  );
}
