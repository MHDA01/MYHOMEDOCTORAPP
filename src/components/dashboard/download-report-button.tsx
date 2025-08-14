
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

const addSummaryToPdf = (doc: jsPDF, summary: Summary, documentName: string): void => {
    const addSection = (title: string, content: string | string[]) => {
        if (!content || (Array.isArray(content) && content.length === 0)) {
            return;
        }

        autoTable(doc, {
            body: [[title]],
            theme: 'plain',
            styles: {
                font: 'helvetica',
                fontStyle: 'bold',
                fontSize: 10,
                textColor: '#374151',
                cellPadding: { top: 2, bottom: 2, left: 5 }
            },
            margin: { left: 55 }
        });

        const bodyContent = Array.isArray(content)
            ? content.map(item => [`• ${item}`])
            : [[content]];

        autoTable(doc, {
            body: bodyContent,
            theme: 'plain',
            styles: {
                font: 'helvetica',
                fontSize: 10,
                textColor: '#444444',
                cellPadding: { top: 0, bottom: 2, left: 10 }
            },
            margin: { left: 60 }
        });
    };
    
    autoTable(doc, {
      body: [[`Resumen de Estudios para: "${documentName}"`]],
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontStyle: 'bold',
        fontSize: 11,
        textColor: '#6b7280',
        cellPadding: { bottom: 2, top: 4 }
      },
      didDrawPage: (data) => {
        const pageContentWidth = doc.internal.pageSize.getWidth();
        doc.setDrawColor('#e5e7eb');
        doc.setLineWidth(0.5);
        doc.line(50, data.cursor.y, pageContentWidth - 50, data.cursor.y);
      },
      margin: { top: (doc as any).lastAutoTable.finalY + 15, left: 50 },
    });

    addSection('Diagnóstico Principal:', summary.diagnosticoPrincipal);
    addSection('Hallazgos Clave:', summary.hallazgosClave);
    addSection('Recomendaciones:', summary.recomendaciones);
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

        const addHeader = (docInstance: jsPDF) => {
            const logoUrl = 'https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png';
            const logoWidth = 157; 
            const logoHeight = 117.75; 
            
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
            docInstance.line(pageMargin, 160, pageWidth - pageMargin, 160);
        };
        
        const addSectionHeader = (title: string) => {
            autoTable(doc, {
                body: [[title]],
                theme: 'plain',
                styles: {
                    fillColor: primaryColor,
                    textColor: '#FFFFFF',
                    font: 'helvetica',
                    fontStyle: 'bold',
                    fontSize: 14,
                    halign: 'left',
                    cellPadding: { top: 8, bottom: 8, left: 15 },
                },
                margin: { top: (doc as any).lastAutoTable.finalY + 15, left: pageMargin, right: pageMargin },
            });
        }

        addHeader(doc);

        addSectionHeader('1. Información Personal');
        doc.setFont('helvetica', 'normal');

        const healthProviderLabel = countryHealthData[personalInfo.country]?.label || 'Previsión';

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
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
        
        if(healthInfo.emergencyContacts.length > 0) {
            addSectionHeader('2. Contactos de Emergencia');
            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY + 10,
                head: [['Nombre', 'Relación', 'Teléfono']],
                body: healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold', font: 'helvetica', fontSize: 12 },
                styles: { fontSize: 11, font: 'helvetica', textColor: textColor },
                margin: { left: pageMargin, right: pageMargin }
            });
        }

        addSectionHeader('3. Historial Médico');
        const addHealthInfoSection = (title: string, content: string | string[]) => {
            const text = Array.isArray(content) ? content.join(', ') : content;
            if (!text || text === 'No registrados') return;
            
            autoTable(doc, {
                body: [
                  [{ content: title, styles: { fontStyle: 'bold', fontSize: 12 } }],
                  [{ content: text, styles: { fontSize: 11 } }]
                ],
                theme: 'plain',
                styles: { textColor: textColor, cellPadding: { top: 2, bottom: 2, left: 5 }},
                startY: (doc as any).lastAutoTable.finalY + 10,
                margin: { left: pageMargin }
            });
        }

        addHealthInfoSection('Alergias:', healthInfo.allergies.length > 0 ? healthInfo.allergies.join(', ') : 'No registradas');
        addHealthInfoSection('Medicamentos Frecuentes:', healthInfo.medications.length > 0 ? healthInfo.medications.join(', ') : 'No registrados');
        addHealthInfoSection('Antecedentes Patológicos:', healthInfo.pathologicalHistory || 'No registrados');
        addHealthInfoSection('Antecedentes Quirúrgicos:', healthInfo.surgicalHistory || 'No registrados');
        if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
            addHealthInfoSection('Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory);
        }
        
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= new Date());
        
        const addTableSection = (title: string, head: any, body: any) => {
             if (body.length === 0) return;
             addSectionHeader(title);
             autoTable(doc, {
                 startY: (doc as any).lastAutoTable.finalY + 10,
                 head, body,
                 theme: 'striped',
                 headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold', font: 'helvetica', fontSize: 12 },
                 styles: { fontSize: 11, font: 'helvetica', textColor: textColor },
                 margin: { left: pageMargin, right: pageMargin }
             });
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
            addSectionHeader('6. Documentos');
            const sortedDocuments = [...documents].sort((a,b) => (new Date(b.studyDate || b.uploadedAt)).getTime() - (new Date(a.studyDate || a.uploadedAt)).getTime());
            
            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY + 10,
                head: [['Documento', 'Categoría', 'Fecha del Estudio']],
                body: sortedDocuments.map(d => [d.name, d.category, formatDate(new Date(d.studyDate || d.uploadedAt))]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold', font: 'helvetica', fontSize: 12 },
                styles: { fontSize: 11, font: 'helvetica', textColor: textColor },
                margin: { left: pageMargin, right: pageMargin },
            });

            const documentsWithSummary = sortedDocuments.filter(d => d.aiSummary);
            if (documentsWithSummary.length > 0) {
                addSectionHeader('7. Resumen de Estudios');
                documentsWithSummary.forEach(docWithSummary => {
                    if (docWithSummary.aiSummary) {
                        addSummaryToPdf(doc, docWithSummary.aiSummary, docWithSummary.name);
                    }
                });
            }
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

    

    