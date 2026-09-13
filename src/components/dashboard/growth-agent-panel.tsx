'use client';

import { useContext, useEffect, useState } from 'react';
import { UserContext } from '@/context/user-context';
import { auth } from '@/lib/firebase';
import {
  generateGrowthDraft,
  getGrowthDraftHistory,
  markGrowthDraftAsUsed,
  type GrowthMode,
  type GrowthDraftHistoryItem,
} from '@/app/actions/growth-agent';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check } from 'lucide-react';
import Link from 'next/link';

const MODE_LABELS: Record<GrowthMode, string> = {
  outreach: 'Prospecto',
  ambassador: 'Embajador',
  marketing_strategy: 'Estrategia',
};

const MODE_PLACEHOLDERS: Record<GrowthMode, string> = {
  outreach: 'Ej: Mi amigo Carlos, papá de dos niños, ya sabe de la app pero no se ha suscrito. Es informal, le gusta el fútbol.',
  ambassador: 'Ej: Explícale a mi amiga Laura cómo funciona la comisión del programa de embajadores, nunca lo ha usado.',
  marketing_strategy: 'Ej: Quiero un ángulo de contenido para Instagram enfocado en mamás primerizas para esta semana.',
};

export function GrowthAgentPanel() {
  const context = useContext(UserContext);
  const { toast } = useToast();

  const [mode, setMode] = useState<GrowthMode>('outreach');
  const [contextInput, setContextInput] = useState('');
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<GrowthDraftHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setAuthorized(false);
        return;
      }
      const items = await getGrowthDraftHistory(idToken);
      setHistory(items);
      setAuthorized(true);
    } catch (error) {
      console.error('[GrowthAgentPanel] Error cargando historial:', error);
      setAuthorized(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (context?.user) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.user]);

  const handleGenerate = async () => {
    if (!contextInput.trim()) return;
    setGenerating(true);
    setDraft('');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast({ variant: 'destructive', title: 'No autenticado', description: 'Inicia sesión de nuevo.' });
        return;
      }
      const result = await generateGrowthDraft(mode, contextInput, idToken);
      if (!result.success || !result.draft) {
        toast({ variant: 'destructive', title: 'No se pudo generar el borrador', description: result.error });
        return;
      }
      setDraft(result.draft);
      loadHistory();
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMarkUsed = async (draftId: string) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    await markGrowthDraftAsUsed(idToken, draftId);
    setHistory((prev) => prev.map((d) => (d.id === draftId ? { ...d, status: 'usado' } : d)));
  };

  if (authorized === false) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No tienes acceso a esta herramienta.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">Agente de Crecimiento</CardTitle>
          <Link href="/dashboard/admin/consejos" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Ver muestra de consejos enviados hoy →
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as GrowthMode)}>
            <TabsList>
              <TabsTrigger value="outreach">Prospecto</TabsTrigger>
              <TabsTrigger value="ambassador">Embajador</TabsTrigger>
              <TabsTrigger value="marketing_strategy">Estrategia</TabsTrigger>
            </TabsList>
          </Tabs>

          <Textarea
            value={contextInput}
            onChange={(e) => setContextInput(e.target.value)}
            placeholder={MODE_PLACEHOLDERS[mode]}
            rows={4}
          />

          <Button onClick={handleGenerate} disabled={generating || !contextInput.trim()}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generar borrador
          </Button>

          {draft && (
            <div className="space-y-2 rounded-lg border p-4">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} />
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial reciente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Cargando historial...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay borradores generados.</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {MODE_LABELS[item.mode]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    item.status === 'usado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {item.status}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-foreground">{item.draftText}</p>
                {item.status === 'borrador' && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => handleMarkUsed(item.id)}>
                    Marcar como usado
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
