// ============================================================
// components/chat/CierreOrientacion.tsx
// Tarjeta que cierra la consulta: el informe para llevar al médico.
// ============================================================
'use client';

import { useCallback, useState } from 'react';
import { Download, FileText, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  construirInformeOrientacion,
  nombreArchivoOrientacion,
  type DatosInformeOrientacion,
} from '@/lib/informe-orientacion-pdf';

/**
 * Aparece cuando la orientación termina. Es el desenlace de la consulta: la
 * persona se lleva un documento, en vez de quedarse solo con el chat.
 *
 * El PDF se arma en el navegador con los mensajes que ya están en pantalla; no
 * se sube a ningún lado ni pasa por el servidor.
 */

interface CierreOrientacionProps {
  datos: DatosInformeOrientacion;
}

export default function CierreOrientacion({ datos }: CierreOrientacionProps) {
  const [ocupado, setOcupado] = useState<'descargar' | 'compartir' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const nombreArchivo = nombreArchivoOrientacion(datos.integrante.nombre, datos.fechaConsulta);

  const descargar = useCallback(() => {
    setOcupado('descargar');
    setAviso(null);
    try {
      construirInformeOrientacion(datos).save(nombreArchivo);
    } catch {
      setAviso('No pude generar el informe. Intenta de nuevo.');
    } finally {
      setOcupado(null);
    }
  }, [datos, nombreArchivo]);

  const compartir = useCallback(async () => {
    setOcupado('compartir');
    setAviso(null);
    try {
      const pdf = construirInformeOrientacion(datos);
      const archivo = new File([pdf.output('blob')], nombreArchivo, { type: 'application/pdf' });

      // En el celular, compartir el archivo directo a WhatsApp. Si el navegador
      // no sabe compartir archivos (caso típico en computador), se descarga el
      // PDF y se abre WhatsApp con el mensaje: la persona adjunta el archivo.
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: 'Informe de teleorientación' });
        return;
      }

      pdf.save(nombreArchivo);
      const texto = encodeURIComponent(
        `Te comparto el informe de mi orientación en salud en MyHome DoctorApp. El archivo es ${nombreArchivo}, lo adjunto enseguida.`
      );
      window.open(`https://wa.me/?text=${texto}`, '_blank', 'noopener,noreferrer');
      setAviso('Descargué el informe y abrí WhatsApp: adjunta el archivo en la conversación.');
    } catch (error) {
      // Cancelar el menú de compartir no es un error que haya que mostrar.
      if ((error as DOMException)?.name === 'AbortError') return;
      setAviso('No pude compartir el informe. Puedes descargarlo y enviarlo tú.');
    } finally {
      setOcupado(null);
    }
  }, [datos, nombreArchivo]);

  return (
    <section
      aria-label="Informe de la consulta"
      className="my-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <FileText className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-brand-900">Tu informe está listo</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Guarda lo que hablamos y llévalo a tu consulta médica. Incluye los datos de{' '}
            {datos.integrante.nombre} y la conversación completa, sin resumir.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={descargar} disabled={ocupado !== null} className="sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          {ocupado === 'descargar' ? 'Generando...' : 'Descargar informe'}
        </Button>
        <Button
          onClick={compartir}
          disabled={ocupado !== null}
          variant="outline"
          className="sm:w-auto"
        >
          <Share2 className="mr-2 h-4 w-4" />
          {ocupado === 'compartir' ? 'Preparando...' : 'Enviar por WhatsApp'}
        </Button>
      </div>

      {aviso && (
        <p role="status" className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {aviso}
        </p>
      )}
    </section>
  );
}
