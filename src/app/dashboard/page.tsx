import { DashboardHeader } from "@/components/dashboard/header";
import { PersonalInfo } from "@/components/dashboard/personal-info";
import { EmergencyCard } from "@/components/dashboard/emergency-card";
import { DocumentList } from "@/components/dashboard/document-list";
import { Appointments } from "@/components/dashboard/appointments";
import { MedicationReminders } from "@/components/dashboard/medication-reminders";

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl w-full space-y-8">
            <div id="personal-info" className="scroll-mt-20">
                <PersonalInfo />
            </div>
            <div id="health-record" className="scroll-mt-20">
                <EmergencyCard />
            </div>
            <div id="documents" className="scroll-mt-20">
                <DocumentList />
            </div>
            <div id="appointments" className="scroll-mt-20">
                <Appointments />
            </div>
            <div id="medications" className="scroll-mt-20">
                <MedicationReminders />
            </div>
        </div>
      </main>
    </div>
  );
}
