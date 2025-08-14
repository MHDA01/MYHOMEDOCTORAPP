
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
        const pageHeight = doc.internal.pageSize.getHeight();
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

        const addPageIfNeeded = (yPosition: number) => {
            if (yPosition > pageHeight - pageMargin) {
                doc.addPage();
                addHeader(doc);
                currentY = 160;
                return true;
            }
            return false;
        };
        
        const addSectionHeader = (title: string) => {
            addPageIfNeeded(currentY + 30);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(primaryColor);
            doc.setFillColor(primaryColor);
            doc.rect(pageMargin, currentY, pageWidth - (pageMargin * 2), 30, 'F');
            doc.setTextColor('#FFFFFF');
            doc.text(title, pageMargin + 15, currentY + 20);
            currentY += 45;
        }

        const addInfoField = (label: string, value: string) => {
            addPageIfNeeded(currentY + 15);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(textColor);
            doc.text(label, pageMargin, currentY);

            doc.setFont('helvetica', 'normal');
            doc.text(value, pageMargin + 160, currentY);
            currentY += 20;
        }

        const addMultiLineInfo = (label: string, value: string) => {
             addPageIfNeeded(currentY + 30);
             doc.setFont('helvetica', 'bold');
             doc.setFontSize(12);
             doc.setTextColor(textColor);
             doc.text(label, pageMargin, currentY);
             currentY += 20;
             
             doc.setFont('helvetica', 'normal');
             doc.setFontSize(11);
             const lines = doc.splitTextToSize(value || 'No registrados', pageWidth - (pageMargin * 2));
             for(const line of lines) {
                 addPageIfNeeded(currentY + 15);
                 doc.text(line, pageMargin, currentY);
                 currentY += 15;
             }
             currentY += 10;
        }

        const drawTable = (headers: string[], data: string[][]) => {
            const rowHeight = 25;
            const headerHeight = 30;
            const colWidths = headers.map(h => (pageWidth - (pageMargin * 2)) / headers.length);
            
            // Draw Header
            addPageIfNeeded(currentY + headerHeight);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setFillColor(primaryColor);
            doc.rect(pageMargin, currentY, pageWidth - (pageMargin * 2), headerHeight, 'F');
            doc.setTextColor('#FFFFFF');

            headers.forEach((header, i) => {
                doc.text(header, pageMargin + (colWidths.slice(0, i).reduce((a, b) => a + b, 0)) + 10, currentY + 20);
            });
            currentY += headerHeight;

            // Draw Rows
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(textColor);

            data.forEach((row, rowIndex) => {
                 addPageIfNeeded(currentY + rowHeight);
                 doc.setFillColor(rowIndex % 2 === 0 ? '#F3F4F6' : '#FFFFFF');
                 doc.rect(pageMargin, currentY, pageWidth - (pageMargin * 2), rowHeight, 'F');

                 row.forEach((cell, i) => {
                    const lines = doc.splitTextToSize(cell, colWidths[i] - 20);
                    doc.text(lines, pageMargin + (colWidths.slice(0, i).reduce((a, b) => a + b, 0)) + 10, currentY + 17);
                 });
                 currentY += rowHeight;
            });
             currentY += 20;
        }


        addHeader(doc);
        
        // --- 1. Información Personal ---
        addSectionHeader('1. Información Personal');
        addInfoField('Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`);
        addInfoField('Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`);
        addInfoField('Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado');
        addInfoField('País:', personalInfo.country.charAt(0).toUpperCase() + personalInfo.country.slice(1));
        const healthProviderLabel = countryHealthData[personalInfo.country]?.label || 'Previsión';
        addInfoField(`${healthProviderLabel}:`, `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`);
        currentY += 10;
        
        // --- 2. Contactos de Emergencia ---
        if(healthInfo.emergencyContacts.length > 0) {
            addSectionHeader('2. Contactos de Emergencia');
            drawTable(
                ['Nombre', 'Relación', 'Teléfono'],
                healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone])
            );
        }

        // --- 3. Historial Médico ---
        addSectionHeader('3. Historial Médico');
        addMultiLineInfo('Alergias:', healthInfo.allergies.length > 0 ? healthInfo.allergies.join(', ') : 'No registradas');
        addMultiLineInfo('Medicamentos Frecuentes:', healthInfo.medications.length > 0 ? healthInfo.medications.join(', ') : 'No registrados');
        addMultiLineInfo('Antecedentes Patológicos:', healthInfo.pathologicalHistory || 'No registrados');
        addMultiLineInfo('Antecedentes Quirúrgicos:', healthInfo.surgicalHistory || 'No registrados');
        if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
            addMultiLineInfo('Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory);
        }

        // --- 4. Próximas Citas Médicas ---
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= new Date());
        if (upcomingAppointments.length > 0) {
            addSectionHeader('4. Próximas Citas Médicas');
            drawTable(
                ['Fecha', 'Hora', 'Doctor', 'Especialidad'],
                upcomingAppointments.map(a => [format(new Date(a.date), 'dd/MM/yyyy'), format(new Date(a.date), 'HH:mm'), a.doctor, a.specialty])
            );
        }

        // --- 5. Medicamentos Activos ---
        const activeMedications = medications.filter(m => m.active);
        if (activeMedications.length > 0) {
            addSectionHeader('5. Medicamentos Activos');
            drawTable(
                ['Medicamento', 'Dosis', 'Frecuencia', 'Horarios'],
                activeMedications.map(m => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')])
            );
        }

        // --- 6. Documentos Médicos ---
        if (documents.length > 0) {
            addSectionHeader('6. Documentos Médicos');
            drawTable(
                ['Documento', 'Categoría', 'Fecha de Estudio'],
                documents.map(d => [d.name, getCategoryLabel(d.category), formatDate(d.studyDate || d.uploadedAt)])
            );
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
