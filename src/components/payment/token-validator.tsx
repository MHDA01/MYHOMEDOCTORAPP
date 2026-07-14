"use client";

import { useEffect, useState, useContext } from "react";
import { UserContext } from "@/context/user-context";
import { checkTokenAvailability } from "@/app/actions/tokens";
import { WompyPaymentModal } from "./wompy-payment-modal";
import { AlertCircle } from "lucide-react";

interface TokenValidatorProps {
  onTokenCheckComplete?: (hasTokens: boolean) => void;
  autoShowModal?: boolean;
}

/**
 * Componente que valida tokens y muestra modal de pago si es necesario.
 * Debe colocarse en el layout o al abrir teleorientación.
 */
export function TokenValidator({
  onTokenCheckComplete,
  autoShowModal = true,
}: TokenValidatorProps) {
  const context = useContext(UserContext);
  const user = context?.user;
  const [showModal, setShowModal] = useState(false);
  const [hasTokens, setHasTokens] = useState<boolean | null>(null);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const checkTokens = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      const result = await checkTokenAvailability(user.uid);

      setHasTokens(result.available);
      setTokenInfo(result);

      // Si no tiene tokens y necesita pago, mostrar modal automáticamente
      if (!result.available && result.needsPayment && autoShowModal) {
        setShowModal(true);
      }

      onTokenCheckComplete?.(result.available);
    } catch (error) {
      console.error("Error checking tokens:", error);
      setHasTokens(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkTokens();
  }, [user?.uid]);

  if (!user) return null;

  return (
    <>
      {/* Token Info Banner (Opcional - mostrar si tiene pocos tokens) */}
      {hasTokens === false && !showModal && tokenInfo?.needsPayment && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-gap-3">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Período de prueba finalizado
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Adquiere el plan mensual para seguir usando teleorientación
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs font-semibold text-amber-600 hover:text-amber-700 whitespace-nowrap"
          >
            Actualizar
          </button>
        </div>
      )}

      {/* Token Status Display */}
      {hasTokens && tokenInfo && (
        <div className="text-xs text-gray-600 flex items-center gap-4">
          {tokenInfo.tokens.free > 0 && (
            <div>
              🎁 <span className="font-semibold">{tokenInfo.tokens.free}</span> gratis
            </div>
          )}
          {tokenInfo.tokens.paid > 0 && (
            <div>
              ⭐ <span className="font-semibold">{tokenInfo.tokens.paid}</span> pagos
            </div>
          )}
        </div>
      )}

      {/* Wompy Payment Modal */}
      <WompyPaymentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        uid={user.uid}
        onPaymentSuccess={() => {
          setShowModal(false);
          checkTokens(); // Recargar tokens después del pago
        }}
      />
    </>
  );
}

/**
 * Hook para validar tokens dentro de componentes
 */
export function useTokenCheck() {
  const context = useContext(UserContext);
  const user = context?.user;
  const [hasTokens, setHasTokens] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    if (!user?.uid) return null;

    try {
      setLoading(true);
      const result = await checkTokenAvailability(user.uid);
      setHasTokens(result.available);
      return result;
    } catch (error) {
      console.error("Error checking tokens:", error);
      setHasTokens(false);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { hasTokens, loading, check };
}
