"use client";

import { useEffect, useState, useContext } from "react";
import { UserContext } from "@/context/user-context";
import { auth } from "@/lib/firebase";
import { getTokenInfo } from "@/app/actions/tokens";
import { Zap, AlertTriangle } from "lucide-react";

interface TokenDisplayProps {
  onPaymentNeeded?: () => void;
}

/**
 * Componente que muestra el estado de tokens en la interfaz del chat.
 * Colocarlo en la parte superior del ChatInterface.
 */
export function TokenDisplay({ onPaymentNeeded }: TokenDisplayProps) {
  const context = useContext(UserContext);
  const user = context?.user;
  const [tokens, setTokens] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchTokens = async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const info = await getTokenInfo(idToken);
        setTokens(info ?? { free: 0, paid: 0, freePeriodEnds: new Date(), dailyReset: new Date() });

        // Verificar si necesita pago
        if (info) {
          const freePeriodEnds = info.freePeriodEnds instanceof Date 
            ? info.freePeriodEnds 
            : new Date(info.freePeriodEnds);
          const now = new Date();
          if (now > freePeriodEnds && (info.paid || 0) === 0) {
            onPaymentNeeded?.();
          }
        }
      } catch (error) {
        console.error("Error fetching tokens:", error);
        setTokens({ free: 0, paid: 0, freePeriodEnds: new Date(), dailyReset: new Date() });
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();

    // Refresco cada 30 segundos
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  if (loading || !tokens) return null;

  const totalTokens = (tokens.free || 0) + (tokens.paid || 0);
  const isLowTokens = totalTokens <= 2;
  const hasNoTokens = totalTokens === 0;

  if (hasNoTokens) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-center gap-3">
        <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-900">Tokens no disponibles</p>
          <p className="text-xs text-red-700">Actualiza tu plan para continuar</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg p-3 flex items-center gap-3 ${
        isLowTokens
          ? "bg-amber-50 border border-amber-200"
          : "bg-green-50 border border-green-200"
      }`}
    >
      <Zap
        size={18}
        className={`flex-shrink-0 ${
          isLowTokens ? "text-amber-600" : "text-green-600"
        }`}
      />
      <div className="flex-1">
        <p className={`text-sm font-semibold ${
          isLowTokens ? "text-amber-900" : "text-green-900"
        }`}>
          Consultas disponibles
        </p>
        <p className={`text-xs ${
          isLowTokens ? "text-amber-700" : "text-green-700"
        }`}>
          {tokens.free > 0 && (
            <span>
              🎁 {tokens.free} gratis{tokens.paid > 0 ? ", " : ""}
            </span>
          )}
          {tokens.paid > 0 && (
            <span>⭐ {tokens.paid} premium</span>
          )}
        </p>
      </div>
      {isLowTokens && (
        <div className="text-xs font-semibold text-amber-600">
          ⚠️ Bajo
        </div>
      )}
    </div>
  );
}
