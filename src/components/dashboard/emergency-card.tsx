'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, UserPlus, FilePenLine, Trash2, Loader2 } from "lucide-react";
import type { EmergencyContact } from '@/lib/types';
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';


export function EmergencyContactsCard() {
  const context = useContext(UserContext);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editableContacts, setEditableContacts] = useState<EmergencyContact[]>([]);

  useEffect(() => {
    if (context?.healthInfo) {
        setEditableContacts(context.healthInfo.emergencyContacts);
    }
  }, [context?.healthInfo]);

  if (!context) {
    throw new Error('EmergencyContactsCard must be used within a UserProvider');
  }

  const { healthInfo, updateHealthInfo, loading } = context;

  const handleEditClick = () => {
    if (healthInfo) {
      setEditableContacts(JSON.parse(JSON.stringify(healthInfo.emergencyContacts)));
      setIsDialogOpen(true);
    }
  }

  const handleSave = async () => {
    if (healthInfo) {
        setIsSaving(true);
        await updateHealthInfo({ ...healthInfo, emergencyContacts: editableContacts });
        setIsSaving(false);
        setIsDialogOpen(false);
    }
  }

  const handleContactChange = (index: number, field: keyof EmergencyContact, value: string) => {
    const updatedContacts = [...editableContacts];
    updatedContacts[index] = { ...updatedContacts[index], [field]: value };
    setEditableContacts(updatedContacts);
  };

  const addContact = () => {
    const newContact: EmergencyContact = { id: Date.now().toString(), name: '', phone: '', relationship: '' };
    setEditableContacts([...editableContacts, newContact]);
  };

  const removeContact = (id: string) => {
    setEditableContacts(editableContacts.filter(c => c.id !== id));
  };
  
  if (loading || !healthInfo) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                </div>
            </CardContent>
             <CardFooter>
                 <Skeleton className="h-10 w-32" />
            </CardFooter>
        </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
            <Phone className="h-6 w-6 text-primary"/>
            <CardTitle className="font-headline text-xl">Contactos de Emergencia</CardTitle>
        </div>
        <CardDescription>Personas a contactar en caso de una emergencia médica.</CardDescription>
      </CardHeader>
      <CardContent>
          <ul className="space-y-2 text-sm">
            {healthInfo.emergencyContacts.map((contact) => (
              <li key={contact.id} className="text-muted-foreground">
                <strong>{contact.name}</strong> ({contact.relationship}) - {contact.phone}
              </li>
            ))}
          </ul>
      </CardContent>
      <CardFooter>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleEditClick}>
              <FilePenLine className="mr-2" />
              Editar Contactos
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Editar Contactos de Emergencia</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
              <Label>Contactos</Label>
                {editableContacts.map((contact, index) => (
                  <div key={contact.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <Input value={contact.name} onChange={(e) => handleContactChange(index, 'name', e.target.value)} placeholder="Nombre" aria-label="Nombre del contacto"/>
                    <Input value={contact.phone} onChange={(e) => handleContactChange(index, 'phone', e.target.value)} placeholder="Teléfono" aria-label="Teléfono del contacto"/>
                    <Input value={contact.relationship} onChange={(e) => handleContactChange(index, 'relationship', e.target.value)} placeholder="Relación" aria-label="Relación del contacto"/>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeContact(contact.id)} aria-label="Eliminar contacto"><Trash2 className="h-4 w-4"/></Button>
                  </div>
                ))}
                 <Button variant="outline" size="sm" className="mt-2" onClick={addContact}>
                   <UserPlus className="mr-2 h-4 w-4" /> Añadir Contacto
                 </Button>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={isSaving}>Cancelar</Button>
              </DialogClose>
              <Button type="submit" onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
