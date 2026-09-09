"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { fetchWompiConsent, tokenizeCard, type WompiMerchantConsent } from "@/lib/wompi-client";

interface WompyPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  onPaymentSuccess?: () => void;
}

export function WompyPaymentModal({
  isOpen,
  onClose,
  uid,
  onPaymentSuccess,
}: WompyPaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Redirigiendo a Wompi para completar el pago...");

  // Renovación automática
  const [autoRenew, setAutoRenew] = useState(false);
  const [consent, setConsent] = useState<WompiMerchantConsent | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedDataAuth, setAcceptedDataAuth] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardHolder, setCardHolder] = useState("");

  const handleToggleAutoRenew = async (checked: boolean) => {
    setAutoRenew(checked);
    setError(null);

    if (checked && !consent) {
      try {
        const c = await fetchWompiConsent();
        setConsent(c);
      } catch (err: any) {
        setError(err.message || "No se pudieron cargar los términos de Wompi");
        setAutoRenew(false);
      }
    }
  };

  const handleOneTimePayment = async () => {
    const initializeWompyPayment = httpsCallable(functions, "initializeWompyPayment");
    const result = await initializeWompyPayment({});
    const data = result.data as any;

    if (data.success && data.payment_url) {
      setSuccessMessage("Redirigiendo a Wompi para completar el pago...");
      setSuccess(true);
      setTimeout(() => {
        window.location.href = data.payment_url;
      }, 1500);
    } else {
      setError("No se pudo obtener la URL de pago");
    }
  };

  const handleRecurringPayment = async () => {
    if (!acceptedTerms || !acceptedDataAuth) {
      setError("Debes aceptar los términos y la autorización de datos personales de Wompi");
      return;
    }
    if (!consent) {
      setError("No se cargaron los términos de Wompi. Intenta de nuevo.");
      return;
    }
    if (!cardNumber || !cardExpMonth || !cardExpYear || !cardCvc || !cardHolder) {
      setError("Completa todos los datos de la tarjeta");
      return;
    }

    const cardToken = await tokenizeCard({
      number: cardNumber,
      cvc: cardCvc,
      expMonth: cardExpMonth,
      expYear: cardExpYear,
      cardHolder,
    });

    const createPaymentSource = httpsCallable(functions, "createPaymentSource");
    const result = await createPaymentSource({
      cardToken,
      acceptanceToken: consent.acceptanceToken,
      acceptPersonalAuthToken: consent.personalAuthToken,
    });

    const data = result.data as any;
    if (data.success) {
      setSuccessMessage(
        data.status === "pending"
          ? "Tu pago está siendo confirmado por el banco. Te avisaremos por correo y verás tus tokens acreditados en unos minutos."
          : "¡Pago aprobado! Tu renovación automática mensual quedó activada."
      );
      setSuccess(true);
      setTimeout(() => {
        onPaymentSuccess?.();
      }, 1800);
    } else {
      setError("No se pudo activar la renovación automática");
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      if (autoRenew) {
        await handleRecurringPayment();
      } else {
        await handleOneTimePayment();
      }
    } catch (err: any) {
      console.error("Error en el pago:", err);
      const message =
        err?.details?.message ||
        err?.message ||
        "Error al procesar el pago. Intenta de nuevo.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-bold text-gray-900">Plan Teleorientación</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {success ? (
            // Success State
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle2 size={48} className="text-green-500" />
              </div>
              <p className="text-sm text-gray-600">{successMessage}</p>
            </div>
          ) : (
            // Form State
            <div className="space-y-6">
              {/* Plan Info */}
              <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
                <h3 className="font-semibold text-gray-900">Plan Mensual</h3>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>Consultas por día:</span>
                    <span className="font-semibold">Hasta 7</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duración:</span>
                    <span className="font-semibold">30 días</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Disponibilidad:</span>
                    <span className="font-semibold">24/7</span>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4">
                <p className="text-center text-sm text-gray-600">Valor total</p>
                <p className="text-center text-3xl font-bold text-indigo-600">
                  $19.900<span className="text-lg"> COP</span>
                </p>
                <p className="mt-2 text-center text-xs text-gray-500">
                  Hasta 7 consultas por día · 210 tokens/mes
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-gray-900">Incluye:</p>
                <ul className="space-y-1 text-gray-700">
                  <li className="flex items-center gap-2">
                    <span className="text-indigo-600">✓</span>
                    Acceso a especialistas médicos
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-indigo-600">✓</span>
                    Respuestas en tiempo real
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-indigo-600">✓</span>
                    Historial de consultas guardado
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-indigo-600">✓</span>
                    Acceso a documentos médicos
                  </li>
                </ul>
              </div>

              {/* Renovación automática (opcional) */}
              <div className="rounded-lg border border-gray-200 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => handleToggleAutoRenew(e.target.checked)}
                    disabled={loading}
                    className="mt-1"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">Activar renovación automática mensual</span>
                    <br />
                    Se te cobrará <strong>$19.900 COP cada 30 días</strong> de forma automática hasta que canceles.
                    Puedes cancelar en cualquier momento desde &quot;Mi cuenta&quot;, sin ningún costo.
                  </span>
                </label>

                {autoRenew && consent && (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Número de tarjeta"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        maxLength={19}
                      />
                      <input
                        type="text"
                        placeholder="MM"
                        value={cardExpMonth}
                        onChange={(e) => setCardExpMonth(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                        maxLength={2}
                      />
                      <input
                        type="text"
                        placeholder="AA"
                        value={cardExpYear}
                        onChange={(e) => setCardExpYear(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                        maxLength={2}
                      />
                      <input
                        type="text"
                        placeholder="CVC"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                        maxLength={4}
                      />
                      <input
                        type="text"
                        placeholder="Nombre del titular"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <label className="flex items-start gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Acepto los{" "}
                        <a href={consent.acceptancePermalink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                          términos y condiciones de Wompi
                        </a>
                      </span>
                    </label>

                    <label className="flex items-start gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={acceptedDataAuth}
                        onChange={(e) => setAcceptedDataAuth(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Autorizo el{" "}
                        <a href={consent.personalAuthPermalink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                          tratamiento de mis datos personales
                        </a>{" "}
                        conforme a la Ley 1581 de 2012
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-gap-3 rounded-lg bg-red-50 p-3">
                  <AlertCircle size={20} className="flex-shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Info */}
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700">
                  💳 Pago seguro a través de Wompi. Tu número de tarjeta nunca pasa por nuestros servidores.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              onClick={handlePayment}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Procesando...
                </>
              ) : autoRenew ? (
                "Pagar y activar renovación"
              ) : (
                "Ir a Wompi"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
