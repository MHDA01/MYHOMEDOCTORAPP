
'use client';

import React, { useContext } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, differenceInYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Button } from '@/components/ui/button';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    COLECCION_TUTOR,
    SUBCOLECCION_INTEGRANTES,
    SUBCOLECCION_HISTORIAL,
    DOC_HISTORIAL,
} from '@/lib/constants';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileDown, Loader2, UserRound } from 'lucide-react';
import type { Appointment, Document, HealthInfo, Medication, PersonalInfo, FamilyProfile, FamilyProfileMedical } from '@/lib/types';

type ReportProfile = FamilyProfile & {
    isSyntheticTitular?: boolean;
};

type ReportPayload = {
    personalInfo: PersonalInfo;
    healthInfo: HealthInfo;
    appointments: Appointment[];
    documents: Document[];
    medications: Medication[];
};

const calculateAge = (dob: Date | undefined): string => {
    if (!dob || !isValid(dob)) return 'N/A';
    return `${differenceInYears(new Date(), dob)} años`;
};

const formatDate = (date: Date | undefined): string => {
    if (!date || !isValid(date)) return 'N/A';
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

function toDate(value: Timestamp | Date | string | null | undefined): Date {
    if (!value) return new Date();
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function DownloadReportButton() {
    const context = useContext(UserContext);
    const userId = context?.user?.uid;
    const [isGenerating, setIsGenerating] = React.useState(false);
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [profiles, setProfiles] = React.useState<ReportProfile[]>([]);
    const [loadingProfiles, setLoadingProfiles] = React.useState(false);
    const [selectedProfileId, setSelectedProfileId] = React.useState<string | null>(null);

    const selectedProfile = React.useMemo(
        () => profiles.find((p) => p.id === selectedProfileId) ?? null,
        [profiles, selectedProfileId]
    );

    const loadProfiles = React.useCallback(async () => {
        if (!context || !context.personalInfo || !userId) return;

        setLoadingProfiles(true);
        try {
            const ref = collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES);
            const snapshot = await getDocs(ref);
            const data: ReportProfile[] = snapshot.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<FamilyProfile, 'id'>),
            }));

            const tutorFirstName = (context.personalInfo.firstName || '').trim().toLowerCase();
            const tutorLastName = (context.personalInfo.lastName || '').trim().toLowerCase();
            const hasTitular = data.some((p) =>
                p.esTitular ||
                p.relationship === 'Titular' ||
                (
                    (p.firstName || '').trim().toLowerCase() === tutorFirstName &&
                    (p.lastName || '').trim().toLowerCase() === tutorLastName
                )
            );

            if (!hasTitular) {
                const dob = context.personalInfo.dateOfBirth instanceof Date
                    ? context.personalInfo.dateOfBirth.toISOString().split('T')[0]
                    : '';

                data.unshift({
                    id: '__tutor__',
                    userId,
                    firstName: context.personalInfo.firstName,
                    lastName: context.personalInfo.lastName,
                    sex: context.personalInfo.sex,
                    dateOfBirth: dob,
                    relationship: 'Titular',
                    esTitular: true,
                    country: context.personalInfo.country,
                    insuranceProvider: context.personalInfo.insuranceProvider,
                    insuranceProviderName: context.personalInfo.insuranceProviderName,
                    allergies: context.healthInfo?.allergies || [],
                    medications: context.healthInfo?.medications || [],
                    isSyntheticTitular: true,
                });
            }

            data.sort((a, b) => Number(b.esTitular || b.relationship === 'Titular') - Number(a.esTitular || a.relationship === 'Titular'));
            setProfiles(data);
            setSelectedProfileId((prev) => prev ?? data[0]?.id ?? null);
        } finally {
            setLoadingProfiles(false);
        }
    }, [context, userId]);

    const buildPayloadForProfile = React.useCallback(async (profile: ReportProfile): Promise<ReportPayload | null> => {
        if (!context || !context.personalInfo || !context.healthInfo || !userId) return null;

        const isTitular = profile.esTitular || profile.relationship === 'Titular' || profile.id === '__tutor__';

        if (isTitular) {
            return {
                personalInfo: context.personalInfo,
                healthInfo: context.healthInfo,
                appointments: context.appointments,
                documents: context.documents,
                medications: context.medications,
            };
        }

        const medicalRef = doc(
            db,
            COLECCION_TUTOR, userId,
            SUBCOLECCION_INTEGRANTES, profile.id,
            SUBCOLECCION_HISTORIAL, DOC_HISTORIAL,
        );

        let medical: FamilyProfileMedical = {};
        const medicalSnap = await getDoc(medicalRef);
        if (medicalSnap.exists()) {
            medical = medicalSnap.data() as FamilyProfileMedical;
        }

        const docsQuery = query(
            collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, profile.id, 'Documentos'),
            orderBy('uploadedAt', 'desc')
        );
        const docsSnap = await getDocs(docsQuery);
        const memberDocs: Document[] = docsSnap.docs.map((d) => {
            const raw = d.data() as any;
            return {
                id: d.id,
                name: raw.name,
                category: raw.category,
                uploadedAt: toDate(raw.uploadedAt),
                url: raw.url,
                storagePath: raw.storagePath,
                idpStatus: raw.idpStatus,
                idpExtracted: raw.idpExtracted,
                idpError: raw.idpError,
            };
        });

        const personalInfo: PersonalInfo = {
            firstName: profile.firstName,
            lastName: profile.lastName,
            sex: profile.sex,
            dateOfBirth: toDate(profile.dateOfBirth),
            country: profile.country ?? context.personalInfo.country,
            insuranceProvider: profile.insuranceProvider || '',
            insuranceProviderName: profile.insuranceProviderName || '',
        };

        const healthInfo: HealthInfo = {
            allergies: profile.allergies || [],
            medications: profile.medications || [],
            pathologicalHistory: medical.pathologicalHistory || '',
            surgicalHistory: medical.surgicalHistory || '',
            gynecologicalHistory: medical.gynecologicalHistory || '',
            emergencyContacts: [],
        };

        return {
            personalInfo,
            healthInfo,
            appointments: [],
            documents: memberDocs,
            medications: [],
        };
    }, [context, userId]);

    const generatePdf = async () => {
        if (!selectedProfile) return;

        setIsGenerating(true);
        try {
            const payload = await buildPayloadForProfile(selectedProfile);
            if (!payload) return;

            const { personalInfo, healthInfo, appointments, documents, medications } = payload;

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
            ['Previsión:', `${personalInfo.insuranceProvider}${personalInfo.insuranceProviderName ? ` - ${personalInfo.insuranceProviderName}` : ''}`],
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
            if (healthInfo.emergencyContacts.length > 0) {
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
            }
        
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
        
            y = (doc as any).lastAutoTable?.finalY + 10 > y ? (doc as any).lastAutoTable.finalY + 10 : y;

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
            setDialogOpen(false);
        } finally {
            setIsGenerating(false);
        }
    };


    return (
        <>
            <Button
                variant="ghost"
                className="w-full justify-start gap-2 p-2"
                onClick={async () => {
                    setDialogOpen(true);
                    await loadProfiles();
                }}
                disabled={isGenerating || !userId}
            >
                {isGenerating ? <Loader2 className="animate-spin" /> : <FileDown />}
                <span>{isGenerating ? 'Generando...' : 'Generar Informe'}</span>
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generar Informe de Salud</DialogTitle>
                        <DialogDescription>
                            Selecciona el integrante del grupo familiar para generar su informe.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 max-h-72 overflow-y-auto">
                        {loadingProfiles ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Cargando integrantes...
                            </div>
                        ) : (
                            profiles.map((profile) => {
                                const fullName = `${profile.firstName} ${profile.lastName}`.trim();
                                const selected = selectedProfileId === profile.id;
                                return (
                                    <button
                                        key={profile.id}
                                        type="button"
                                        className={`w-full border rounded-lg px-3 py-2 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                                        onClick={() => setSelectedProfileId(profile.id)}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span className="font-medium truncate">{fullName || 'Sin nombre'}</span>
                                            </div>
                                            {profile.relationship && (
                                                <Badge variant="secondary">{profile.relationship}</Badge>
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            onClick={generatePdf}
                            disabled={!selectedProfile || isGenerating || loadingProfiles}
                        >
                            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isGenerating ? 'Generando...' : 'Generar Informe'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )

}
