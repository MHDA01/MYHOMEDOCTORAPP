'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Siren, Phone, Home, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogFooter } from "@/components/ui/dialog";

const homeCareProviders = [
    { name: 'familymed', phone: '221234567', logo: 'https://i.postimg.cc/J7prjwWt/FAMILY-MED-1.png', rating: 4.5, reviews: 120 },
    { name: 'Red de Salud UC CHRISTUS', phone: '226767000' },
    { name: 'Help Asistencia', phone: '6006004444' },
    { name: 'Clínica Alemana', phone: '229101111' },
];

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
                            <Button variant="destructive" onClick={() => window.location.href = 'tel:131'}>
                                <Phone className="mr-2" /> Llamar al SAMU
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
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Phone className="mr-2" /> Contactar Proveedor
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Seleccionar Proveedor</DialogTitle>
                                        <DialogDescription>Elige un proveedor de atención domiciliaria para contactar.</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        {homeCareProviders.map((provider) => (
                                            <div key={provider.name} className="flex items-center justify-between rounded-lg border p-3">
                                                <div className="flex items-center gap-4">
                                                    {provider.logo && (
                                                        <div className="w-10 h-10 flex-shrink-0">
                                                            <img src={provider.logo} alt={`${provider.name} logo`} className="w-full h-full rounded-full object-contain" data-ai-hint="company logo" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-semibold">{provider.name}</p>
                                                        {provider.rating && (
                                                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                                <span>{provider.rating.toFixed(1)}</span>
                                                                <span className="text-xs">({provider.reviews} reseñas)</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button size="sm" onClick={() => window.location.href = `tel:${provider.phone}`}>
                                                    <Phone className="mr-2 h-4 w-4" /> Contactar
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant="outline">Cerrar</Button>
                                        </DialogClose>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardFooter>
                   </Card>
                </div>
            </main>
        </div>
    );
}
