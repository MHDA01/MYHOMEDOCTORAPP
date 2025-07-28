'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { ShieldAlert, FilePenLine, Pill, Stethoscope, HeartPulse, Baby, Loader2 } from "lucide-react";
import type { HealthInfo } from '@/lib/types';
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';

export function HealthRecordCard() {
  const context = useContext(UserContext);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editableInfo, setEditableInfo] = useState<HealthInfo | null>(null);

  useEffect(() => {
    if (context?.healthInfo) {
      setEditableInfo(context.healthInfo);
    }
  }, [context?.healthInfo]);

  if (!context) {
    throw new Error('HealthRecordCard must be used within a UserProvider');
  }

  const { personalInfo, healthInfo, updateHealthInfo, loading } = context;

  const handleEditClick = () => {
    if (healthInfo) {
      setEditableInfo(JSON.parse(JSON.stringify(healthInfo)));
      setIsDialogOpen(true);
    }
  }

  const handleSave = async () => {
    if (editableInfo) {
      setIsSaving(true);
      await updateHealthInfo(editableInfo);
      setIsSaving(false);
      setIsDialogOpen(false);
    }
  }
  
  if (loading || !healthInfo || !personalInfo) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
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
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <CardTitle className="font-headline text-xl">Historial Médico</CardTitle>
        </div>
        <CardDescription>Resumen de tus antecedentes médicos más importantes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <div>
          <h4 className="font-semibold text-md mb-2 flex items-center gap-2"><Pill className="h-5 w-5 text-primary"/>Alergias y Medicamentos</h4>
          <div className="pl-7 space-y-1 text-muted-foreground">
            <p><strong>Alergias:</strong> {healthInfo.allergies.join(', ') || 'No registradas'}</p>
            <p><strong>Medicamentos Frecuentes:</strong> {healthInfo.medications.join(', ') || 'No registrados'}</p>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-md mb-2 flex items-center gap-2"><HeartPulse className="h-5 w-5 text-primary"/>Antecedentes Patológicos</h4>
          <p className="pl-7 text-muted-foreground whitespace-pre-wrap">{healthInfo.pathologicalHistory || 'No registrados.'}</p>
        </div>
        <div>
          <h4 className="font-semibold text-md mb-2 flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary"/>Antecedentes Quirúrgicos</h4>
          <p className="pl-7 text-muted-foreground whitespace-pre-wrap">{healthInfo.surgicalHistory || 'No registrados.'}</p>
        </div>
        {personalInfo.sex === 'female' && (
             <div>
                <h4 className="font-semibold text-md mb-2 flex items-center gap-2"><Baby className="h-5 w-5 text-primary"/>Antecedentes Gineco-Obstétricos</h4>
                <p className="pl-7 text-muted-foreground whitespace-pre-wrap">{healthInfo.gynecologicalHistory || 'No registrados.'}</p>
            </div>
        )}
      </CardContent>
      <CardFooter>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleEditClick}>
              <FilePenLine className="mr-2" />
              Editar Historial
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Historial Médico</DialogTitle>
            </DialogHeader>
            {editableInfo && (
                <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                    <div className="grid gap-2">
                        <Label htmlFor="allergies">Alergias (separadas por comas)</Label>
                        <Textarea id="allergies" value={editableInfo.allergies.join(', ')} onChange={(e) => setEditableInfo({...editableInfo, allergies: e.target.value.split(',').map(s => s.trim())})} placeholder="Ej: Penicilina, Mariscos..."/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="medications">Medicamentos Frecuentes (separados por comas)</Label>
                        <Textarea id="medications" value={editableInfo.medications.join(', ')} onChange={(e) => setEditableInfo({...editableInfo, medications: e.target.value.split(',').map(s => s.trim())})} placeholder="Ej: Losartán 50mg, Aspirina..."/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="pathologicalHistory">Antecedentes Patológicos</Label>
                        <Textarea id="pathologicalHistory" value={editableInfo.pathologicalHistory} onChange={(e) => setEditableInfo({...editableInfo, pathologicalHistory: e.target.value})} rows={4} placeholder="Ej: Hipertensión diagnosticada en 2010..."/>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="surgicalHistory">Antecedentes Quirúrgicos</Label>
                        <Textarea id="surgicalHistory" value={editableInfo.surgicalHistory} onChange={(e) => setEditableInfo({...editableInfo, surgicalHistory: e.target.value})} rows={4} placeholder="Ej: Apendicectomía en 2005..."/>
                    </div>
                    {personalInfo.sex === 'female' && (
                        <div className="grid gap-2">
                            <Label htmlFor="gynecologicalHistory">Antecedentes Gineco-Obstétricos</Label>
                            <Textarea id="gynecologicalHistory" value={editableInfo.gynecologicalHistory} onChange={(e) => setEditableInfo({...editableInfo, gynecologicalHistory: e.target.value})} rows={4} placeholder="Ej: G2P1A1, FUM..."/>
                        </div>
                    )}
                </div>
            )}
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
