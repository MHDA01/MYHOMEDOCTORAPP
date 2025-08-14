
'use client';

import React, { useContext } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import type { Document as DocumentType } from '@/lib/types';

const calculateAge = (dob: Date | undefined): string => {
    if (!dob || !isValid(dob)) return 'N/A';
    return `${differenceInYears(new Date(), dob)} años`;
};

const formatDate = (date: Date | undefined): string => {
    if (!date || !isValid(date)) return 'N/A';
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

const getCategoryLabel = (category: DocumentType['category']) => {
    switch (category) {
        case 'Lab Result': return 'Resultado de Laboratorio';
        case 'Imaging Report': return 'Informe de Imagen';
        case 'Prescription': return 'Receta';
        case 'Other': return 'Otro';
        default: return category;
    }
};

const countryHealthData: { [key: string]: { label: string } } = {
    argentina: { label: 'Obra Social' },
    colombia: { label: 'Seguridad Social' },
    chile: { label: 'Previsión' },
};

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export function DownloadReportButton() {
    const context = useContext(UserContext);
    const [isGenerating, setIsGenerating] = React.useState(false);

    const generatePdf = async () => {
        if (!context || !context.personalInfo || !context.healthInfo) return;
        setIsGenerating(true);

        const { personalInfo, healthInfo, appointments, documents, medications } = context;
        
        const doc = new jsPDF('p', 'pt', 'letter');
        const primaryColor = '#1F4E79'; 
        const textColor = '#444444';
        const pageMargin = 50; 
        const pageWidth = doc.internal.pageSize.getWidth();
        let currentY = 0;

        const addHeader = (docInstance: jsPDF) => {
            const logoUrl = 'https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png';
            const logoWidth = 120; 
            const logoHeight = 90;
            docInstance.addImage(logoUrl, 'PNG', pageMargin, 40, logoWidth, logoHeight);
            docInstance.setFont('helvetica', 'bold');
            docInstance.setFontSize(24);
            docInstance.setTextColor(primaryColor);
            docInstance.text('Resumen de Salud', pageWidth - pageMargin, 85, { align: 'right' });
            docInstance.setFont('helvetica', 'normal');
            docInstance.setFontSize(10);
            docInstance.setTextColor(textColor);
            docInstance.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - pageMargin, 100, { align: 'right' });
            docInstance.setDrawColor('#E5E7EB');
            docInstance.line(pageMargin, 140, pageWidth - pageMargin, 140);
            currentY = 160;
        };

        const addSectionHeader = (title: string, yPos: number) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor('#FFFFFF');
            doc.setFillColor(primaryColor);
            doc.rect(pageMargin, yPos, pageWidth - (pageMargin * 2), 24, 'F');
            doc.text(title, pageMargin + 10, yPos + 16);
            return yPos + 34;
        };
        
        addHeader(doc);
        
        // --- 1. Información Personal ---
        currentY = addSectionHeader('1. Información Personal', currentY);
        (doc as any).autoTable({
            startY: currentY,
            theme: 'plain',
            body: [
                ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
                ['Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`],
                ['Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'],
                ['País:', personalInfo.country.charAt(0).toUpperCase() + personalInfo.country.slice(1)],
                [`${countryHealthData[personalInfo.country]?.label || 'Previsión'}:`, `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`],
            ],
            styles: { cellPadding: { top: 4, right: 2, bottom: 4, left: 2 }, fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold' } }
        });
        currentY = doc.lastAutoTable.finalY + 10;
        
        // --- 2. Contactos de Emergencia ---
        if (healthInfo.emergencyContacts.length > 0) {
            currentY = addSectionHeader('2. Contactos de Emergencia', currentY);
            doc.autoTable({
                startY: currentY,
                head: [['Nombre', 'Relación', 'Teléfono']],
                body: healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone]),
            });
            currentY = doc.lastAutoTable.finalY + 10;
        }

        // --- 3. Historial Médico ---
        currentY = addSectionHeader('3. Historial Médico', currentY);
        const healthHistoryBody = [
            ['Alergias:', healthInfo.allergies.length > 0 ? healthInfo.allergies.join(', ') : 'No registradas'],
            ['Medicamentos Frecuentes:', healthInfo.medications.length > 0 ? healthInfo.medications.join(', ') : 'No registrados'],
            ['Antecedentes Patológicos:', healthInfo.pathologicalHistory || 'No registrados'],
            ['Antecedentes Quirúrgicos:', healthInfo.surgicalHistory || 'No registrados'],
        ];
        if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
            healthHistoryBody.push(['Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory]);
        }
        doc.autoTable({
            startY: currentY,
            theme: 'plain',
            body: healthHistoryBody,
            styles: { cellPadding: { top: 4, right: 2, bottom: 4, left: 2 }, fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold' } },
            didParseCell: (data: any) => {
                if(data.column.index === 0) data.cell.styles.cellWidth = 140;
            }
        });
        currentY = doc.lastAutoTable.finalY + 10;

        // --- 4. Próximas Citas Médicas ---
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= new Date());
        if (upcomingAppointments.length > 0) {
            currentY = addSectionHeader('4. Próximas Citas Médicas', currentY);
            doc.autoTable({
                startY: currentY,
                head: [['Fecha', 'Hora', 'Doctor', 'Especialidad']],
                body: upcomingAppointments.map(a => [format(new Date(a.date), 'dd/MM/yyyy'), format(new Date(a.date), 'HH:mm'), a.doctor, a.specialty]),
            });
            currentY = doc.lastAutoTable.finalY + 10;
        }

        // --- 5. Medicamentos Activos ---
        const activeMedications = medications.filter(m => m.active);
        if (activeMedications.length > 0) {
            currentY = addSectionHeader('5. Medicamentos Activos', currentY);
            doc.autoTable({
                startY: currentY,
                head: [['Medicamento', 'Dosis', 'Frecuencia', 'Horarios']],
                body: activeMedications.map(m => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')]),
            });
            currentY = doc.lastAutoTable.finalY + 10;
        }

        // --- 6. Documentos Médicos y Resúmenes ---
        if (documents.length > 0) {
            currentY = addSectionHeader('6. Documentos Médicos', currentY);
            const documentsBody = [];
            for (const docItem of documents) {
                documentsBody.push([
                    { content: docItem.name, styles: { fontStyle: 'bold' } },
                    getCategoryLabel(docItem.category),
                    formatDate(docItem.studyDate || docItem.uploadedAt)
                ]);

                if (docItem.aiSummary) {
                    const hallazgos = Array.isArray(docItem.aiSummary.hallazgosClave) ? docItem.aiSummary.hallazgosClave : [];
                    const recomendaciones = Array.isArray(docItem.aiSummary.recomendaciones) ? docItem.aiSummary.recomendaciones : [];

                    documentsBody.push([{
                        content: `Diagnóstico: ${docItem.aiSummary.diagnosticoPrincipal || 'No registrado'}`,
                        colSpan: 3,
                        styles: { fillColor: [240, 240, 240], textColor: 50, fontSize: 9, cellPadding: { top: 3, left: 10 } }
                    }]);
                    documentsBody.push([{
                        content: `Hallazgos: ${hallazgos.join('; ')}`,
                        colSpan: 3,
                        styles: { fillColor: [240, 240, 240], textColor: 50, fontSize: 9, cellPadding: { left: 10 } }
                    }]);
                    documentsBody.push([{
                        content: `Recomendaciones: ${recomendaciones.join('; ')}`,
                        colSpan: 3,
                        styles: { fillColor: [240, 240, 240], textColor: 50, fontSize: 9, cellPadding: { bottom: 3, left: 10 } }
                    }]);
                }
            }
            doc.autoTable({
                startY: currentY,
                head: [['Documento', 'Categoría', 'Fecha de Estudio']],
                body: documentsBody,
            });
        }
        
        doc.save(`resumen_salud_${personalInfo.firstName.toLowerCase()}_${personalInfo.lastName.toLowerCase()}.pdf`);
        setIsGenerating(false);
    };


    return (
        <Button
            variant="ghost"
            className="w-full justify-start gap-2 p-2"
            onClick={generatePdf}
            disabled={isGenerating}
        >
            {isGenerating ? <Loader2 className="animate-spin" /> : <FileDown />}
            <span>{isGenerating ? 'Generando...' : 'Generar Informe'}</span>
        </Button>
    )
}

    