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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <h2 className="text-xl font-extrabold text-brand-900">Plan Teleorientación</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-sky-50 hover:text-brand-900 disabled:opacity-50"
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
                <CheckCircle2 size={48} className="text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">{successMessage}</p>
            </div>
          ) : (
            // Form State
            <div className="space-y-6">
              {/* Plan Info */}
              <div className="rounded-2xl bg-sky-50 p-4">
                <h3 className="font-bold text-brand-900">Plan Mensual</h3>
                <div className="mt-3 space-y-2 text-sm text-foreground/80">
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
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
                <p className="text-center text-sm text-muted-foreground">Valor total</p>
                <p className="text-center text-3xl font-extrabold text-brand-900">
                  $19.900<span className="text-lg"> COP</span>
                </p>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Hasta 7 consultas por día · 210 tokens/mes
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-2 text-sm">
                <p className="font-bold text-brand-900">Incluye:</p>
                <ul className="space-y-1 text-foreground/80">
                  <li className="flex items-center gap-2">
                    <span className="font-bold text-primary">✓</span>
                    Acceso a especialistas médicos
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-bold text-primary">✓</span>
                    Respuestas en tiempo real
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-bold text-primary">✓</span>
                    Historial de consultas guardado
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-bold text-primary">✓</span>
                    Acceso a documentos médicos
                  </li>
                </ul>
              </div>

              {/* Renovación automática (opcional) */}
              <div className="rounded-2xl border border-border/70 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => handleToggleAutoRenew(e.target.checked)}
                    disabled={loading}
                    className="mt-1"
                  />
                  <span className="text-sm text-foreground/80">
                    <span className="font-semibold text-brand-900">Activar renovación automática mensual</span>
                    <br />
                    Se te cobrará <strong>$19.900 COP cada 30 días</strong> de forma automática hasta que canceles.
                    Puedes cancelar en cualquier momento desde &quot;Mi cuenta&quot;, sin ningún costo.
                  </span>
                </label>

                {autoRenew && consent && (
                  <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Número de tarjeta"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="col-span-2 rounded-xl border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        maxLength={19}
                      />
                      <input
                        type="text"
                        placeholder="MM"
                        value={cardExpMonth}
                        onChange={(e) => setCardExpMonth(e.target.value)}
                        className="rounded-xl border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        maxLength={2}
                      />
                      <input
                        type="text"
                        placeholder="AA"
                        value={cardExpYear}
                        onChange={(e) => setCardExpYear(e.target.value)}
                        className="rounded-xl border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        maxLength={2}
                      />
                      <input
                        type="text"
                        placeholder="CVC"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="rounded-xl border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        maxLength={4}
                      />
                      <input
                        type="text"
                        placeholder="Nombre del titular"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                        className="rounded-xl border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Acepto los{" "}
                        <a href={consent.acceptancePermalink} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
                          términos y condiciones de Wompi
                        </a>
                      </span>
                    </label>

                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={acceptedDataAuth}
                        onChange={(e) => setAcceptedDataAuth(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Autorizo el{" "}
                        <a href={consent.personalAuthPermalink} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
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
                <div className="flex items-start gap-3 rounded-2xl bg-red-50 p-3">
                  <AlertCircle size={20} className="flex-shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Info */}
              <div className="rounded-2xl bg-sky-50 p-3">
                <p className="text-xs text-brand-800">
                  💳 Pago seguro a través de Wompi. Tu número de tarjeta nunca pasa por nuestros servidores.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 border-t border-border/70 px-6 py-4">
            <button
              onClick={onClose}
              disabled={loading}
              className="h-12 flex-1 rounded-full border border-border bg-white font-semibold text-brand-900 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handlePayment}
              disabled={loading}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
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
