'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sendOrientacionMessage } from '@/app/actions/teleorientacion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bell, CalendarDays, IdCard, Mic, SendHorizonal, ShieldCheck, UserRound } from 'lucide-react';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function TeleorientacionPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        '¡Hola María Fernanda! Soy la Dra. Hilda, tu asistente médica virtual. Estoy aquí para escucharte y orientarte paso a paso. ¿Cómo te sientes hoy?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const patient = useMemo(
    () => ({
      fullName: 'María Fernanda López',
      age: 34,
      sex: 'female',
      insurance: 'Sanitas EPS',
      patientId: 'MHDA-1492-2024',
      allergies: ['Penicilina'],
      medications: [],
      pathologicalHistory: 'Migraña episódica',
      surgicalHistory: '',
      gynecologicalHistory: '',
      lastLabResults: [],
    }),
    []
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
    setInput('');
    setIsSending(true);

    try {
      const result = await sendOrientacionMessage({
        patientContext: patient,
        userMessage: text,
        conversationHistory: messages.map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          content: msg.content,
        })),
        isFirstVisit: false,
        isOnboardingComplete: true,
      });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.success ? result.response : result.error || 'No fue posible procesar tu solicitud en este momento.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'No pude conectar en este momento. Intenta nuevamente en unos segundos.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, messages, patient]);

  return (
    <div className="h-full overflow-y-auto bg-[#f7f9fc] p-5 md:p-7">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <UserRound className="h-5 w-5 text-emerald-500" />
              <div><p className="text-xs text-slate-500">Paciente</p><p className="text-lg font-semibold text-slate-800">{patient.fullName}</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <CalendarDays className="h-5 w-5 text-blue-500" />
              <div><p className="text-xs text-slate-500">Edad</p><p className="text-lg font-semibold text-slate-800">{patient.age} años</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <IdCard className="h-5 w-5 text-rose-500" />
              <div><p className="text-xs text-slate-500">ID Paciente</p><p className="text-lg font-semibold text-slate-800">{patient.patientId}</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-indigo-500" />
              <div><p className="text-xs text-slate-500">Aseguradora</p><p className="text-lg font-semibold text-slate-800">{patient.insurance}</p></div>
            </div>
          </div>
          <div className="flex items-center justify-end px-2">
            <button className="relative rounded-full p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              <Bell className="h-6 w-6" />
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </button>
          </div>
        </div>

        <div className="grid min-h-[72vh] grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <section className="flex min-h-0 flex-col rounded-[24px] border border-slate-200 bg-[#fafcff] p-5">
            <div className="flex items-start justify-between gap-4 pb-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-24 w-24 border-2 border-cyan-100">
                  <AvatarImage src="/images/dra_hilda_avatar.webp" alt="Dra. Hilda" />
                  <AvatarFallback>DH</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-5xl font-semibold leading-tight text-slate-900">Dra. Hilda AI</h2>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-700">IA médica</span>
                  </div>
                  <p className="mt-2 text-xl text-slate-500">Tu asistente médica virtual, disponible para orientarte.</p>
                </div>
              </div>
              <p className="hidden items-center gap-2 text-lg text-slate-500 lg:flex"><ShieldCheck className="h-5 w-5" /> Conversación segura y confidencial</p>
            </div>

            <div ref={listRef} className="flex-1 space-y-5 overflow-y-auto px-1 pb-4 pt-2">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' && (
                    <Avatar className="h-12 w-12 border border-cyan-100">
                      <AvatarImage src="/images/dra_hilda_avatar.webp" alt="Dra. Hilda" />
                      <AvatarFallback>DH</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[76%] rounded-[24px] border px-5 py-4 text-[34px] leading-relaxed ${message.role === 'user' ? 'border-cyan-100 bg-cyan-50 text-slate-800' : 'border-slate-200 bg-white text-slate-800'}`}>
                    <p>{message.content}</p>
                    <p className="mt-2 text-[20px] text-slate-400">{formatTime(message.timestamp)}</p>
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
                  La Dra. Hilda está escribiendo...
                </div>
              )}
            </div>

            <div className="mt-3 rounded-[26px] border border-slate-200 bg-white p-2">
              <div className="flex items-center gap-2 rounded-[22px] border border-slate-200 px-3 py-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Escribe tu mensaje..."
                  className="h-11 flex-1 border-0 bg-transparent px-2 text-base text-slate-700 outline-none placeholder:text-slate-400"
                  disabled={isSending}
                />
                <button className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-600 text-white transition hover:bg-cyan-700"><Mic className="h-5 w-5" /></button>
                <button onClick={handleSend} disabled={isSending || !input.trim()} className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"><SendHorizonal className="h-5 w-5" /></button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-lg font-semibold text-slate-800">Resumen de salud</p><p className="mt-1 text-sm text-slate-500">Información clave del paciente</p><div className="mt-4 space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-slate-500">Presión arterial</span><span className="font-medium text-slate-800">110/70 mmHg</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Frecuencia cardíaca</span><span className="font-medium text-slate-800">72 lpm</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Peso</span><span className="font-medium text-slate-800">61 kg</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Estatura</span><span className="font-medium text-slate-800">165 cm</span></div></div></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-lg font-semibold text-slate-800">Próximas citas</p><div className="mt-4 flex items-center justify-between"><div><p className="font-medium text-slate-800">Medicina general</p><p className="text-sm text-slate-500">Dra. Laura Gómez</p></div><p className="text-sm text-slate-500">10:30 a. m.</p></div></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-lg font-semibold text-slate-800">Documentos recientes</p><div className="mt-4 flex items-center justify-between"><div><p className="font-medium text-slate-800">Resultados de laboratorio</p><p className="text-sm text-slate-500">12 de mayo de 2024</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">PDF</span></div></div>
          </aside>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <p><span className="font-semibold">Aviso importante:</span> La información y recomendaciones proporcionadas por esta IA médica son orientativas y no sustituyen la valoración presencial. En caso de emergencia, acude a urgencias o llama al 123.</p>
        </div>
      </div>
      <div className="mt-5 text-center text-sm text-slate-500">Powered by <span className="font-semibold text-cyan-700">MyHomeDoctorApp</span> · IA médica asistida</div>
    </div>
  );
}
