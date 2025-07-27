'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { ShieldAlert, Pill, Phone, UserPlus, FilePenLine } from "lucide-react";
import type { HealthInfo } from '@/lib/types';

const initialHealthInfo: HealthInfo = {
  allergies: ['Cacahuetes', 'Penicilina'],
  medications: ['Lisinopril 10mg', 'Metformina 500mg'],
  emergencyContacts: [
    { name: 'Jane Doe', phone: '123-456-7890', relationship: 'Esposa' },
    { name: 'Dr. Smith', phone: '098-765-4321', relationship: 'Médico de cabecera' },
  ],
};

export function EmergencyCard() {
  const [healthInfo, setHealthInfo] = useState<HealthInfo>(initialHealthInfo);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <CardTitle className="font-headline text-xl">Tarjeta de Salud de Emergencia</CardTitle>
        </div>
        <CardDescription>Información crítica para los servicios de emergencia.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="font-semibold text-md mb-2 flex items-center gap-2"><Pill className="h-5 w-5 text-primary"/>Alergias y Medicamentos Actuales</h4>
          <div className="pl-7 space-y-1 text-sm text-muted-foreground">
            <p><strong>Alergias:</strong> {healthInfo.allergies.join(', ')}</p>
            <p><strong>Medicamentos:</strong> {healthInfo.medications.join(', ')}</p>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-md mb-2 flex items-center gap-2"><Phone className="h-5 w-5 text-primary"/>Contactos de Emergencia</h4>
          <ul className="pl-7 space-y-2 text-sm text-muted-foreground">
            {healthInfo.emergencyContacts.map((contact) => (
              <li key={contact.name}>
                <strong>{contact.name}</strong> ({contact.relationship}) - {contact.phone}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <FilePenLine className="mr-2" />
              Editar Información
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Editar Información de Emergencia</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="allergies">Alergias (separadas por comas)</Label>
                <Textarea id="allergies" defaultValue={healthInfo.allergies.join(', ')} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="medications">Medicamentos Actuales (separados por comas)</Label>
                <Textarea id="medications" defaultValue={healthInfo.medications.join(', ')} />
              </div>
               <div className="grid gap-2">
                <Label>Contactos de Emergencia</Label>
                {healthInfo.emergencyContacts.map((contact, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2">
                    <Input defaultValue={contact.name} placeholder="Nombre" />
                    <Input defaultValue={contact.phone} placeholder="Teléfono" />
                    <Input defaultValue={contact.relationship} placeholder="Relación" />
                  </div>
                ))}
                 <Button variant="outline" size="sm" className="mt-2">
                   <UserPlus className="mr-2 h-4 w-4" /> Añadir Contacto
                 </Button>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="submit" onClick={() => setIsDialogOpen(false)}>Guardar Cambios</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
