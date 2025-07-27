'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { ShieldAlert, Pill, Phone, UserPlus, FilePenLine, Trash2 } from "lucide-react";
import type { HealthInfo, EmergencyContact } from '@/lib/types';

const initialHealthInfo: HealthInfo = {
  allergies: ['Cacahuetes', 'Penicilina'],
  medications: ['Lisinopril 10mg', 'Metformina 500mg'],
  emergencyContacts: [
    { id: '1', name: 'Jane Doe', phone: '123-456-7890', relationship: 'Esposa' },
    { id: '2', name: 'Dr. Smith', phone: '098-765-4321', relationship: 'Médico de cabecera' },
  ],
};

export function EmergencyCard() {
  const [healthInfo, setHealthInfo] = useState<HealthInfo>(initialHealthInfo);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [editableInfo, setEditableInfo] = useState<HealthInfo>(initialHealthInfo);

  const handleEditClick = () => {
    setEditableInfo(JSON.parse(JSON.stringify(healthInfo)));
    setIsDialogOpen(true);
  }

  const handleSave = () => {
    setHealthInfo(editableInfo);
    setIsDialogOpen(false);
  }

  const handleContactChange = (index: number, field: keyof EmergencyContact, value: string) => {
    const updatedContacts = [...editableInfo.emergencyContacts];
    updatedContacts[index] = { ...updatedContacts[index], [field]: value };
    setEditableInfo({ ...editableInfo, emergencyContacts: updatedContacts });
  };

  const addContact = () => {
    const newContact: EmergencyContact = { id: Date.now().toString(), name: '', phone: '', relationship: '' };
    setEditableInfo({ ...editableInfo, emergencyContacts: [...editableInfo.emergencyContacts, newContact] });
  };

  const removeContact = (id: string) => {
    setEditableInfo({ ...editableInfo, emergencyContacts: editableInfo.emergencyContacts.filter(c => c.id !== id) });
  };


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
              <li key={contact.id}>
                <strong>{contact.name}</strong> ({contact.relationship}) - {contact.phone}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleEditClick}>
              <FilePenLine className="mr-2" />
              Editar Información
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Editar Información de Emergencia</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid gap-2">
                <Label htmlFor="allergies">Alergias (separadas por comas)</Label>
                <Textarea id="allergies" value={editableInfo.allergies.join(', ')} onChange={(e) => setEditableInfo({...editableInfo, allergies: e.target.value.split(',').map(s => s.trim())})}/>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="medications">Medicamentos Actuales (separados por comas)</Label>
                <Textarea id="medications" value={editableInfo.medications.join(', ')} onChange={(e) => setEditableInfo({...editableInfo, medications: e.target.value.split(',').map(s => s.trim())})}/>
              </div>
               <div className="grid gap-2">
                <Label>Contactos de Emergencia</Label>
                {editableInfo.emergencyContacts.map((contact, index) => (
                  <div key={contact.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <Input value={contact.name} onChange={(e) => handleContactChange(index, 'name', e.target.value)} placeholder="Nombre" />
                    <Input value={contact.phone} onChange={(e) => handleContactChange(index, 'phone', e.target.value)} placeholder="Teléfono" />
                    <Input value={contact.relationship} onChange={(e) => handleContactChange(index, 'relationship', e.target.value)} placeholder="Relación" />
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeContact(contact.id)}><Trash2 className="h-4 w-4"/></Button>
                  </div>
                ))}
                 <Button variant="outline" size="sm" className="mt-2" onClick={addContact}>
                   <UserPlus className="mr-2 h-4 w-4" /> Añadir Contacto
                 </Button>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" onClick={handleSave}>Guardar Cambios</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
