
'use client';

import { useContext } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import type { Appointment, Document, Medication, EmergencyContact, HealthInfo, PersonalInfo } from '@/lib/types';

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

    const generatePdf = () => {
        if (!context || !context.personalInfo || !context.healthInfo) return;
        setIsGenerating(true);

        const { personalInfo, healthInfo, appointments, documents, medications } = context;

        const doc = new jsPDF();

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('Resumen de Salud', 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generado el: ${format(new Date(), 'PPpp', { locale: es })}`, 105, 28, { align: 'center' });


        let y = 40;

        // Personal Information
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('1. Información Personal', 14, y);
        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');

        const personalData = [
            ['Nombre Completo:', `${personalInfo.firstName} ${personalInfo.lastName}`],
            ['Fecha de Nacimiento:', `${formatDate(personalInfo.dateOfBirth)} (${calculateAge(personalInfo.dateOfBirth)})`],
            ['Sexo:', personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'],
            ['Previsión:', `${personalInfo.insuranceProvider}${personalInfo.isapreName ? ` - ${personalInfo.isapreName}` : ''}`],
        ];
        autoTable(doc, {
            startY: y,
            body: personalData,
            theme: 'plain',
            styles: { cellPadding: 1.5, fontSize: 11 },
            columnStyles: { 0: { fontStyle: 'bold' } }
        });
        y = (doc as any).lastAutoTable.finalY + 10;


        // Emergency Contacts
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('2. Contactos de Emergencia', 14, y);
        y += 8;
        autoTable(doc, {
            startY: y,
            head: [['Nombre', 'Relación', 'Teléfono']],
            body: healthInfo.emergencyContacts.map(c => [c.name, c.relationship, c.phone]),
            theme: 'striped',
            headStyles: { fillColor: [35, 87, 124] },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
        
        // Health Record
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('3. Historial Médico', 14, y);
        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');

        const addSection = (title: string, content: string | string[]) => {
            if (!content || (Array.isArray(content) && content.length === 0)) return;
            doc.setFont('helvetica', 'bold');
            doc.text(title, 14, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
            const text = Array.isArray(content) ? content.join(', ') : content;
            const splitText = doc.splitTextToSize(text, 180);
            doc.text(splitText, 14, y);
            y += (splitText.length * 5) + 4;
        }

        addSection('Alergias:', healthInfo.allergies);
        addSection('Medicamentos Frecuentes:', healthInfo.medications);
        addSection('Antecedentes Patológicos:', healthInfo.pathologicalHistory);
        addSection('Antecedentes Quirúrgicos:', healthInfo.surgicalHistory);
        if (personalInfo.sex === 'female' && healthInfo.gynecologicalHistory) {
             addSection('Antecedentes Gineco-Obstétricos:', healthInfo.gynecologicalHistory);
        }
        
        y = (doc as any).lastAutoTable.finalY + 10 > y ? (doc as any).lastAutoTable.finalY + 10 : y;

        // Appointments
        if(appointments.length > 0) {
            doc.addPage();
            y = 20;
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('4. Citas Médicas', 14, y);
            y += 8;
            const sortedAppointments = [...appointments].sort((a,b) => b.date.getTime() - a.date.getTime());
            autoTable(doc, {
                startY: y,
                head: [['Fecha', 'Hora', 'Doctor', 'Especialidad']],
                body: sortedAppointments.map(a => [
                    format(a.date, 'd/MM/yyyy'),
                    format(a.date, 'HH:mm'),
                    a.doctor,
                    a.specialty
                ]),
                theme: 'striped',
                headStyles: { fillColor: [35, 87, 124] },
            });
            y = (doc as any).lastAutoTable.finalY + 10;
        }
        
        // Medications
        if(medications.length > 0) {
            if(y > 250) { doc.addPage(); y = 20; }
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('5. Medicamentos y Recordatorios', 14, y);
            y += 8;
            autoTable(doc, {
                startY: y,
                head: [['Medicamento', 'Dosis', 'Frecuencia', 'Horarios']],
                body: medications.filter(m => m.active).map(m => [
                    m.name,
                    m.dosage,
                    `Cada ${m.frequency} hrs`,
                    m.time.join(', ')
                ]),
                theme: 'striped',
                headStyles: { fillColor: [35, 87, 124] },
            });
            y = (doc as any).lastAutoTable.finalY + 10;
        }
        
        // Documents
        if (documents.length > 0) {
            if(y > 250) { doc.addPage(); y = 20; }
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('6. Documentos', 14, y);
            y += 8;
            autoTable(doc, {
                startY: y,
                head: [['Fecha de Carga', 'Nombre', 'Categoría']],
                body: documents.map(d => [
                    formatDate(d.uploadedAt),
                    d.name,
                    d.category
                ]),
                theme: 'striped',
                headStyles: { fillColor: [35, 87, 124] },
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
