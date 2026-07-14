import { DashboardHeader } from '@/components/dashboard/header';
import { GrowthAgentPanel } from '@/components/dashboard/growth-agent-panel';

export default function GrowthPage() {
  return (
    <div className="flex h-full flex-col">
      <DashboardHeader />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <GrowthAgentPanel />
        </div>
      </main>
    </div>
  );
}
