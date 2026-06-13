'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShieldCheck } from 'lucide-react';

interface LegalConsentModalProps {
  open: boolean;
  onAccept: () => void;
}

export function LegalConsentModal({ open, onAccept }: LegalConsentModalProps) {
  const [consentData, setConsentData] = useState(false);
  const [consentTeleorientation, setConsentTeleorientation] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);

  const allAccepted = consentData && consentTeleorientation && consentTerms;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg h-[90vh] flex flex-col overflow-hidden bg-white text-slate-900 border-slate-200 shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader className="flex-shrink-0">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-lg pt-2">
            Aviso Legal y Consentimiento Informado
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            Antes de continuar, es importante que conozcas y aceptes las condiciones de uso de este servicio.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="space-y-5 text-sm text-slate-700 leading-relaxed pb-2">

            <section>
              <h3 className="font-semibold text-slate-900 mb-1">
                1. Naturaleza del Servicio de Teleorientación
              </h3>
              <p>
                MyHomeDoctorApp ofrece un servicio de <strong>teleorientación en salud</strong> asistido
                por inteligencia artificial, conforme a la <strong>Resolución 2654 de 2019</strong> del
                Ministerio de Salud y Protección Social de Colombia. Este servicio:
              </p>
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>Brinda orientación, educación en salud, consejería y direccionamiento hacia centros de atención médica.</li>
                <li><strong>NO realiza diagnósticos definitivos</strong> de enfermedades.</li>
                <li><strong>NO formula ni prescribe medicamentos</strong> (conforme al Artículo 19 de la Resolución 2654, la prescripción está restringida exclusivamente a la telemedicina interactiva y la telexperticia).</li>
                <li><strong>NO ordena exámenes de laboratorio ni imágenes diagnósticas.</strong></li>
                <li><strong>NO reemplaza la consulta médica presencial</strong>, el examen físico ni los estudios paraclínicos.</li>
              </ul>
              <p className="mt-2">
                En caso de emergencia vital, debes acudir a urgencias o comunicarte con la línea <strong>123</strong>.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-900 mb-1">
                2. Protección de Datos Personales (Ley 1581 de 2012)
              </h3>
              <p>
                Al utilizar este servicio, recopilaremos datos sobre tu estado de salud y bienestar,
                los cuales son considerados <strong>datos sensibles</strong> bajo la legislación colombiana.
                En cumplimiento de la Ley 1581 de 2012 y sus decretos reglamentarios:
              </p>
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>Tus datos serán tratados únicamente con la finalidad de brindarte orientación en salud.</li>
                <li>No compartiremos tus datos con terceros sin tu autorización, salvo obligación legal.</li>
                <li>Tienes derecho a conocer, actualizar, rectificar y solicitar la supresión de tus datos personales.</li>
                <li>Puedes ejercer estos derechos contactándonos a través de los canales dispuestos en la aplicación.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-900 mb-1">
                3. Seguridad de la Información (Ley 527 de 1999)
              </h3>
              <p>
                En cumplimiento de la Ley 527 de 1999 y la Resolución 2654 de 2019, las comunicaciones
                dentro de esta plataforma viajan bajo protocolos seguros (HTTPS). Las sesiones de
                orientación quedan registradas como soporte del servicio, incluyendo fecha, hora,
                motivo de consulta y recomendaciones entregadas.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-900 mb-1">
                4. Derechos del Consumidor (Ley 1480 de 2011)
              </h3>
              <p>
                Esta aplicación <strong>no es un servicio de urgencias médicas</strong> ni reemplaza
                una consulta médica presencial. La información proporcionada tiene carácter
                exclusivamente orientativo y educativo. Si presentas una emergencia médica,
                acude inmediatamente al centro de atención más cercano o llama al <strong>123</strong>.
              </p>
            </section>

          </div>
        </ScrollArea>

        <div className="flex-shrink-0 space-y-3 border-t border-slate-200 pt-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="consent-data"
              checked={consentData}
              onCheckedChange={(checked) => setConsentData(checked === true)}
            />
            <Label htmlFor="consent-data" className="text-xs text-slate-800 leading-relaxed cursor-pointer">
              Autorizo expresamente el tratamiento de mis datos personales y sensibles de salud,
              conforme a la Ley 1581 de 2012.
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="consent-teleorientation"
              checked={consentTeleorientation}
              onCheckedChange={(checked) => setConsentTeleorientation(checked === true)}
            />
            <Label htmlFor="consent-teleorientation" className="text-xs text-slate-800 leading-relaxed cursor-pointer">
              Comprendo que este servicio es de teleorientación y educación en salud, NO reemplaza
              la consulta médica presencial, y NO realiza diagnósticos ni prescripciones médicas.
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="consent-terms"
              checked={consentTerms}
              onCheckedChange={(checked) => setConsentTerms(checked === true)}
            />
            <Label htmlFor="consent-terms" className="text-xs text-slate-800 leading-relaxed cursor-pointer">
              He leído y acepto los términos y condiciones de uso del servicio, incluyendo las
              disposiciones sobre seguridad de la información y derechos del consumidor.
            </Label>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            className="w-full"
            disabled={!allAccepted}
            onClick={onAccept}
          >
            Acepto y deseo continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
