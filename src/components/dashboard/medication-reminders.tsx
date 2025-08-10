
'use client';

import { useState, useEffect, useContext } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Pill, PlusCircle, BellRing, MoreVertical, FilePenLine, Trash2, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Medication } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';


type DialogMode = 'add' | 'edit';

export function MedicationReminders() {
    const context = useContext(UserContext);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedMed, setSelectedMed] = useState<Medication | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [dosage, setDosage] = useState('');
    const [frequency, setFrequency] = useState(24);
    const [administrationPeriod, setAdministrationPeriod] = useState('Permanente');
    const [timeInputs, setTimeInputs] = useState<string[]>(['09:00']);
    const [active, setActive] = useState(true);

    const { toast } = useToast();

    if (!context) throw new Error("MedicationReminders must be used within a UserProvider");
    const { medications, addMedication, updateMedication, deleteMedication, loading } = context;

    useEffect(() => {
        if (!isDialogOpen) return;
    
        const numTimes = frequency > 0 && frequency <= 24 ? Math.floor(24 / frequency) : 1;
        
        if (dialogMode === 'edit' && selectedMed && selectedMed.frequency === frequency) {
            setTimeInputs(selectedMed.time);
            return;
        }

        const newTimes = Array.from({ length: numTimes }, (_, i) => {
            const hour = 9 + (i * frequency);
            return `${String(hour % 24).padStart(2, '0')}:00`;
        });

        setTimeInputs(newTimes);

    }, [frequency, isDialogOpen, selectedMed, dialogMode]);


    const resetForm = () => {
        setName('');
        setDosage('');
        setFrequency(24);
        setAdministrationPeriod('Permanente');
        setTimeInputs(['09:00']);
        setActive(true);
    };

    const handleOpenDialog = (mode: DialogMode, medication?: Medication) => {
        setDialogMode(mode);
        if (mode === 'edit' && medication) {
            setSelectedMed(medication);
            setName(medication.name);
            setDosage(medication.dosage);
            setFrequency(medication.frequency);
            setAdministrationPeriod(medication.administrationPeriod);
            setTimeInputs(medication.time);
            setActive(medication.active);
        } else {
            setSelectedMed(null);
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        await deleteMedication(id);
        toast({ title: "Medicamento eliminado" });
    }

    const handleTimeChange = (index: number, value: string) => {
        const newTimes = [...timeInputs];
        newTimes[index] = value;
        setTimeInputs(newTimes);
    };

    const handleSubmit = async () => {
        if (!name || !dosage) {
            toast({ variant: 'destructive', title: "Por favor, completa nombre y dosis." });
            return;
        }
        setIsSaving(true);
        const medData = { name, dosage, frequency, administrationPeriod, time: timeInputs, active };

        if (dialogMode === 'add') {
            await addMedication(medData);
            toast({ title: 'Recordatorio añadido' });
        } else if (selectedMed) {
            await updateMedication(selectedMed.id, medData);
            toast({ title: 'Recordatorio actualizado' });
        }

        setIsSaving(false);
        setIsDialogOpen(false);
    };

    const handleToggleActive = async (med: Medication) => {
        await updateMedication(med.id, { active: !med.active });
    }

    const formatTime12h = (time: string) => {
        if (!time) return '';
        const [hour, minute] = time.split(':');
        const h = parseInt(hour, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedHour = h % 12 || 12;
        return `${String(formattedHour).padStart(2, '0')}:${minute} ${ampm}`;
    }

    const formatFrequencyLabel = (freq: number) => {
        if (freq < 24) return `Cada ${freq} horas`;
        if (freq === 24) return `Cada 24 horas`;
        if (freq === 48) return `Cada 48 horas`;
        if (freq === 72) return `Cada 72 horas`;
        if (freq === 168) return `Cada 7 días`;
        return `Cada ${freq} horas`;
    }
    
    if (loading) {
        return (
             <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </CardContent>
                 <CardFooter>
                     <Skeleton className="h-10 w-48" />
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <BellRing className="h-6 w-6 text-primary" />
                    <CardTitle className="font-headline text-xl">Recordatorios de Medicamentos</CardTitle>
                </div>
                <CardDescription>Mantente al día con tu horario de medicación. Para que las notificaciones funcionen, permite las notificaciones y mantén la app abierta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {medications.length === 0 && <p className="text-center text-muted-foreground pt-4">No has añadido ningún medicamento.</p>}
                {medications.map((med) => (
                    <div key={med.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                            <p className="font-semibold">{med.name} <span className="text-sm font-normal text-muted-foreground">{med.dosage}</span></p>
                            <p className="text-sm text-muted-foreground">{formatFrequencyLabel(med.frequency)} - {med.administrationPeriod}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {med.time.map(t => <Badge key={t} variant="outline">{formatTime12h(t)}</Badge>)}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <Switch checked={med.active} onCheckedChange={() => handleToggleActive(med)} aria-label={`Activar o desactivar recordatorio para ${med.name}`}/>
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleOpenDialog('edit', med)}><FilePenLine className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(med.id)}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                    </div>
                ))}
            </CardContent>
            <CardFooter>
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><PlusCircle className="mr-2"/>Añadir Medicamento</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Añadir Nuevo Medicamento' : 'Editar Medicamento'}</DialogTitle>
                        </DialogHeader>
                         <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                            <div className="grid gap-2">
                                <Label htmlFor="med-name">Nombre del Medicamento</Label>
                                <Input id="med-name" placeholder="ej., Ibuprofeno" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="dosage">Dosis</Label>
                                <Input id="dosage" placeholder="ej., 200mg" value={dosage} onChange={e => setDosage(e.target.value)} />
                            </div>
                             <div className="grid gap-2">
                                <Label>Frecuencia</Label>
                                <Select onValueChange={(value) => setFrequency(Number(value))} value={String(frequency)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona la frecuencia" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="24">Cada 24 horas (1 vez al día)</SelectItem>
                                    <SelectItem value="12">Cada 12 horas (2 veces al día)</SelectItem>
                                    <SelectItem value="8">Cada 8 horas (3 veces al día)</SelectItem>
                                    <SelectItem value="6">Cada 6 horas (4 veces al día)</SelectItem>
                                    <SelectItem value="48">Cada 48 horas (cada 2 días)</SelectItem>
                                    <SelectItem value="72">Cada 72 horas (cada 3 días)</SelectItem>
                                    <SelectItem value="168">Cada 7 días (semanal)</SelectItem>
                                  </SelectContent>
                                </Select>
                            </div>
                             <div className="grid gap-2">
                                <Label>Período de Administración</Label>
                                <Select value={administrationPeriod} onValueChange={setAdministrationPeriod}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona el período" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Dosis única">Dosis única</SelectItem>
                                    <SelectItem value="1 día">1 día</SelectItem>
                                    <SelectItem value="3 días">3 días</SelectItem>
                                    <SelectItem value="7 días">7 días</SelectItem>
                                    <SelectItem value="14 días">14 días</SelectItem>
                                    <SelectItem value="30 días">30 días</SelectItem>
                                    <SelectItem value="Permanente">Permanente</SelectItem>
                                  </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Horas de Recordatorio</Label>
                                {timeInputs.map((time, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <Input type="time" value={time} onChange={(e) => handleTimeChange(index, e.target.value)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <DialogFooter>
                             <DialogClose asChild>
                               <Button variant="outline" disabled={isSaving}>Cancelar</Button>
                            </DialogClose>
                            <Button type="submit" onClick={handleSubmit} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {dialogMode === 'add' ? 'Añadir Recordatorio' : 'Guardar Cambios'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
