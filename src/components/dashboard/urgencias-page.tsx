'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Siren, Phone, Home } from "lucide-react";

export function UrgenciasPage() {
    return (
        <div className="flex flex-col h-full">
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl w-full grid gap-8 md:grid-cols-2">
                   <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Siren className="h-6 w-6 text-destructive" />
                                <CardTitle className="font-headline text-xl">Solicitar Ambulancia</CardTitle>
                            </div>
                            <CardDescription>En caso de emergencia médica, solicita una ambulancia de inmediato.</CardDescription>
                        </CardHeader>
                        <CardFooter>
                            <Button variant="destructive">
                                <Phone className="mr-2" /> Llamar al 911
                            </Button>
                        </CardFooter>
                   </Card>
                   <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Home className="h-6 w-6 text-primary" />
                                <CardTitle className="font-headline text-xl">Atención Domiciliaria</CardTitle>
                            </div>
                            <CardDescription>Contacta a nuestros proveedores para coordinar una visita médica en casa.</CardDescription>
                        </CardHeader>
                        <CardFooter>
                             <Button>
                                <Phone className="mr-2" /> Contactar Proveedor
                            </Button>
                        </CardFooter>
                   </Card>
                </div>
            </main>
        </div>
    );
}
