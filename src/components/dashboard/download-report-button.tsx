
'use client';

import React, { useContext } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';

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
        const primaryColor = '#478CFF'; 
        const textColor = '#333333';
        const pageMargin = 40;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageContentWidth = pageWidth - pageMargin * 2;
        let y = 0;

        const addHeader = () => {
            const logoUrl = 'https://i.postimg.cc/J7N5r89y/LOGO-1.png';
            doc.addImage(logoUrl, 'PNG', pageMargin, 30, 80, 60);

            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(primaryColor);
            doc.text('Resumen de Salud', pageWidth - pageMargin, 65, { align: 'right' });

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(textColor);
            doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - pageMargin, 80, { align: 'right' });

            doc.setDrawColor('#E5E7EB');
            doc.line(pageMargin, 110, pageWidth - pageMargin, 110);
            y = 130;
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

        addSectionHeader('3. Historial Médico');
        const addHealthInfoSection = (title: string, content: string | string[]) => {
            const text = Array.isArray(content) ? content.join(', ') : content;
            if (!text) return;
            
            if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); addHeader(); }
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
        
        const upcomingAppointments = appointments.filter(a => a.date >= new Date());
        
        const addTableSection = (title: string, head: any, body: any) => {
             if (body.length === 0) return;
             if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); addHeader(); }
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
            upcomingAppointments.map(a => [format(new Date(a.date), 'dd/MM/yyyy'), format(new Date(a.date), 'HH:mm'), a.doctor, a.specialty])
        );

        addTableSection('5. Medicamentos Activos',
            [['Medicamento', 'Dosis', 'Frecuencia', 'Horarios']],
            medications.filter(m => m.active).map(m => [m.name, m.dosage, `Cada ${m.frequency} hrs`, m.time.join(', ')])
        );

         if (documents.length > 0) {
            if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); addHeader(); }
            addSectionHeader('6. Documentos y Resúmenes IA');
            const sortedDocuments = [...documents].sort((a,b) => (b.studyDate || b.uploadedAt).getTime() - (a.studyDate || a.uploadedAt).getTime());

            for (const d of sortedDocuments) {
                if (y > doc.internal.pageSize.getHeight() - 100) { doc.addPage(); addHeader(); y = 130; }
                
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
                    
                    const cleanSummary = d.aiSummary
                        .replace(/####\s*/g, '')      // Elimina '#### '
                        .replace(/\*\*/g, '')          // Elimina '**' para negrita
                        .replace(/\|\s*$/gm, '')      // Elimina barras verticales al final de las líneas
                        .replace(/^\s*\|/gm, '')      // Elimina barras verticales al principio de las líneas
                        .replace(/---\|/g, '---|');   // Corrige separadores de tabla

                    // Para que autoTable interprete correctamente el Markdown, dividimos en líneas
                    const lines = cleanSummary.split('\n');
                    const head: any[] = [];
                    const body: any[] = [];
                    let isTable = false;

                    lines.forEach(line => {
                        const trimmedLine = line.trim();
                        if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
                            const cells = trimmedLine.split('|').slice(1, -1).map(cell => cell.trim());
                            if (!isTable) { // La primera línea de la tabla es el encabezado
                                head.push(cells);
                                isTable = true;
                            } else if (!cells.every(cell => /^-+$/.test(cell))) { // Ignorar la línea separadora
                                body.push(cells);
                            }
                        } else {
                            if (isTable) { // La tabla terminó
                                autoTable(doc, {
                                    startY: y,
                                    head: head,
                                    body: body,
                                    theme: 'grid',
                                    headStyles: { fillColor: [240, 244, 255], textColor: '#333333', fontStyle: 'bold' },
                                    styles: { fontSize: 9, cellPadding: 4 },
                                    margin: { left: pageMargin, right: pageMargin }
                                });
                                y = (doc as any).lastAutoTable.finalY + 10;
                                head.length = 0;
                                body.length = 0;
                                isTable = false;
                            }
                            
                             if (trimmedLine) {
                                const summaryLines = doc.splitTextToSize(trimmedLine, pageContentWidth);
                                doc.setFontSize(10);
                                doc.setFont('helvetica', 'normal');
                                doc.text(summaryLines, pageMargin, y);
                                y += (summaryLines.length * 12) + 5;
                            }
                        }
                    });

                    if (isTable) { // Procesar la última tabla si el informe termina con ella
                         autoTable(doc, {
                            startY: y,
                            head: head,
                            body: body,
                            theme: 'grid',
                            headStyles: { fillColor: [240, 244, 255], textColor: '#333333', fontStyle: 'bold' },
                            styles: { fontSize: 9, cellPadding: 4 },
                            margin: { left: pageMargin, right: pageMargin }
                        });
                        y = (doc as any).lastAutoTable.finalY + 10;
                    }
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
