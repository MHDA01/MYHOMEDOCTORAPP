import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Informe de salud en PDF: copia lo que la persona registró, sin resumir ni
 * interpretar nada.
 *
 * El dibujo es el mismo del botón "Generar Informe" que existió hasta junio de
 * 2026 (download-report-button.tsx). Correcciones aprobadas por el fundador el
 * 15-sep-2026:
 * - El sexo se leía solo como 'male'/'female', pero los integrantes de la
 *   familia se guardan como 'm'/'f': todos salían "Indeterminado".
 * - "Previsión" (término chileno) pasa a "EPS / aseguradora".
 */

export type DatosInformeSalud = {
  personalInfo: {
    firstName: string;
    lastName: string;
    sex?: string;
    dateOfBirth?: Date;
    insuranceProvider?: string;
    insuranceProviderName?: string;
  };
  healthInfo: {
    allergies?: string[];
    medications?: string[];
    pathologicalHistory?: string;
    surgicalHistory?: string;
    gynecologicalHistory?: string;
  };
  appointments: { date: Date; doctor: string; specialty: string }[];
  medications: { name: string; dosage: string; frequency: number; time: string[]; active: boolean }[];
  documents: { uploadedAt?: Date; name: string; category: string }[];
};

const COLOR_ENCABEZADO: [number, number, number] = [35, 87, 124];

export function etiquetaSexo(sex: string | undefined): 'Masculino' | 'Femenino' | 'Indeterminado' {
  const valor = (sex ?? '').toLowerCase();
  if (valor === 'male' || valor === 'm') return 'Masculino';
  if (valor === 'female' || valor === 'f') return 'Femenino';
  return 'Indeterminado';
}

const calcularEdad = (fecha: Date | undefined): string => {
  if (!fecha || !isValid(fecha)) return 'N/A';
  return `${differenceInYears(new Date(), fecha)} años`;
};

const formatearFecha = (fecha: Date | undefined): string => {
  if (!fecha || !isValid(fecha)) return 'N/A';
  return format(fecha, "d 'de' MMMM 'de' yyyy", { locale: es });
};

export function construirInformeSalud(datos: DatosInformeSalud, generadoEl: Date = new Date()): jsPDF {
  const { personalInfo, healthInfo, appointments, documents, medications } = datos;
  const doc = new jsPDF();

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Resumen de Salud', 105, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado el: ${format(generadoEl, 'PPpp', { locale: es })}`, 105, 28, { align: 'center' });

  let y = 40;

  // 1. Información personal
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Información Personal', 14, y);
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const aseguradora = `${personalInfo.insuranceProvider ?? ''}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`;
  autoTable(doc, {
    startY: y,
    body: [
      ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
      ['Fecha de Nacimiento:', `${formatearFecha(personalInfo.dateOfBirth)} (${calcularEdad(personalInfo.dateOfBirth)})`],
      ['Sexo:', etiquetaSexo(personalInfo.sex)],
      ['EPS / aseguradora:', aseguradora],
    ],
    theme: 'plain',
    styles: { cellPadding: 1.5, fontSize: 11 },
    columnStyles: { 0: { fontStyle: 'bold' } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // 2. Resumen clínico
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Resumen Clínico', 14, y);
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');

  const agregarSeccion = (titulo: string, contenido: string | string[] | undefined) => {
    if (!contenido || (Array.isArray(contenido) && contenido.length === 0)) return;
    doc.setFont('helvetica', 'bold');
    doc.text(titulo, 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const texto = Array.isArray(contenido) ? contenido.join(', ') : contenido;
    const lineas = doc.splitTextToSize(texto, 180);
    doc.text(lineas, 14, y);
    y += lineas.length * 5 + 4;
  };

  agregarSeccion('Alergias:', healthInfo.allergies);
  agregarSeccion('Medicamentos Frecuentes:', healthInfo.medications);
  agregarSeccion('Antecedentes Patológicos:', healthInfo.pathologicalHistory);
  agregarSeccion('Antecedentes Quirúrgicos:', healthInfo.surgicalHistory);
  if (etiquetaSexo(personalInfo.sex) === 'Femenino' && healthInfo.gynecologicalHistory) {
    agregarSeccion('Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory);
  }

  y = (doc as any).lastAutoTable?.finalY + 10 > y ? (doc as any).lastAutoTable.finalY + 10 : y;

  // 3. Citas
  if (appointments.length > 0) {
    doc.addPage();
    y = 20;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Citas Médicas', 14, y);
    y += 8;
    const ordenadas = [...appointments].sort((a, b) => b.date.getTime() - a.date.getTime());
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Hora', 'Doctor', 'Especialidad']],
      body: ordenadas.map((a) => [format(a.date, 'd/MM/yyyy'), format(a.date, 'HH:mm'), a.doctor, a.specialty]),
      theme: 'striped',
      headStyles: { fillColor: COLOR_ENCABEZADO },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // 4. Medicamentos
  if (medications.length > 0) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Medicamentos y Recordatorios', 14, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['Medicamento', 'Dosis', 'Frecuencia', 'Horarios']],
      body: medications.filter((m) => m.active).map((m) => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')]),
      theme: 'striped',
      headStyles: { fillColor: COLOR_ENCABEZADO },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // 5. Documentos
  if (documents.length > 0) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('5. Documentos', 14, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['Fecha de Carga', 'Nombre', 'Categoría']],
      body: documents.map((d) => [formatearFecha(d.uploadedAt), d.name, d.category]),
      theme: 'striped',
      headStyles: { fillColor: COLOR_ENCABEZADO },
    });
  }

  return doc;
}

export function nombreArchivoInforme(personalInfo: DatosInformeSalud['personalInfo']): string {
  return `resumen_salud_${personalInfo.firstName.toLowerCase()}_${personalInfo.lastName.toLowerCase()}.pdf`;
}
