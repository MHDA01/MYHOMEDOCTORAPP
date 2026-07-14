'use client';

import { useState } from 'react';

/**
 * Componente de Vista Móvil - Teleorientación
 * Sigue el diseño del mockup mobile con:
 * - Top app bar azul marino
 * - Alerta médica crítica
 * - Tarjeta de tokens
 * - Chat reciente
 * - Acciones rápidas
 * - Bottom navigation
 */

export function TeleorientacionMobile() {
  const [activeTab, setActiveTab] = useState<'home' | 'chats' | 'reports' | 'profile'>('home');

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col h-screen bg-white md:hidden">
      {/* Top App Bar */}
      <div className="flex items-center justify-between bg-[#1a365d] px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#10b981] flex items-center justify-center flex-shrink-0">
            <i className="ti ti-home-2 text-white text-base"></i>
          </div>
          <p className="text-sm font-semibold text-white">MyHome DoctorApp</p>
        </div>
        <i className="ti ti-bell text-[#cbd5e1] text-lg"></i>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="px-4 py-3 space-y-3">
          {/* Alerta médica crítica */}
          <div className="p-3 rounded-lg bg-[#fee2e2] border border-[#fecaca]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <i className="ti ti-shield-exclamation text-[#ef4444] text-base flex-shrink-0"></i>
              <p className="text-xs font-semibold text-[#991b1b]">Alerta médica crítica</p>
            </div>
            <p className="text-xs text-[#991b1b] leading-relaxed">
              Alergias: Penicilina y Sulfa
            </p>
          </div>

          {/* Tokens de servicio */}
          <div className="p-3 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-[#166534]">Tokens de servicio</span>
              <span className="text-xs font-semibold text-[#166534]">4 / 6</span>
            </div>
            <div className="flex gap-1 mb-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-sm ${i < 4 ? 'bg-[#10b981]' : 'bg-[#d1fae5]'}`}
                />
              ))}
            </div>
            <button className="w-full py-2 rounded-lg bg-[#10b981] text-white text-xs font-semibold hover:bg-[#059669] transition-colors">
              Comprar tokens
            </button>
          </div>

          {/* Chat reciente */}
          <div className="p-3 rounded-lg bg-[#f7fafc] border border-[#e2e8f0]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-[rgba(16,185,129,0.12)] flex items-center justify-center flex-shrink-0">
                <i className="ti ti-stethoscope text-[#10b981] text-sm"></i>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#1a365d]">Dra. Hilda AI</p>
                <p className="text-[10px] text-[#64748b]">Hace 3 min</p>
              </div>
            </div>
            <p className="text-xs text-[#334155] mb-3 leading-relaxed">
              Buenas tardes, Alexander. ¿En qué puedo ayudarte hoy?
            </p>
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-lg bg-[#1a365d] text-white text-[11px] font-semibold hover:bg-[#0f2a47] transition-colors">
                Responder ahora
              </button>
              <button className="flex-1 py-2 rounded-lg border border-[#e2e8f0] bg-white text-[#1a365d] text-[11px] font-semibold hover:bg-[#f7fafc] transition-colors">
                Detalles
              </button>
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-[#f7fafc] border border-[#e2e8f0] text-center hover:bg-[#f0f4f8] transition-colors cursor-pointer">
              <i className="ti ti-calendar-plus text-[#1a365d] text-2xl flex justify-center mb-1"></i>
              <p className="text-[11px] font-semibold text-[#1a365d]">Reservar visita</p>
            </div>
            <div className="p-3 rounded-lg bg-[#f7fafc] border border-[#e2e8f0] text-center hover:bg-[#f0f4f8] transition-colors cursor-pointer">
              <i className="ti ti-coin text-[#10b981] text-2xl flex justify-center mb-1"></i>
              <p className="text-[11px] font-semibold text-[#1a365d]">Recargas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 flex border-t border-[#e2e8f0] bg-white md:hidden">
        {[
          { id: 'home' as const, icon: 'ti-home', label: 'Inicio' },
          { id: 'chats' as const, icon: 'ti-message-circle', label: 'Chats' },
          { id: 'reports' as const, icon: 'ti-file-text', label: 'Informes' },
          { id: 'profile' as const, icon: 'ti-user', label: 'Perfil' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => handleTabChange(item.id)}
            className={`flex-1 flex flex-col items-center py-2 transition-colors ${
              activeTab === item.id
                ? 'text-[#1a365d]'
                : 'text-[#94a3b8]'
            }`}
          >
            <i className={`ti ${item.icon} text-lg`}></i>
            <p className="text-[9px] font-semibold mt-0.5">{item.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
