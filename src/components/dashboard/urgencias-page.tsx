'use client';

/**
 * Urgencias: el 123, y nada más.
 *
 * Esta pantalla tuvo hasta el 11-nov-2026 un botón rojo que marcaba `tel:131`
 * ("Llamar al SAMU") y cuatro prestadores chilenos presentados como "nuestros
 * proveedores". El SAMU y el 131 son de Chile: en Colombia ese número no manda
 * una ambulancia, y la red no era nuestra ni operaba en el país. Es la única
 * pantalla de la app a la que alguien llega *durante* una emergencia.
 *
 * Lo que queda es deliberadamente corto. El por qué —legal y práctico— está en
 * `src/lib/urgencias-colombia.ts`: en una urgencia la EPS no es la puerta, así
 * que no se le pregunta por ella a nadie que esté llegando aquí.
 *
 * Los textos visibles de esta pantalla los **aprobó Alexander el 18-nov-2026**,
 * en la sesión de aprobación que cerró los 17 textos pendientes. Cambiarlos exige
 * una aprobación nueva: son texto que lee el paciente, y además en una emergencia.
 * `tests/unidad/textos-aprobados.test.ts` falla si alguno cambia.
 */

import Link from 'next/link';
import { Phone, Siren, MessageCircleHeart } from 'lucide-react';
import { LINEA_EMERGENCIAS } from '@/lib/urgencias-colombia';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function UrgenciasPage() {
  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* El 123. Sin condiciones, y lo primero que se ve. */}
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Siren className="h-7 w-7 shrink-0 text-destructive" />
                <CardTitle className="font-headline text-xl">
                  Si hay riesgo para la vida, llama al {LINEA_EMERGENCIAS}
                </CardTitle>
              </div>
              <CardDescription>
                El {LINEA_EMERGENCIAS} es la línea única de emergencias en Colombia. Atiende todo el día, todos los
                días, desde cualquier teléfono, y no te pueden pedir documento ni pago para atenderte.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                size="lg"
                className="h-14 w-full text-lg font-bold sm:w-auto sm:px-10"
                onClick={() => {
                  window.location.href = `tel:${LINEA_EMERGENCIAS}`;
                }}
              >
                <Phone className="mr-2 h-5 w-5" /> Llamar al {LINEA_EMERGENCIAS}
              </Button>
            </CardContent>
          </Card>

          {/* La duda. La app no decide por nadie: ofrece su propia orientación. */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <MessageCircleHeart className="h-6 w-6 shrink-0 text-primary" />
                <CardTitle className="font-headline text-lg">¿No sabes si es una urgencia?</CardTitle>
              </div>
              <CardDescription>
                Cuéntale a Hilda qué está pasando y te dice qué tan pronto hay que buscar atención y con quién. No
                reemplaza a un médico y no receta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" className="h-12 w-full sm:w-auto">
                <Link href="/dashboard/teleorientacion">Abrir una orientación</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
