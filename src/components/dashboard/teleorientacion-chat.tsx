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
import { MessageSquarePlus, Trash2, Settings, LogOut, X, Coins, ChevronLeft, History } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BrandLockup } from '@/components/brand-lockup';
import DraHildaAvatar from '@/components/ui/avatar';
import { GROWTH_NAV_ITEM, MAIN_NAV_ITEMS, isNavItemActive } from '@/components/dashboard/nav-items';
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
  onBuyTokens: () => void;
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
  onBuyTokens,
}: ConversationSidebarProps) {
  const grouped = groupConversations(conversations);
  const groupOrder: DateGroup[] = ['Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 30 días', 'Anteriores'];

  const userCtx = useContext(UserContext);
  const router = useRouter();
  const pathname = usePathname();
  const userFullName = userCtx?.personalInfo?.firstName && userCtx?.personalInfo?.lastName
    ? `${userCtx.personalInfo.firstName} ${userCtx.personalInfo.lastName}`
    : (userCtx?.user?.displayName || 'Usuario');
  const userInitials = userFullName
    ? userFullName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';
  const userEmail = userCtx?.user?.email || '';
  const isFounder = !!process.env.NEXT_PUBLIC_FOUNDER_EMAIL && userEmail === process.env.NEXT_PUBLIC_FOUNDER_EMAIL;
  const navItems = isFounder ? [...MAIN_NAV_ITEMS, GROWTH_NAV_ITEM] : MAIN_NAV_ITEMS;

  const handleLogout = async () => {
    if (userCtx?.signOutUser) {
      await userCtx.signOutUser();
      router.push('/login');
    }
  };

  // El denominador (cupo inicial) es un valor de referencia del cliente; el backend
  // puede otorgar más tokens gratis (p. ej. promociones). Tomamos el mayor entre el
  // cupo de referencia y los tokens disponibles para que el numerador nunca supere
  // al denominador ("10 / 6" era lógicamente inconsistente y generaba desconfianza).
  const displayTotal = Math.max(freeTokensTotal, freeTokens);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9990] bg-brand-900/40 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[9991] flex w-[280px] max-w-[85vw] transform flex-col border-r border-border bg-white transition-transform duration-200 lg:relative lg:z-0 lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-card' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex shrink-0 items-center justify-between px-4 py-5">
          <Link href="/dashboard" onClick={onClose} aria-label="Ir al inicio">
            <BrandLockup />
          </Link>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-sky-50 hover:text-brand-900 lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nueva conversación button */}
        <div className="shrink-0 px-3">
          <button
            onClick={() => {
              onNewConversation();
              onClose();
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-soft transition-all hover:bg-teal-600 hover:shadow-card active:scale-[0.98]"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Nueva conversación
          </button>
        </div>

        {/* Navigation items — la misma lista del menú lateral y la barra inferior */}
        <nav className="mt-4 flex shrink-0 flex-col gap-0.5 px-3">
          {navItems.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex h-10 items-center gap-3 rounded-full px-4 text-sm font-semibold transition-colors ${
                  active ? 'bg-sky-100 text-brand-900' : 'text-brand-900/70 hover:bg-sky-50 hover:text-brand-900'
                }`}
              >
                <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Tokens libres card */}
        <div className="mx-3 mt-4 shrink-0 rounded-2xl bg-sky-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Tokens gratis</span>
            <span className="text-xs font-bold text-brand-900">{freeTokens} / {displayTotal}</span>
          </div>
          <div className="flex gap-1">
            {[...Array(displayTotal)].map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < freeTokens ? 'bg-primary' : 'bg-primary/20'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onBuyTokens();
              onClose();
            }}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-white text-xs font-bold text-brand-900 transition-colors hover:border-primary"
          >
            <Coins className="h-4 w-4 text-primary" />
            Comprar tokens
          </button>
        </div>

        {/* Conversation history */}
        <p className="mx-4 mb-1 mt-5 shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Conversaciones
        </p>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No hay conversaciones aún.
            </p>
          )}
          {groupOrder.map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-2">
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{group}</p>
                {items.map((c) => {
                  const isSelected = c.id === selectedId;
                  return (
                    <div
                      key={c.id}
                      className={`group mb-0.5 flex items-center rounded-2xl transition-colors ${
                        isSelected ? 'bg-sky-100' : 'hover:bg-sky-50'
                      }`}
                    >
                      <button
                        onClick={() => {
                          onSelect(c);
                          onClose();
                        }}
                        className="min-w-0 flex-1 px-3 py-2.5 text-left"
                      >
                        <p className="truncate text-sm font-semibold text-brand-900">
                          {c.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {c.memberName}
                        </p>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c.id);
                        }}
                        className="mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100"
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

        {/* User card - fixed at bottom */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mx-3 mb-3 flex shrink-0 items-center gap-2.5 rounded-2xl border border-border p-2 text-left transition-colors hover:bg-sky-50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {userInitials}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-900">
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
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-sky-50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-brand-800">
                  {m.firstName?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-900">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Cargando teleorientación...</p>
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
        onBuyTokens={() => setPaymentModalOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-white">
        {selectedConv ? (
          // La franja "Comprar tokens" que iba encima del chat pasó a la cabecera
          // (botón de tokens y menú ⋯) y al menú de conversaciones; abre el mismo modal.
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading || tokenLoading}
            memberName={memberName}
            memberAge={memberAge}
            memberSex={memberSex}
            onMenuToggle={() => setSidebarOpen((prev) => !prev)}
            onNewSession={handleNewSession}
            onBuyTokens={() => setPaymentModalOpen(true)}
            tokensAvailable={tokenInfo ? (tokenInfo.free ?? 0) + (tokenInfo.paid ?? 0) : null}
            notice={chatDisabledReason}
            disabled={Boolean(chatDisabledReason)}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {/* Sin conversación abierta, en celular no había forma de volver ni de abrir el historial */}
            <div className="flex h-16 shrink-0 items-center justify-between px-2 lg:hidden">
              <Link
                href="/dashboard"
                aria-label="Volver al inicio"
                className="flex h-10 w-10 items-center justify-center rounded-full text-brand-900 hover:bg-sky-50"
              >
                <ChevronLeft className="h-6 w-6" />
              </Link>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-brand-900 hover:bg-sky-50"
              >
                <History className="h-4 w-4" />
                Mis conversaciones
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <DraHildaAvatar size="xl" />
              <div>
                <h3 className="mb-1 text-2xl font-bold">Bienvenido a Teleorientación</h3>
                <p className="text-[15px] text-muted-foreground">Inicia una nueva conversación para recibir orientación médica.</p>
              </div>
              <button
                onClick={handleNewSession}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft transition-all hover:bg-teal-600 hover:shadow-card active:scale-[0.98]"
              >
                <MessageSquarePlus className="h-4 w-4" />
                Nueva conversación
              </button>
            </div>
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
