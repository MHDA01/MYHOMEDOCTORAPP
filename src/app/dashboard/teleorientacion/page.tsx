'use client';

import { TeleorientacionChatPage } from '@/components/dashboard/teleorientacion-chat';
import { DailyTipCard } from '@/components/dashboard/daily-tip-card';

export default function TeleorientacionPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DailyTipCard />
      <div className="min-h-0 flex-1">
        <TeleorientacionChatPage />
      </div>
    </div>
  );
}
