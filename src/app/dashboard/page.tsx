'use client';

import { DashboardHeader } from "@/components/dashboard/header";
import { PersonalInfo } from "@/components/dashboard/personal-info";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { FamilyProfiles } from "@/components/dashboard/family-profiles";
import { EmergencyContactsCard } from "@/components/dashboard/emergency-card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import { User, ShieldAlert, Users, Phone } from "lucide-react";

const sections = [
  {
    value: 'personal-info',
    icon: User,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: 'Información Personal',
    description: 'Datos personales y previsión de salud del titular',
    content: <PersonalInfo />,
  },
  {
    value: 'health-record',
    icon: ShieldAlert,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    title: 'Historial Médico',
    description: 'Antecedentes, alergias, medicamentos y cirugías',
    content: <HealthRecordCard />,
  },
  {
    value: 'familia',
    icon: Users,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: 'Grupo Familiar',
    description: 'Perfiles médicos de todos los integrantes de la familia',
    content: <FamilyProfiles />,
  },
  {
    value: 'emergency-contacts',
    icon: Phone,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    title: 'Contactos de Emergencia',
    description: 'Personas a contactar en caso de urgencia médica',
    content: <EmergencyContactsCard />,
  },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl w-full space-y-4">

          <Accordion type="multiple" className="space-y-3">
            {sections.map(({ value, icon: Icon, iconBg, iconColor, title, description, content }) => (
              <AccordionItem
                key={value}
                value={value}
                id={value}
                className="border rounded-xl overflow-hidden bg-white shadow-sm scroll-mt-20"
              >
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/30 transition-colors [&[data-state=open]]:bg-muted/20">
                  <div className="flex items-center gap-4 text-left">
                    <div className={`p-2 rounded-lg ${iconBg} shrink-0`}>
                      <Icon className={`h-5 w-5 ${iconColor}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-base leading-tight">{title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 pt-2">
                  {content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

        </div>
      </main>
    </div>
  );
}
