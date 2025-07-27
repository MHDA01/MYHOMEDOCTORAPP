'use client';

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Pill, PlusCircle, BellRing, MoreVertical, FilePenLine, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Medication } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";


const mockMedications: Medication[] = [
  { id: '1', name: 'Lisinopril', dosage: '10mg', frequency: 'Diario', time: ['09:00'], active: true },
  { id: '2', name: 'Metformina', dosage: '500mg', frequency: 'Dos veces al día', time: ['08:00', '20:00'], active: true },
  { id: '3', name: 'Atorvastatina', dosage: '20mg', frequency: 'Diario', time: ['21:00'], active: false },
];

type DialogMode = 'add' | 'edit';

export function MedicationReminders() {
    const [medications, setMedications] = useState<Medication[]>(mockMedications);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
    const [timeInputs, setTimeInputs] = useState<string[]>(['']);
    const { toast } = useToast();

    const handleOpenDialog = (mode: DialogMode, medication?: Medication) => {
        setDialogMode(mode);
        if (mode === 'edit' && medication) {
            setSelectedMed(medication);
            setTimeInputs(medication.time);
        } else {
            setSelectedMed(null);
            setTimeInputs(['09:00']);
        }
        setIsDialogOpen(true);
    };

    const handleDelete = (id: string) => {
        setMedications(meds => meds.filter(med => med.id !== id));
        toast({ title: "Medicamento eliminado" });
    }

    const handleTimeChange = (index: number, value: string) => {
        const newTimes = [...timeInputs];
        newTimes[index] = value;
        setTimeInputs(newTimes);
    };

    const addTimeInput = () => setTimeInputs([...timeInputs, '']);
    const removeTimeInput = (index: number) => setTimeInputs(timeInputs.filter((_, i) => i !== index));

    const formatTime12h = (time: string) => {
        if (!time) return '';
        const [hour, minute] = time.split(':');
        const h = parseInt(hour, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedHour = h % 12 || 12;
        return `${String(formattedHour).padStart(2, '0')}:${minute} ${ampm}`;
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <BellRing className="h-6 w-6 text-primary" />
                    <CardTitle className="font-headline text-xl">Recordatorios de Medicamentos</CardTitle>
                </div>
                <CardDescription>Mantente al día con tu horario de medicación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {medications.map((med) => (
                    <div key={med.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                            <p className="font-semibold">{med.name} <span className="text-sm font-normal text-muted-foreground">{med.dosage}</span></p>
                            <p className="text-sm text-muted-foreground">{med.frequency}</p>
                            <div className="flex items-center gap-2 mt-1">
                                {med.time.map(t => <Badge key={t} variant="outline">{formatTime12h(t)}</Badge>)}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <Switch checked={med.active} onCheckedChange={(checked) => {
                                setMedications(meds => meds.map(m => m.id === med.id ? {...m, active: checked} : m));
                            }} />
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
                        <Button onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2"/>Añadir Medicamento</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Añadir Nuevo Medicamento' : 'Editar Medicamento'}</DialogTitle>
                        </DialogHeader>
                         <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="med-name">Nombre del Medicamento</Label>
                                <Input id="med-name" placeholder="ej., Ibuprofeno" defaultValue={selectedMed?.name} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="dosage">Dosis</Label>
                                <Input id="dosage" placeholder="ej., 200mg" defaultValue={selectedMed?.dosage}/>
                            </div>
                             <div className="grid gap-2">
                                <Label>Frecuencia</Label>
                                <Select defaultValue={selectedMed?.frequency}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona la frecuencia" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Diario">Diario</SelectItem>
                                    <SelectItem value="Dos veces al día">Dos veces al día</SelectItem>
                                    <SelectItem value="Semanal">Semanal</SelectItem>
                                    <SelectItem value="Mensual">Mensual</SelectItem>
                                    <SelectItem value="Permanente">Permanente</SelectItem>
                                  </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Horas de Recordatorio</Label>
                                {timeInputs.map((time, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <Input type="time" value={time} onChange={(e) => handleTimeChange(index, e.target.value)} />
                                        {index > 0 && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeTimeInput(index)}><Trash2 className="h-4 w-4"/></Button>}
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addTimeInput} className="mt-2">Añadir otra hora</Button>
                            </div>
                        </div>
                        <DialogFooter>
                             <DialogClose asChild>
                               <Button variant="outline">Cancelar</Button>
                            </DialogClose>
                            <DialogClose asChild>
                                <Button type="submit" onClick={() => setIsDialogOpen(false)}>{dialogMode === 'add' ? 'Añadir Recordatorio' : 'Guardar Cambios'}</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
