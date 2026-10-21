import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AVISO_URGENCIAS } from '@/lib/textos-chat';

/**
 * Informe de una teleorientación, para llevar al médico.
 *
 * Regla de construcción, igual que en informe-salud-pdf.ts: **copia lo que pasó,
 * sin resumir ni interpretar nada**. El informe transcribe literalmente lo que
 * la persona escribió y lo que la Dra. Hilda respondió. No hay un segundo paso
 * de IA que resuma la consulta, a propósito:
 *  - un resumen generado sería texto clínico nuevo, que debe aprobar el médico;
 *  - y sería un punto más donde la IA puede inventar, justo en el documento que
 *    la persona le va a mostrar a un profesional.
 * Si algún día se quiere un resumen, es una decisión de producto aparte.
 *
 * Los textos fijos (títulos, aviso del pie) son texto clínico visible: cambiarlos
 * exige aprobación del fundador, como los de textos-chat.ts. Pendiente de su
 * visto bueno la frase AVISO_INFORME; AVISO_URGENCIAS ya está aprobado (14-sep-2026).
 */

const COLOR_ENCABEZADO: [number, number, number] = [11, 45, 91];
const MARGEN = 16;
const ANCHO_TEXTO = 178;

/** Pendiente de aprobación del fundador. */
export const AVISO_INFORME =
  'Este documento es un informe de teleorientación en salud. No es un diagnóstico, ni una fórmula médica, ni una orden de exámenes, y no reemplaza la consulta con un profesional.';

export type MensajeInforme = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
};

export type DatosInformeOrientacion = {
  integrante: {
    nombre: string;
    edad?: number;
    sexo?: string;
    aseguradora?: string;
    alergias?: string[];
    medicamentos?: string[];
  };
  /** Fecha en que se abrió la conversación. */
  fechaConsulta: Date;
  mensajes: MensajeInforme[];
};

function pieDePagina(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  const alto = doc.internal.pageSize.getHeight();

  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(220);
    doc.line(MARGEN, alto - 20, MARGEN + ANCHO_TEXTO, alto - 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    const aviso = doc.splitTextToSize(`${AVISO_INFORME} ${AVISO_URGENCIAS}`, ANCHO_TEXTO - 24);
    doc.text(aviso, MARGEN, alto - 15);
    doc.text(`${pagina} / ${total}`, MARGEN + ANCHO_TEXTO, alto - 15, { align: 'right' });

    doc.setFontSize(7);
    doc.text('MyHome DoctorApp · Desarrollado por Charis Integra', MARGEN, alto - 8);
    doc.setTextColor(0);
  }
}

export function construirInformeOrientacion(
  datos: DatosInformeOrientacion,
  generadoEl: Date = new Date()
): jsPDF {
  const { integrante, fechaConsulta, mensajes } = datos;
  const doc = new jsPDF();
  const alto = doc.internal.pageSize.getHeight();
  let y = 22;

  const saltarPaginaSiHaceFalta = (necesario: number) => {
    if (y + necesario < alto - 26) return;
    doc.addPage();
    y = 22;
  };

  // Encabezado
  doc.setFillColor(...COLOR_ENCABEZADO);
  doc.rect(0, 0, 210, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Informe de teleorientación', MARGEN, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `Consulta del ${format(fechaConsulta, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })} · Informe generado el ${format(generadoEl, "d/MM/yyyy 'a las' h:mm a", { locale: es })}`,
    MARGEN,
    y
  );
  doc.setTextColor(0);
  y += 11;

  // Quién consultó
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Quién consultó', MARGEN, y);
  y += 6;
  doc.setFontSize(10);

  const filas: [string, string][] = [['Nombre', integrante.nombre]];
  if (typeof integrante.edad === 'number') filas.push(['Edad', `${integrante.edad} años`]);
  if (integrante.sexo) filas.push(['Sexo', integrante.sexo]);
  if (integrante.aseguradora) filas.push(['EPS / aseguradora', integrante.aseguradora]);
  if (integrante.alergias?.length) filas.push(['Alergias', integrante.alergias.join(', ')]);
  if (integrante.medicamentos?.length) filas.push(['Medicamentos', integrante.medicamentos.join(', ')]);

  for (const [etiqueta, valor] of filas) {
    saltarPaginaSiHaceFalta(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`${etiqueta}:`, MARGEN, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(valor, ANCHO_TEXTO - 42);
    doc.text(lineas, MARGEN + 42, y);
    y += lineas.length * 5 + 1.5;
  }
  y += 6;

  // Conversación, literal
  saltarPaginaSiHaceFalta(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('La conversación, tal como ocurrió', MARGEN, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  doc.text('Transcripción completa, sin resumir.', MARGEN, y + 3.5);
  doc.setTextColor(0);
  y += 11;

  for (const mensaje of mensajes) {
    const quien = mensaje.role === 'user' ? integrante.nombre : 'Dra. Hilda';
    const hora = mensaje.timestamp ? format(mensaje.timestamp, 'h:mm a', { locale: es }) : '';
    const cuerpo = doc.splitTextToSize(mensaje.content.trim(), ANCHO_TEXTO - 4);

    saltarPaginaSiHaceFalta(cuerpo.length * 4.6 + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    if (mensaje.role === 'assistant') doc.setTextColor(...COLOR_ENCABEZADO);
    doc.text(hora ? `${quien} · ${hora}` : quien, MARGEN, y);
    doc.setTextColor(0);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(cuerpo, MARGEN + 4, y);
    y += cuerpo.length * 4.6 + 6;
  }

  pieDePagina(doc);
  return doc;
}

export function nombreArchivoOrientacion(nombre: string, fechaConsulta: Date): string {
  const limpio = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `orientacion-${limpio || 'consulta'}-${format(fechaConsulta, 'yyyy-MM-dd')}.pdf`;
}
