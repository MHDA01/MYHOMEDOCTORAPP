
'use client';

import React, { useContext } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import type { Summary } from '@/lib/types';

const calculateAge = (dob: Date | undefined): string => {
    if (!dob || !isValid(dob)) return 'N/A';
    return `${differenceInYears(new Date(), dob)} años`;
};

const formatDate = (date: Date | undefined): string => {
    if (!date || !isValid(date)) return 'N/A';
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

const countryHealthData: { [key: string]: { label: string } } = {
    argentina: { label: 'Obra Social' },
    colombia: { label: 'Seguridad Social' },
    chile: { label: 'Previsión' },
};

const addSummaryToPdf = (doc: jsPDF, summary: Summary, startY: number): number => {
    const pageContentWidth = doc.internal.pageSize.getWidth() - 100;
    let currentY = startY;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor('#6b7280');
    doc.text('Resumen de Estudios (IA)', 50, currentY);
    currentY += 8;

    doc.setDrawColor('#e5e7eb');
    doc.setLineWidth(0.5);
    doc.line(50, currentY, doc.internal.pageSize.getWidth() - 50, currentY);
    currentY += 15;

    const addSummarySection = (title: string, content: string | string[]) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor('#374151');
        doc.text(title, 55, currentY);
        currentY += 14;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor('#444444');
        if (Array.isArray(content)) {
            content.forEach(item => {
                const splitItem = doc.splitTextToSize(`• ${item}`, pageContentWidth - 10);
                doc.text(splitItem, 60, currentY);
                currentY += (splitItem.length * 12);
            });
        } else {
            const splitContent = doc.splitTextToSize(content, pageContentWidth - 5);
            doc.text(splitContent, 55, currentY);
            currentY += (splitContent.length * 12);
        }
        currentY += 8;
    };

    if (summary.diagnosticoPrincipal) {
        addSummarySection('Diagnóstico Principal:', summary.diagnosticoPrincipal);
    }
    if (summary.hallazgosClave && summary.hallazgosClave.length > 0) {
        addSummarySection('Hallazgos Clave:', summary.hallazgosClave);
    }
    if (summary.recomendaciones && summary.recomendaciones.length > 0) {
        addSummarySection('Recomendaciones:', summary.recomendaciones);
    }

    return currentY + 10;
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
        const pageContentWidth = pageWidth - pageMargin * 2;
        let y = 0;

        const addHeader = () => {
            const logoUrl = 'https://i.postimg.cc/J7N5r89y/LOGO-1.png';
            const logoWidth = 157; 
            const logoHeight = 117.75; 
            
            doc.addImage(logoUrl, 'PNG', pageMargin, 40, logoWidth, logoHeight);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(24);
            doc.setTextColor(primaryColor);
            doc.text('Resumen de Salud', pageWidth - pageMargin, 85, { align: 'right' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(textColor);
            doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - pageMargin, 100, { align: 'right' });

            doc.setDrawColor('#E5E7EB');
            doc.line(pageMargin, 160, pageWidth - pageMargin, 160);
            y = 180;
        };
        
        const addSectionHeader = (title: string) => {
            if (y > doc.internal.pageSize.getHeight() - 120) {
                doc.addPage();
                addHeader();
            }
            const barHeight = 28;
            doc.setFillColor(primaryColor);
            doc.rect(pageMargin, y, pageContentWidth, barHeight, 'F');
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#FFFFFF');
            doc.text(title, pageMargin + 15, y + 18);
            y += barHeight + 20;
        }

        addHeader();

        addSectionHeader('1. Información Personal');
        doc.setFont('helvetica', 'normal');

        const healthProviderLabel = countryHealthData[personalInfo.country]?.label || 'Previsión';

        autoTable(doc, {
            startY: y,
            body: [
                ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
                ['Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`],
                ['Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'],
                ['País:', personalInfo.country.charAt(0).toUpperCase() + personalInfo.country.slice(1)],
                [`${healthProviderLabel}:`, `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`],
            ],
            theme: 'plain',
            styles: { cellPadding: { top: 6, right: 4, bottom: 6, left: 2}, fontSize: 11, font: 'helvetica', textColor: textColor },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
            margin: { left: pageMargin }
        });
        y = (doc as any).lastAutoTable.finalY + 30;

        if(healthInfo.emergencyContacts.length > 0) {
            addSectionHeader('2. Contactos de Emergencia');
            autoTable(doc, {
                startY: y,
                head: [['Nombre', 'Relación', 'Teléfono']],
                body: healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold', font: 'helvetica', fontSize: 12 },
                styles: { fontSize: 11, font: 'helvetica', textColor: textColor },
                margin: { left: pageMargin, right: pageMargin }
            });
            y = (doc as any).lastAutoTable.finalY + 30;
        }

        addSectionHeader('3. Historial Médico');
        const addHealthInfoSection = (title: string, content: string | string[]) => {
            const text = Array.isArray(content) ? content.join(', ') : content;
            if (!text) return;
            
            if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); addHeader(); }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(textColor);
            doc.text(title, pageMargin, y);
            y += 20;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const splitText = doc.splitTextToSize(text, pageContentWidth);
            doc.text(splitText, pageMargin, y);
            y += (splitText.length * 14) + 15;
        }

        addHealthInfoSection('Alergias:', healthInfo.allergies.length > 0 ? healthInfo.allergies.join(', ') : 'No registradas');
        addHealthInfoSection('Medicamentos Frecuentes:', healthInfo.medications.length > 0 ? healthInfo.medications.join(', ') : 'No registrados');
        addHealthInfoSection('Antecedentes Patológicos:', healthInfo.pathologicalHistory || 'No registrados');
        addHealthInfoSection('Antecedentes Quirúrgicos:', healthInfo.surgicalHistory || 'No registrados');
        if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
            addHealthInfoSection('Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory);
        }
        y += 10;
        
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= new Date());
        
        const addTableSection = (title: string, head: any, body: any) => {
             if (body.length === 0) return;
             if (y > doc.internal.pageSize.getHeight() - 150) { doc.addPage(); addHeader(); }
             addSectionHeader(title);
             autoTable(doc, {
                 startY: y,
                 head, body,
                 theme: 'striped',
                 headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold', font: 'helvetica', fontSize: 12 },
                 styles: { fontSize: 11, font: 'helvetica', textColor: textColor },
                 margin: { left: pageMargin, right: pageMargin }
             });
             y = (doc as any).lastAutoTable.finalY + 30;
        };

        addTableSection('4. Próximas Citas Médicas',
            [['Fecha', 'Hora', 'Doctor', 'Especialidad']],
            upcomingAppointments.map(a => [format(new Date(a.date), 'dd/MM/yyyy'), format(new Date(a.date), 'HH:mm'), a.doctor, a.specialty])
        );

        addTableSection('5. Medicamentos Activos',
            [['Medicamento', 'Dosis', 'Frecuencia', 'Horarios']],
            medications.filter(m => m.active).map(m => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')])
        );

         if (documents.length > 0) {
            if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); addHeader(); }
            addSectionHeader('6. Documentos');
            const sortedDocuments = [...documents].sort((a,b) => (new Date(b.studyDate || b.uploadedAt)).getTime() - (new Date(a.studyDate || a.uploadedAt)).getTime());
            
            autoTable(doc, {
                startY: y,
                head: [['Documento', 'Categoría', 'Fecha del Estudio']],
                body: sortedDocuments.map(d => [d.name, d.category, formatDate(new Date(d.studyDate || d.uploadedAt))]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold', font: 'helvetica', fontSize: 12 },
                styles: { fontSize: 11, font: 'helvetica', textColor: textColor },
                margin: { left: pageMargin, right: pageMargin },
                didDrawCell: (data) => {
                    // Check if we are in the body of the table
                    if (data.section === 'body') {
                        const docId = sortedDocuments[data.row.index].id;
                        const documentData = documents.find(d => d.id === docId);

                        if (documentData && documentData.aiSummary) {
                            // We need to draw the summary *after* the table has been fully drawn.
                            // We store the information and draw it in didDrawPage.
                            (doc as any).summaryToDraw = (doc as any).summaryToDraw || [];
                            (doc as any).summaryToDraw.push({
                                summary: documentData.aiSummary,
                                y: data.cell.y + data.cell.height + 10
                            });
                        }
                    }
                },
                 didDrawPage: (data) => {
                     if ((doc as any).summaryToDraw) {
                         let currentY = (doc as any).lastAutoTable.finalY + 20;
                         
                         const docWithSummaryId = sortedDocuments[data.row.index].id;
                         const documentData = documents.find(d => d.id === docWithSummaryId);

                         if (documentData && documentData.aiSummary) {
                            currentY = addSummaryToPdf(doc, documentData.aiSummary, currentY);
                         }

                         (doc as any).lastAutoTable.finalY = currentY;
                         delete (doc as any).summaryToDraw;
                     }
                 }
            });
            y = (doc as any).lastAutoTable.finalY + 30;
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
