
'use client';

import React, { useContext } from 'react';
import jsPDF from 'jspdf';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';

import type { MedicalDocument } from '../../context/user-context';

const calculateAge = (dob: Date | undefined): string => {
    if (!dob || !isValid(dob)) return 'N/A';
    return `${differenceInYears(new Date(), dob)} años`;
};

const formatDate = (date: Date | undefined): string => {
    if (!date || !isValid(date)) return 'N/A';
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

const getCategoryLabel = (category: MedicalDocument['category']) => {
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

    if (!context) {
        throw new Error('DownloadReportButton must be used within a UserProvider');
    }

    const { documents } = context;
    const [isGenerating, setIsGenerating] = React.useState(false);

    const generatePdf = async () => {
        if (!context || !context.personalInfo || !context.healthInfo) return;
        setIsGenerating(true);

    const { personalInfo, healthInfo, appointments, medications } = context;
        
        const doc = new jsPDF('p', 'pt', 'letter');
        const primaryColor = '#1F4E79'; 
        const textColor = '#444444';
        const pageMargin = 50; 
        const pageWidth = doc.internal.pageSize.getWidth();
        const contentWidth = pageWidth - (pageMargin * 2);
        let y = 0;

        // --- Helper Functions ---
        const checkPageBreak = (currentY: number, requiredSpace: number) => {
            if (currentY + requiredSpace > doc.internal.pageSize.getHeight() - pageMargin) {
                doc.addPage();
                y = addHeader(doc);
                return true;
            }
            return false;
        };
        
        const addHeader = (docInstance: jsPDF) => {
            const logoUrl = 'https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png';
            const logoWidth = 120; 
            const logoHeight = 90;
            docInstance.addImage(logoUrl, 'PNG', pageMargin, 40, logoWidth, logoHeight, undefined, 'FAST');
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
        
        y = addHeader(doc);

        const drawSectionHeader = (title: string) => {
            checkPageBreak(y, 40);
            y += 25;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primaryColor);
            doc.text(title, pageMargin, y);
            y += 20;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(textColor);
        };
        
        // --- 1. Información Personal ---
        drawSectionHeader('1. Información Personal');
        const personalInfoRows = [
            ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
            ['Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`],
            ['Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'],
            ['País:', personalInfo.country.charAt(0).toUpperCase() + personalInfo.country.slice(1)],
            [`${countryHealthData[personalInfo.country]?.label || 'Previsión'}:`, `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`],
        ];
        personalInfoRows.forEach(row => {
            checkPageBreak(y, 20);
            doc.setFont('helvetica', 'bold');
            doc.text(row[0], pageMargin, y);
            doc.setFont('helvetica', 'normal');
            doc.text(row[1], pageMargin + 150, y);
            y += 22;
        });

        // --- 2. Contactos de Emergencia ---
        if (healthInfo.emergencyContacts.length > 0) {
            drawSectionHeader('2. Contactos de Emergencia');
            healthInfo.emergencyContacts.forEach(contact => {
                checkPageBreak(y, 22);
                doc.text(`${contact.name} (${contact.relationship}) - ${contact.phone}`, pageMargin, y);
                y += 22;
            });
        }
        
        // --- 3. Historial Médico ---
        drawSectionHeader('3. Historial Médico');
        const healthHistoryRows = [
            ['Alergias:', healthInfo.allergies.length > 0 ? healthInfo.allergies.join(', ') : 'No registradas'],
            ['Medicamentos Frecuentes:', healthInfo.medications.length > 0 ? healthInfo.medications.join(', ') : 'No registrados'],
            ['Antecedentes Patológicos:', healthInfo.pathologicalHistory || 'No registrados'],
            ['Antecedentes Quirúrgicos:', healthInfo.surgicalHistory || 'No registrados'],
        ];
         if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
            healthHistoryRows.push(['Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory || 'No registrados']);
        }
        healthHistoryRows.forEach(row => {
            const textLines = doc.splitTextToSize(row[1], contentWidth - 150);
            const requiredSpace = (textLines.length * 12) + 10;
            checkPageBreak(y, requiredSpace);
            doc.setFont('helvetica', 'bold');
            doc.text(row[0], pageMargin, y);
            doc.setFont('helvetica', 'normal');
            doc.text(textLines, pageMargin + 150, y);
            y += requiredSpace;
        });

        // --- 4. Próximas Citas Médicas ---
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= new Date());
        if (upcomingAppointments.length > 0) {
            drawSectionHeader('4. Próximas Citas Médicas');
            upcomingAppointments.forEach(a => {
                checkPageBreak(y, 22);
                doc.text(`${format(new Date(a.date), 'dd/MM/yyyy HH:mm')} - Dr(a). ${a.doctor} (${a.specialty})`, pageMargin, y);
                y += 22;
            });
        }

        // --- 5. Medicamentos Activos ---
        const activeMedications = medications.filter(m => m.active);
        if (activeMedications.length > 0) {
            drawSectionHeader('5. Medicamentos Activos');
            activeMedications.forEach(m => {
                checkPageBreak(y, 22);
                doc.text(`${m.name} ${m.dosage} - Cada ${m.frequency} hrs${m.time && m.time.length > 0 ? ` (${m.time.map(t => t ? format(t.toDate(), 'HH:mm') : '').join(', ')})` : ''}`, pageMargin, y);
                y += 22;
            });
        }

        // --- 6. Documentos Médicos ---
        if (documents.length > 0) {
            drawSectionHeader('6. Documentos Médicos');
            documents.forEach(docItem => {
                checkPageBreak(y, 25);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text(docItem.name, pageMargin, y);
                doc.setFont('helvetica', 'normal');
                doc.text(getCategoryLabel(docItem.category), pageMargin + 250, y);
                doc.text(formatDate(docItem.studyDate || docItem.uploadedAt), pageWidth - pageMargin, y, { align: 'right' });
                y += 18;

                {/* if (docItem.labResults && docItem.labResults.length > 0) {
                    checkPageBreak(y, 30); // space for table header
                    // Draw table header
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(80, 80, 80);
                    doc.text('Examen', pageMargin + 15, y);
                    doc.text('Valor', pageMargin + 200, y);
                    doc.text('Rango de Referencia', pageMargin + 300, y);
                    y += 5;
                    doc.setDrawColor(200, 200, 200);
                    doc.line(pageMargin + 15, y, pageWidth - pageMargin - 15, y);
                    y += 15;
                    
                    // Draw table rows
                    doc.setFont('helvetica', 'normal');
                    docItem.labResults.forEach(result => {
                         checkPageBreak(y, 20);
                         doc.text(result.examen, pageMargin + 15, y);
                         doc.text(`${result.valor} ${result.unidades}`, pageMargin + 200, y);
                         doc.text(result.rangoDeReferencia, pageMargin + 300, y);
                         y += 18;
                    });
                     doc.setTextColor(textColor);
                } */}
                y += 15;
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
