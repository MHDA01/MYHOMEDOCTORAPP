'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, CalendarClock, PlusCircle, MoreVertical, FilePenLine, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Appointment } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";


const mockAppointments: Appointment[] = [
  { id: '1', doctor: 'Dra. Evelyn Reed', specialty: 'Cardióloga', date: new Date('2024-08-15T10:00:00'), status: 'Upcoming' },
  { id: '2', doctor: 'Dr. Ben Carter', specialty: 'Dermatólogo', date: new Date('2024-08-22T14:30:00'), status: 'Upcoming' },
  { id: '3', doctor: 'Dra. Olivia Chen', specialty: 'Médico General', date: new Date('2024-07-05T09:00:00'), status: 'Past' },
];

type DialogMode = 'add' | 'edit';

export function Appointments() {
    const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    const [date, setDate] = useState<Date | undefined>();
    const { toast } = useToast();
    
    const upcomingAppointments = appointments.filter(a => a.status === 'Upcoming');
    const pastAppointments = appointments.filter(a => a.status === 'Past');

    const handleOpenDialog = (mode: DialogMode, appointment?: Appointment) => {
        setDialogMode(mode);
        if (mode === 'edit' && appointment) {
            setSelectedAppointment(appointment);
            setDate(appointment.date);
        } else {
            setSelectedAppointment(null);
            setDate(new Date());
        }
        setIsDialogOpen(true);
    };

    const handleDelete = (id: string) => {
        setAppointments(apps => apps.filter(app => app.id !== id));
        toast({ title: "Cita cancelada" });
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <CalendarClock className="h-6 w-6 text-primary" />
                    <CardTitle className="font-headline text-xl">Citas</CardTitle>
                </div>
                <CardDescription>Gestiona tus citas próximas y pasadas.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="upcoming">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="upcoming">Próximas</TabsTrigger>
                        <TabsTrigger value="past">Pasadas</TabsTrigger>
                    </TabsList>
                    <TabsContent value="upcoming">
                        <AppointmentList appointments={upcomingAppointments} onEdit={(app) => handleOpenDialog('edit', app)} onDelete={handleDelete} />
                    </TabsContent>
                    <TabsContent value="past">
                        <AppointmentList appointments={pastAppointments} onEdit={(app) => handleOpenDialog('edit', app)} onDelete={handleDelete} isPast />
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter>
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2"/>Programar Cita</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Programar Nueva Cita' : 'Editar Cita'}</DialogTitle>
                        </DialogHeader>
                         <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doctor-name">Nombre del Doctor</Label>
                                <Input id="doctor-name" placeholder="ej., Dr. Smith" defaultValue={selectedAppointment?.doctor} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="specialty">Especialidad</Label>
                                <Input id="specialty" placeholder="ej., Cardiología" defaultValue={selectedAppointment?.specialty} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Fecha</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !date && "text-muted-foreground"
                                        )}
                                        >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                        locale={es}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <DialogFooter>
                             <DialogClose asChild>
                                <Button variant="outline">Cancelar</Button>
                            </DialogClose>
                            <DialogClose asChild>
                                <Button type="submit" onClick={() => setIsDialogOpen(false)}>{dialogMode === 'add' ? 'Programar' : 'Guardar Cambios'}</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}

function AppointmentList({ appointments, onEdit, onDelete, isPast = false }: { appointments: Appointment[], onEdit: (appointment: Appointment) => void, onDelete: (id: string) => void, isPast?: boolean }) {
    if (appointments.length === 0) {
        return <p className="text-center text-muted-foreground py-8">No se encontraron citas.</p>;
    }
    return (
        <div className="space-y-4 pt-4">
            {appointments.map(app => (
                <div key={app.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                        <p className="font-semibold">{app.doctor}</p>
                        <p className="text-sm text-muted-foreground">{app.specialty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-right">
                            <p className="text-sm font-medium">{format(app.date, "EEE, d MMM", { locale: es })}</p>
                            <p className="text-xs text-muted-foreground">{format(app.date, "h:mm a")}</p>
                        </div>
                        {!isPast && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onEdit(app)}><FilePenLine className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(app.id)}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Cancelar Cita
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
