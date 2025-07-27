'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video } from "lucide-react";

export function TeleconsultaPage() {

    return (
        <div className="flex flex-col h-full">
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl w-full space-y-8">
                   <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Video className="h-6 w-6 text-primary" />
                                <CardTitle className="font-headline text-xl">Iniciar una Teleconsulta</CardTitle>
                            </div>
                            <CardDescription>Conéctate con un médico especialista a través de una videollamada segura.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center">
                            <div className="p-8">
                                <h3 className="text-lg font-semibold mb-2">Servicio no disponible en este momento</h3>
                                <p className="text-muted-foreground">Estamos trabajando para habilitar las teleconsultas. Vuelve a intentarlo más tarde.</p>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button disabled>
                                <Video className="mr-2" /> Iniciar Videollamada
                            </Button>
                        </CardFooter>
                   </Card>
                </div>
            </main>
        </div>
    );
}
