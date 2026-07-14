'use client';

import { useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, ExternalLink } from 'lucide-react';

type ReportItem = {
  id: string;
  memberId?: string;
  sessionId?: string;
  title?: string;
  url?: string;
  createdAt?: Timestamp;
};

export default function ReportesPage() {
  const context = useContext(UserContext);
  const userId = context?.user?.uid;
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setReports([]);
      setLoading(false);
      return;
    }

    const ref = collection(db, 'Cuentas_Tutor', userId, 'reports');
    const q = query(ref, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportItem, 'id'>) }));
        setReports(data);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsub();
  }, [userId]);

  return (
    <div className="flex h-full flex-col">
      <DashboardHeader />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-blue-600" />
                Mis Reportes PDF
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Cargando reportes...</p>
              ) : reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no tienes reportes. En Teleorientación escribe o di: <strong>&quot;genera mi reporte&quot;</strong>.
                </p>
              ) : (
                reports.map((report) => {
                  const date = report.createdAt?.toDate?.() ?? new Date();
                  return (
                    <div key={report.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{report.title || 'Informe de Orientación Médica'}</p>
                        <p className="text-xs text-muted-foreground">
                          {date.toLocaleString('es-CO')} {report.sessionId ? `· Sesión: ${report.sessionId}` : ''}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline" disabled={!report.url}>
                        <a href={report.url} target="_blank" rel="noreferrer">
                          Abrir <ExternalLink className="ml-1 h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
