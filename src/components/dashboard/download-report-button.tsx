
'use client';

import React, { useContext } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import type { Appointment, Document as DocumentType, Medication, EmergencyContact, HealthInfo, PersonalInfo } from '@/lib/types';

const calculateAge = (dob: Date | undefined): string => {
    if (!dob || !isValid(dob)) return 'N/A';
    return `${differenceInYears(new Date(), dob)} años`;
};

const formatDate = (date: Date | undefined): string => {
    if (!date || !isValid(date)) return 'N/A';
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

export function DownloadReportButton() {
    const context = useContext(UserContext);
    const [isGenerating, setIsGenerating] = React.useState(false);

    const generatePdf = async () => {
        if (!context || !context.personalInfo || !context.healthInfo) return;
        setIsGenerating(true);

        const { personalInfo, healthInfo, appointments, documents, medications } = context;
        
        const doc = new jsPDF('p', 'pt', 'letter');
        const primaryColor = '#478CFF'; // hsl(210 100% 64%)
        const textColor = '#333333';
        const pageMargin = 40;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageContentWidth = pageWidth - pageMargin * 2;
        let y = 0;

        // --- Header ---
        const addHeader = () => {
            const logoUrl = 'https://i.postimg.cc/J7N5r89y/LOGO-1.png';
            try {
                // The logo is added synchronously if it's a data URL,
                // for external URLs it might need async handling not directly supported here.
                // Best practice is to convert logo to base64 to embed it.
                // For this implementation, we will use a placeholder or assume CORS allows fetching.
                doc.addImage(logoUrl, 'PNG', pageMargin, 30, 80, 60);
            } catch (e) {
                console.error("Error adding logo:", e);
                doc.setFontSize(10);
                doc.text("MyHomeDoctorApp", pageMargin, 60);
            }

            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(textColor);
            doc.text('Resumen de Salud', pageWidth - pageMargin, 65, { align: 'right' });
            
            doc.setDrawColor('#E5E7EB');
            doc.line(pageMargin, 100, pageWidth - pageMargin, 100);
            y = 120;
        };
        
        const addSectionHeader = (title: string) => {
            if (y > doc.internal.pageSize.getHeight() - 100) {
                doc.addPage();
                addHeader();
            }
            doc.setFillColor(primaryColor);
            doc.rect(pageMargin, y, pageContentWidth, 24, 'F');
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#FFFFFF');
            doc.text(title, pageMargin + 10, y + 16);
            y += 40;
        }

        addHeader();

        // --- Personal Information ---
        addSectionHeader('1. Información Personal');
        autoTable(doc, {
            startY: y,
            body: [
                ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
                ['Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`],
                ['Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'],
                ['País:', personalInfo.country.charAt(0).toUpperCase() + personalInfo.country.slice(1)],
                ['Previsión:', `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`],
            ],
            theme: 'plain',
            styles: { cellPadding: { top: 4, right: 4, bottom: 4, left: 2}, fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
            margin: { left: pageMargin }
        });
        y = (doc as any).lastAutoTable.finalY + 20;

        // --- Emergency Contacts ---
        if(healthInfo.emergencyContacts.length > 0) {
            addSectionHeader('2. Contactos de Emergencia');
            autoTable(doc, {
                startY: y,
                head: [['Nombre', 'Relación', 'Teléfono']],
                body: healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone]),
                theme: 'striped',
                headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold' },
                styles: { fontSize: 10 },
                margin: { left: pageMargin, right: pageMargin }
            });
            y = (doc as any).lastAutoTable.finalY + 20;
        }

        // --- Health Record ---
        addSectionHeader('3. Historial Médico');
        const addHealthInfoSection = (title: string, content: string | string[]) => {
            const text = Array.isArray(content) ? content.join(', ') : content;
            if (!text) return;
            
            if (y > doc.internal.pageSize.getHeight() - 60) {
                doc.addPage();
                addHeader();
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(textColor);
            doc.text(title, pageMargin, y);
            y += 15;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const splitText = doc.splitTextToSize(text, pageContentWidth);
            doc.text(splitText, pageMargin, y);
            y += (splitText.length * 12) + 10;
        }

        addHealthInfoSection('Alergias:', healthInfo.allergies.length > 0 ? healthInfo.allergies.join(', ') : 'No registradas');
        addHealthInfoSection('Medicamentos Frecuentes:', healthInfo.medications.length > 0 ? healthInfo.medications.join(', ') : 'No registrados');
        addHealthInfoSection('Antecedentes Patológicos:', healthInfo.pathologicalHistory || 'No registrados');
        addHealthInfoSection('Antecedentes Quirúrgicos:', healthInfo.surgicalHistory || 'No registrados');
        if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
            addHealthInfoSection('Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory);
        }
        y += 10;
        
        // --- Appointments, Medications, Documents ---
        const upcomingAppointments = appointments.filter(a => a.date >= new Date());
        const pastAppointments = appointments.filter(a => a.date < new Date());

        const addTableSection = (title: string, head: any, body: any) => {
             if (body.length === 0) return;
             if (y > doc.internal.pageSize.getHeight() - 120) {
                 doc.addPage();
                 addHeader();
             }
             addSectionHeader(title);
             autoTable(doc, {
                 startY: y,
                 head, body,
                 theme: 'striped',
                 headStyles: { fillColor: primaryColor, textColor: '#FFFFFF', fontStyle: 'bold' },
                 styles: { fontSize: 10 },
                 margin: { left: pageMargin, right: pageMargin }
             });
             y = (doc as any).lastAutoTable.finalY + 20;
        };

        addTableSection('4. Próximas Citas Médicas',
            [['Fecha', 'Hora', 'Doctor', 'Especialidad']],
            upcomingAppointments.map(a => [format(a.date, 'dd/MM/yyyy'), format(a.date, 'HH:mm'), a.doctor, a.specialty])
        );

        addTableSection('5. Medicamentos Activos',
            [['Medicamento', 'Dosis', 'Frecuencia', 'Horarios']],
            medications.filter(m => m.active).map(m => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')])
        );

        // --- Documents Section ---
         if (documents.length > 0) {
            if (y > doc.internal.pageSize.getHeight() - 100) {
                doc.addPage();
                addHeader();
            }
            addSectionHeader('6. Documentos y Resúmenes IA');
            const sortedDocuments = [...documents].sort((a,b) => (b.studyDate || b.uploadedAt).getTime() - (a.studyDate || a.uploadedAt).getTime());

            for (const d of sortedDocuments) {
                if (y > doc.internal.pageSize.getHeight() - 100) {
                    doc.addPage();
                    addHeader();
                    y = 120; // reset y on new page
                }
                
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(textColor);
                doc.text(d.name, pageMargin, y);
                y += 14;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor('#666666');
                doc.text(`Categoría: ${d.category} | Fecha Estudio: ${formatDate(d.studyDate || d.uploadedAt)}`, pageMargin, y);
                y += 18;

                if (d.aiSummary) {
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Resumen IA:', pageMargin, y);
                    y += 14;

                    doc.setFont('helvetica', 'normal');
                    
                    // Simple markdown-to-text conversion for the report
                    const cleanSummary = d.aiSummary
                        .replace(/####\s/g, '') // remove h4
                        .replace(/\|/g, '  ')   // replace table pipes
                        .replace(/---\|/g, '') // remove table header lines
                        .replace(/\*\*/g, '')    // remove bold
                        .replace(/#\s/g, '');   // remove other headers
                    
                    const summaryLines = doc.splitTextToSize(cleanSummary, pageContentWidth - 10);
                    
                    doc.text(summaryLines, pageMargin + 5, y);
                    y += (summaryLines.length * 12) + 10;
                }
                
                doc.setDrawColor('#E5E7EB');
                doc.line(pageMargin, y, pageWidth - pageMargin, y);
                y+= 15;
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

    