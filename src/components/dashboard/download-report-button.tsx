
'use client';

import React, { useContext } from 'react';
import jsPDF, { CellHookData } from 'jspdf';
import 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import type { Document as DocumentType } from '@/lib/types';

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}


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
        
        doc.setFont('helvetica', 'normal');

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
            return 160;
        };

        currentY = addHeader(doc);
        
        // --- 1. Información Personal ---
        doc.autoTable({
            startY: currentY + 10,
            head: [['1. Información Personal']],
            body: [
                ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
                ['Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`],
                ['Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'],
                ['País:', personalInfo.country.charAt(0).toUpperCase() + personalInfo.country.slice(1)],
                [`${countryHealthData[personalInfo.country]?.label || 'Previsión'}:`, `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`],
            ],
            theme: 'grid',
            headStyles: { fillColor: primaryColor },
            styles: { font: 'helvetica', fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 } },
            didDrawPage: (data) => { currentY = data.cursor?.y || currentY; }
        });
        
        // --- 2. Contactos de Emergencia ---
        if (healthInfo.emergencyContacts.length > 0) {
            doc.autoTable({
                startY: currentY + 10,
                head: [['2. Contactos de Emergencia', '', '']],
                body: healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone]),
                columns: [{ header: 'Nombre' }, { header: 'Relación' }, { header: 'Teléfono' }],
                theme: 'striped',
                headStyles: { fillColor: primaryColor },
                didDrawPage: (data) => { currentY = data.cursor?.y || currentY; }
            });
        }

        // --- 3. Historial Médico ---
         const healthHistoryBody = [
            ['Alergias:', healthInfo.allergies.length > 0 ? healthInfo.allergies.join(', ') : 'No registradas'],
            ['Medicamentos Frecuentes:', healthInfo.medications.length > 0 ? healthInfo.medications.join(', ') : 'No registrados'],
            ['Antecedentes Patológicos:', healthInfo.pathologicalHistory || 'No registrados'],
            ['Antecedentes Quirúrgicos:', healthInfo.surgicalHistory || 'No registrados'],
        ];
        if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
            healthHistoryBody.push(['Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory || 'No registrados']);
        }

        doc.autoTable({
            startY: currentY + 10,
            head: [['3. Historial Médico']],
            body: healthHistoryBody,
            theme: 'grid',
            headStyles: { fillColor: primaryColor },
            styles: { font: 'helvetica', fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 } },
            didDrawPage: (data) => { currentY = data.cursor?.y || currentY; }
        });
        

        // --- 4. Próximas Citas Médicas ---
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= new Date());
        if (upcomingAppointments.length > 0) {
            doc.autoTable({
                startY: currentY + 10,
                head: [['4. Próximas Citas Médicas', '', '', '']],
                columns: [{ header: 'Fecha' }, { header: 'Hora' }, { header: 'Doctor' }, { header: 'Especialidad' }],
                body: upcomingAppointments.map(a => [format(new Date(a.date), 'dd/MM/yyyy'), format(new Date(a.date), 'HH:mm'), a.doctor, a.specialty]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor },
                didDrawPage: (data) => { currentY = data.cursor?.y || currentY; }
            });
        }

        // --- 5. Medicamentos Activos ---
        const activeMedications = medications.filter(m => m.active);
        if (activeMedications.length > 0) {
            doc.autoTable({
                startY: currentY + 10,
                head: [['5. Medicamentos Activos', '', '', '']],
                columns: [{ header: 'Medicamento' }, { header: 'Dosis' }, { header: 'Frecuencia' }, { header: 'Horarios' }],
                body: activeMedications.map(m => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor },
                didDrawPage: (data) => { currentY = data.cursor?.y || currentY; }
            });
        }

        // --- 6. Documentos Médicos y Resúmenes ---
        if (documents.length > 0) {
            const documentsBody = documents.flatMap(docItem => {
                const mainRow: (string | { content: string, colSpan: number, styles: any })[] = [docItem.name, getCategoryLabel(docItem.category), formatDate(docItem.studyDate || docItem.uploadedAt)];
                const summaryRows = [];

                if (docItem.aiSummary) {
                    const diagnostico = docItem.aiSummary.diagnosticoPrincipal || 'No registrado';
                    const hallazgos = (Array.isArray(docItem.aiSummary.hallazgosClave) && docItem.aiSummary.hallazgosClave.length > 0) 
                        ? docItem.aiSummary.hallazgosClave.join('; ') 
                        : 'No registrados';
                    const recomendaciones = (Array.isArray(docItem.aiSummary.recomendaciones) && docItem.aiSummary.recomendaciones.length > 0) 
                        ? docItem.aiSummary.recomendaciones.join('; ') 
                        : 'No registradas';

                    summaryRows.push([{ content: `Diagnóstico: ${diagnostico}`, colSpan: 3, styles: { fillColor: [240, 240, 240], textColor: 50, fontSize: 9, cellPadding: { left: 10 } } }]);
                    summaryRows.push([{ content: `Hallazgos: ${hallazgos}`, colSpan: 3, styles: { fillColor: [240, 240, 240], textColor: 50, fontSize: 9, cellPadding: { left: 10 } } }]);
                    summaryRows.push([{ content: `Recomendaciones: ${recomendaciones}`, colSpan: 3, styles: { fillColor: [240, 240, 240], textColor: 50, fontSize: 9, cellPadding: { left: 10 } } }]);
                }
                return [mainRow, ...summaryRows];
            });

            doc.autoTable({
                startY: currentY + 10,
                head: [['6. Documentos Médicos', '', '']],
                columns: [{ header: 'Documento' }, { header: 'Categoría' }, { header: 'Fecha de Estudio' }],
                body: documentsBody,
                theme: 'striped',
                headStyles: { fillColor: primaryColor },
                didDrawPage: (data) => { currentY = data.cursor?.y || currentY; }
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
