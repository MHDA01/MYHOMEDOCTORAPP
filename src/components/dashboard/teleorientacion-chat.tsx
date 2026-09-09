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
import { checkTokenAvailability } from '@/app/actions/tokens';
import { storage, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import type { ChatMessage, Conversation } from '@/types/chat';
import type { FamilyProfile } from '@/lib/types';
import { TokenDisplay } from '@/components/payment/token-display';
import { WompyPaymentModal } from '@/components/payment/wompy-payment-modal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MessageSquarePlus, Trash2, Settings, LogOut, Stethoscope, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ChatInterface from '@/components/chat/ChatInterface';
import { 
  COLECCION_TUTOR, 
  SUBCOLECCION_INTEGRANTES, 
  SUBCOLECCION_CONVERSACIONES 
} from '@/lib/constants';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Debe coincidir con el "free: 6" inicial de src/lib/token-system.ts (ensureTokenDocument)
const FREE_TOKENS_DAILY_LIMIT = 6;

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
  freeTokens: number;
  freeTokensTotal: number;
}

function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  onDelete,
  isOpen,
  onClose,
  freeTokens,
  freeTokensTotal,
}: ConversationSidebarProps) {
  const grouped = groupConversations(conversations);
  const groupOrder: DateGroup[] = ['Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 30 días', 'Anteriores'];

  const userCtx = useContext(UserContext);
  const router = useRouter();
  const userFullName = userCtx?.personalInfo?.firstName && userCtx?.personalInfo?.lastName
    ? `${userCtx.personalInfo.firstName} ${userCtx.personalInfo.lastName}`
    : (userCtx?.user?.displayName || 'Usuario');
  const userInitials = userFullName
    ? userFullName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';
  const userEmail = userCtx?.user?.email || '';

  const handleLogout = async () => {
    if (userCtx?.signOutUser) {
      await userCtx.signOutUser();
      router.push('/login');
    }
  };

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
        className={`fixed inset-y-0 left-0 z-[9991] w-[230px] transform border-r border-slate-200 bg-[#1a365d] transition-transform duration-200 lg:relative lg:z-0 lg:translate-x-0 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="relative flex items-center justify-center px-2 py-2 flex-shrink-0">
          <img
            src="/images/LOGO_1.png"
            alt="MyHome DoctorApp"
            className="h-[150px] w-[150px] flex-shrink-0 object-contain"
          />
          <button
            onClick={onClose}
            className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:text-slate-200 lg:hidden"
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {/* Nueva conversación button */}
        <button
          onClick={() => {
            onNewConversation();
            onClose();
          }}
          className="mx-3 mb-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#10b981] text-white hover:bg-[#059669] transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Nueva conversación
        </button>

        {/* Navigation items */}
        <nav className="flex flex-col gap-0.5 px-3 flex-shrink-0">
          <Link
            href="/dashboard/teleorientacion"
            onClick={onClose}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[rgba(16,185,129,0.15)]"
          >
            <Stethoscope className="h-4 w-4 text-[#6ee7b7] flex-shrink-0" />
            <span className="text-xs font-semibold text-white">Teleorientación</span>
          </Link>
          <Link
            href="/dashboard/reportes"
            onClick={onClose}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#cbd5e1] hover:bg-[rgba(255,255,255,0.08)] transition-colors cursor-pointer"
          >
            <FileText className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />
            <span className="text-xs text-[#cbd5e1]">Informes</span>
          </Link>
        </nav>

        {/* Tokens libres card */}
        {(() => {
          // El denominador (cupo inicial) es un valor de referencia del cliente; el backend
          // puede otorgar más tokens gratis (p. ej. promociones). Tomamos el mayor entre el
          // cupo de referencia y los tokens disponibles para que el numerador nunca supere
          // al denominador ("10 / 6" era lógicamente inconsistente y generaba desconfianza).
          const displayTotal = Math.max(freeTokensTotal, freeTokens);
          return (
            <div className="mx-3 my-2.5 p-2 rounded-lg bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.3)]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-[#6ee7b7]">Tokens gratis</span>
                <span className="text-[11px] font-semibold text-[#6ee7b7]">{freeTokens} / {displayTotal}</span>
              </div>
              <div className="flex gap-1">
                {[...Array(displayTotal)].map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1 rounded-sm ${i < freeTokens ? 'bg-[#10b981]' : 'bg-[rgba(16,185,129,0.25)]'}`}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Conversation history */}
        <p className="text-[10px] text-[#64748b] mb-0.5 mx-3">últimos 7 dias</p>
        <nav className="flex-1 overflow-y-auto px-3 pb-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-[#64748b]">
              No hay conversaciones aún.
            </p>
          )}
          {groupOrder.map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-1.5">
                {items.map((c) => {
                  const isSelected = c.id === selectedId;
                  return (
                    <div
                      key={c.id}
                      className={`group mb-0.5 flex items-center rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-[rgba(255,255,255,0.08)]'
                          : 'hover:bg-[rgba(255,255,255,0.04)]'
                      }`}
                    >
                      <button
                        onClick={() => {
                          onSelect(c);
                          onClose();
                        }}
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-left"
                      >
                        <p className="truncate text-xs font-semibold text-white">
                          {c.title}
                        </p>
                        <p className="text-[10px] text-[#94a3b8] mt-0.5">
                          {c.memberName}
                        </p>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c.id);
                        }}
                        className="mr-2 rounded-lg p-1 text-[#64748b] opacity-0 transition-opacity hover:text-[#ef4444] group-hover:opacity-100"
                        aria-label="Eliminar conversación"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User card - fixed at bottom */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mx-3 mb-3 flex items-center gap-2 p-2 rounded-lg border border-[rgba(255,255,255,0.12)] flex-shrink-0 hover:bg-[rgba(255,255,255,0.08)] transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0">
                {userInitials}
              </div>
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
                {userFullName}
              </p>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" side="top">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userFullName}</p>
                {userEmail && (
                  <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/cuenta">
                <Settings className="mr-2 h-4 w-4" />
                <span>Mi cuenta</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Cerrar Sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  const [hasTokens, setHasTokens] = useState<boolean | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{ free: number; paid: number; needsPayment?: boolean; freePeriodEnds?: Date } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [conversationCompleted, setConversationCompleted] = useState(false);
  const [chatDisabledReason, setChatDisabledReason] = useState<string | null>(null);
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

  /* ---- Tokens del usuario ---- */

  const checkTokens = useCallback(async () => {
    if (!user) return null;
    setTokenLoading(true);

    try {
      const result = await checkTokenAvailability(user.uid);
      const tokenState = {
        free: result.tokens.free,
        paid: result.tokens.paid,
        needsPayment: result.needsPayment,
        freePeriodEnds: result.freePeriodEnds ? new Date(result.freePeriodEnds) : undefined,
      };
      setHasTokens(result.available);
      setTokenInfo(tokenState);

      if (!result.available) {
        setConversationCompleted(true);
        if (result.needsPayment) {
          setChatDisabledReason(
            'Tu período de prueba finalizó. Completa el pago para seguir usando teleorientación.'
          );
          setPaymentModalOpen(true);
        } else {
          setChatDisabledReason(
            'No hay tokens disponibles. Adquiere un plan para continuar con tus consultas.'
          );
        }
      } else {
        setChatDisabledReason(null);
      }

      return result;
    } catch (error) {
      console.error('[Teleorientación] Error verificando tokens:', error);
      setHasTokens(false);
      setChatDisabledReason(
        'No se pudo verificar tu estado de tokens. Intenta de nuevo más tarde.'
      );
      return null;
    } finally {
      setTokenLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    checkTokens();
  }, [user, selectedConv?.id, checkTokens]);

  useEffect(() => {
    setConversationCompleted(false);
    setChatDisabledReason(null);
  }, [selectedConv?.id]);

  const consumeToken = useCallback(async (convId: string) => {
    try {
      const callable = httpsCallable(functions, 'consumeTokenOnConsultationEnd');
      const response = await callable({ convId });
      const data = (response as any)?.data as any;
      return data?.success === true;
    } catch (error) {
      console.error('[Teleorientación] Error consumiendo token:', error);
      return false;
    }
  }, []);

  const isExplicitTopicChange = useCallback((text: string) => {
    const normalized = text.trim().toLowerCase();
    return /otra consulta|otra pregunta|cambio de tema|ahora quisiera|ahora quiero|otra cosa|cualquier otra|cambiar de tema|nuevo tema|quiero hablar de otra cosa/i.test(normalized);
  }, []);

  const isClosingMessage = useCallback((text: string) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;

    const closurePatterns = [
      /^(gracias|muchas gracias|eso es todo|eso seria todo|eso sería todo|no necesito mas|no necesito más|no gracias|listo|termin[oé]|finaliz[ao]|hasta luego|chau|adios|adiós)([.!?]*)$/i,
      /(gracias|eso es todo|no necesito mas|no necesito más|no gracias|listo|termin[oé]|finaliz[ao]|hasta luego|chau|adios|adiós)(\s*\.?\!?)*$/i,
      /^cualquier cosa te escribo/i,
      // Respuestas de satisfacción cuando la IA pregunta "¿sientes que esto resolvió tu duda?"
      /^(si|sí)(,)?\s*(estoy|me siento|quedo)?\s*(satisfech[oa])?(\s*,?\s*gracias)?([.!?]*)$/i,
      /satisfech[oa]|resolvi[oó] mi (duda|inquietud|pregunta)|qued[oó] clar[oa]|no tengo más (dudas|preguntas)|no tengo mas (dudas|preguntas)/i,
    ];

    return closurePatterns.some((pattern) => pattern.test(normalized));
  }, []);

  function assistantClosureText(reason: 'user_close' | 'topic_change') {
    if (reason === 'user_close') {
      return `Gracias por usar Teleorientación. He terminado tu consulta actual. Si más adelante necesitas continuar o tienes otra duda relacionada, inicia una nueva conversación y con gusto te ayudaré. Cuídate y gracias por tu confianza.`;
    }
    // topic_change
    return `Veo que estás cambiando de tema. Para mantener la calidad y trazabilidad de las teleorientaciones, he registrado la consulta y aplicado el consumo correspondiente. Si quieres seguir con este nuevo tema, inicia por favor una nueva conversación. Gracias por tu comprensión.`;
  }

  /* ---- Saludo inicial ---- */

  useEffect(() => {
    if (!user || !selectedConv || !selectedMember || isHistoryLoading || members.length === 0) return;

    // Evita saludar con el nombre del integrante anterior: al crear/cambiar a una
    // conversación de otro miembro, `selectedConv` se actualiza un render antes que
    // `selectedMember` (que se resuelve en otro efecto). Si el saludo se dispara en ese
    // instante usaría el nombre viejo y quedaría fijado por initialGreetingTriggeredRef.
    // Esperamos a que el miembro resuelto corresponda a la conversación actual.
    if (selectedMember.id !== selectedConv.memberId) return;

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
      if (conversationCompleted || hasTokens === false) return;
      const trimmedText = text.trim();
      if (!trimmedText && (!images || images.length === 0)) return;

      let imageUrls: string[] = [];
      if (images?.length) {
        setIsLoading(true);
        try {
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
        } catch (err) {
          console.error('[Teleorientación] Error subiendo imagen:', err);
          setIsLoading(false);
          const uploadErrorMsg: ChatMessage = {
            id: uid(),
            role: 'assistant',
            content: 'No pude subir la imagen. Verifica tu conexión e intenta de nuevo.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, uploadErrorMsg]);
          persistSecureMessage(user.uid, selectedConv.id, uploadErrorMsg).catch(() => undefined);
          return;
        }
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

        // Cierre por cambio de tema: SOLO cuando el paciente lo dice explícitamente con sus
        // propias palabras (ej. "otra consulta", "cambio de tema"). Ya no se infiere el cambio
        // de tema por solapamiento de palabras contra el primer mensaje — ese heurístico
        // generaba falsos positivos con preguntas de continuidad normales (ej. adjuntar una
        // imagen sin texto, o preguntar algo relacionado con vocabulario distinto al mensaje 1).
        if (!images?.length && isExplicitTopicChange(trimmedText)) {
          const consumed = await consumeToken(selectedConv.id);

          const assistantMsg: ChatMessage = {
            id: uid(),
            role: 'assistant',
            content: assistantClosureText('topic_change'),
            timestamp: new Date(),
          };

          setMessages((prev) => [...prev, assistantMsg]);
          await persistSecureMessage(user.uid, selectedConv.id, assistantMsg);

          if (consumed) {
            setConversationCompleted(true);
            setHasTokens(false);
            setChatDisabledReason(
              'Has cambiado de tema; token consumido. Inicia nueva conversación para continuar.'
            );
            await checkTokens();
          }

          return;
        }

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

          if (isClosingMessage(text)) {
            const consumed = await consumeToken(selectedConv.id);

            const closingAssistantMsg: ChatMessage = {
              id: uid(),
              role: 'assistant',
              content: assistantClosureText('user_close'),
              timestamp: new Date(),
            };

            setMessages((prev) => [...prev, closingAssistantMsg]);
            await persistSecureMessage(user.uid, selectedConv.id, closingAssistantMsg);

            if (consumed) {
              setConversationCompleted(true);
              setChatDisabledReason(
                'Consulta finalizada. Inicia una nueva conversación para continuar.'
              );
              await checkTokens();
            }
          }
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
    [messages, selectedConv, selectedMember, healthInfo, user, conversationCompleted, hasTokens, isExplicitTopicChange, isClosingMessage, consumeToken, checkTokens]
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
        freeTokens={tokenInfo?.free ?? 0}
        freeTokensTotal={FREE_TOKENS_DAILY_LIMIT}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-white">
        {chatDisabledReason && selectedConv && (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-xs text-rose-700">
            {chatDisabledReason}
          </div>
        )}
        {selectedConv ? (
          <div className="flex h-full min-h-0 flex-col">
            {/* Banner "Comprar tokens" */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#f1f5f9] mx-5 mt-2">
              <p className="text-[11px] font-semibold text-[#1a365d]">Necesitas mas consultas? Compra tokens.</p>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-[#1a365d] text-white text-[11px] font-semibold hover:bg-[#0f2a47] transition-colors flex-shrink-0"
              >
                Comprar tokens
              </button>
            </div>

            {/* Chat interface */}
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading || tokenLoading}
              memberName={memberName}
              memberAge={memberAge}
              memberSex={memberSex}
              onMenuToggle={() => setSidebarOpen((prev) => !prev)}
              onNewSession={handleNewSession}
              disabled={Boolean(chatDisabledReason)}
            />
          </div>
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

      <WompyPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        uid={user.uid}
        onPaymentSuccess={async () => {
          setPaymentModalOpen(false);
          await checkTokens();
        }}
      />
    </div>
  );
}
