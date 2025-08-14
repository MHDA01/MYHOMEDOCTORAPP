
'use client';

import React, { useContext } from 'react';
import jsPDF from 'jspdf';
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

        const checkPageBreak = (y: number) => {
            if (y > doc.internal.pageSize.getHeight() - pageMargin) {
                doc.addPage();
                return pageMargin;
            }
            return y;
        };

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

        const addSectionHeader = (title: string, yPos: number) => {
            currentY = checkPageBreak(yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor('#FFFFFF');
            doc.setFillColor(primaryColor);
            doc.rect(pageMargin, currentY, pageWidth - (pageMargin * 2), 24, 'F');
            doc.text(title, pageMargin + 10, currentY + 16);
            return currentY + 34;
        };

        const addInfoGrid = (data: [string, string][], yPos: number) => {
            currentY = checkPageBreak(yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(textColor);
            
            data.forEach(([label, value]) => {
                currentY = checkPageBreak(currentY);
                doc.setFont('helvetica', 'bold');
                doc.text(label, pageMargin, currentY);
                doc.setFont('helvetica', 'normal');
                const textLines = doc.splitTextToSize(value, pageWidth - (pageMargin * 2) - 150);
                doc.text(textLines, pageMargin + 140, currentY);
                currentY += (textLines.length * 12) + 6;
            });
            return currentY;
        };
        
        const drawTable = (headers: string[], body: string[][], yPos: number, colWidths: number[]) => {
            currentY = checkPageBreak(yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setFillColor(primaryColor);
            doc.setTextColor('#FFFFFF');
            
            // Draw header
            let xPos = pageMargin;
            headers.forEach((header, i) => {
                doc.rect(xPos, currentY, colWidths[i], 20, 'F');
                doc.text(header, xPos + 5, currentY + 14);
                xPos += colWidths[i];
            });
            currentY += 20;

            // Draw body
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(textColor);
            body.forEach(row => {
                currentY = checkPageBreak(currentY + 20) - 20; // Check before drawing row
                let maxRowHeight = 0;
                let cellData = row.map((cellText, i) => {
                    const lines = doc.splitTextToSize(cellText, colWidths[i] - 10);
                    maxRowHeight = Math.max(maxRowHeight, lines.length * 12 + 8);
                    return lines;
                });

                currentY = checkPageBreak(currentY + maxRowHeight) - maxRowHeight;
                
                let x = pageMargin;
                cellData.forEach((lines, i) => {
                    doc.rect(x, currentY, colWidths[i], maxRowHeight);
                    doc.text(lines, x + 5, currentY + 14);
                    x += colWidths[i];
                });
                currentY += maxRowHeight;
            });

            return currentY;
        };

        currentY = addHeader(doc);
        
        // --- 1. Información Personal ---
        currentY = addSectionHeader('1. Información Personal', currentY);
        currentY = addInfoGrid([
            ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
            ['Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`],
            ['Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'],
            ['País:', personalInfo.country.charAt(0).toUpperCase() + personalInfo.country.slice(1)],
            [`${countryHealthData[personalInfo.country]?.label || 'Previsión'}:`, `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`],
        ], currentY);
        currentY += 10;
        
        // --- 2. Contactos de Emergencia ---
        if (healthInfo.emergencyContacts.length > 0) {
            currentY = addSectionHeader('2. Contactos de Emergencia', currentY);
            currentY = drawTable(
                ['Nombre', 'Relación', 'Teléfono'], 
                healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone]),
                currentY,
                [200, 150, 156]
            );
            currentY += 10;
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
        currentY = addInfoGrid(healthHistoryBody as [string, string][], currentY);
        currentY += 10;

        // --- 4. Próximas Citas Médicas ---
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= new Date());
        if (upcomingAppointments.length > 0) {
            currentY = addSectionHeader('4. Próximas Citas Médicas', currentY);
            currentY = drawTable(
                ['Fecha', 'Hora', 'Doctor', 'Especialidad'], 
                upcomingAppointments.map(a => [format(new Date(a.date), 'dd/MM/yyyy'), format(new Date(a.date), 'HH:mm'), a.doctor, a.specialty]),
                currentY,
                [80, 80, 173, 173]
            );
            currentY += 10;
        }

        // --- 5. Medicamentos Activos ---
        const activeMedications = medications.filter(m => m.active);
        if (activeMedications.length > 0) {
            currentY = addSectionHeader('5. Medicamentos Activos', currentY);
             currentY = drawTable(
                ['Medicamento', 'Dosis', 'Frecuencia', 'Horarios'], 
                activeMedications.map(m => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')]),
                currentY,
                [150, 100, 126, 130]
            );
            currentY += 10;
        }

        // --- 6. Documentos Médicos y Resúmenes ---
        if (documents.length > 0) {
            currentY = addSectionHeader('6. Documentos Médicos', currentY);
            
            const docHeaders = ['Documento', 'Categoría', 'Fecha de Estudio'];
            const docColWidths = [200, 150, 156];
            let docBody: string[][] = [];

            for (const docItem of documents) {
                 docBody.push([docItem.name, getCategoryLabel(docItem.category), formatDate(docItem.studyDate || docItem.uploadedAt)]);

                 if (docItem.aiSummary) {
                    const diagnostico = `Diagnóstico: ${docItem.aiSummary.diagnosticoPrincipal || 'No registrado'}`;
                    const hallazgos = `Hallazgos: ${(Array.isArray(docItem.aiSummary.hallazgosClave) && docItem.aiSummary.hallazgosClave.length > 0) ? docItem.aiSummary.hallazgosClave.join('; ') : 'No registrados'}`;
                    const recomendaciones = `Recomendaciones: ${(Array.isArray(docItem.aiSummary.recomendaciones) && docItem.aiSummary.recomendaciones.length > 0) ? docItem.aiSummary.recomendaciones.join('; ') : 'No registradas'}`;

                    docBody.push([diagnostico, '', '']);
                    docBody.push([hallazgos, '', '']);
                    docBody.push([recomendaciones, '', '']);
                 }
            }
             currentY = drawTable(docHeaders, docBody, currentY, docColWidths);
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
