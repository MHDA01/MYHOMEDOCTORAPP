
'use client';

import { useState, useEffect, useContext, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, CalendarClock, PlusCircle, MoreVertical, FilePenLine, Trash2, Bell, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Appointment } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';


type DialogMode = 'add' | 'edit';

const getReminderLabel = (reminderKey?: string) => {
    if (!reminderKey) return 'Sin recordatorio';
    const displayLabels: {[key: string]: string} = {
        '1h': '1 hora antes',
        '2h': '2 horas antes',
        '24h': '24 horas antes',
        '2d': '2 días antes',
    };
    return displayLabels[reminderKey] || 'Personalizado';
}

export function Appointments() {
    const context = useContext(UserContext);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    
    // Form state
    const [doctor, setDoctor] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [date, setDate] = useState<Date | undefined>();
    const [time, setTime] = useState('10:00');
    const [reminder, setReminder] = useState('24h');

    const { toast } = useToast();
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    if (!context) throw new Error("Appointments must be used within a UserProvider");
    const { appointments, addAppointment, updateAppointment, deleteAppointment, loading, fcmPermissionState } = context;
    
    const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
    const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
    
    const notificationsEnabled = fcmPermissionState === 'granted';

    useEffect(() => {
        const now = new Date();
        const sortedAppointments = [...appointments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setUpcomingAppointments(
            sortedAppointments.filter(a => new Date(a.date) >= now)
        );
        setPastAppointments(
            sortedAppointments.filter(a => new Date(a.date) < now).reverse()
        );
    }, [appointments]);

    const resetForm = () => {
        setDoctor('');
        setSpecialty('');
        setDate(new Date());
        setTime('10:00');
        setReminder('24h');
    }

    const handleOpenDialog = (mode: DialogMode, appointment?: Appointment) => {
        setDialogMode(mode);
        if (mode === 'edit' && appointment) {
            setSelectedAppointment(appointment);
            setDoctor(appointment.doctor);
            setSpecialty(appointment.specialty);
            setDate(new Date(appointment.date));
            setTime(format(new Date(appointment.date), 'HH:mm'));
            setReminder(appointment.reminder || '24h');
        } else {
            setSelectedAppointment(null);
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        await deleteAppointment(id);
        toast({ title: "Cita cancelada" });
    }

    const handleSubmit = async () => {
        if (!date || !doctor || !specialty) {
            toast({ variant: 'destructive', title: "Por favor, completa todos los campos." });
            return;
        }
        setIsSaving(true);
        
        const [hours, minutes] = time.split(':').map(Number);
        const finalDate = new Date(date);
        finalDate.setHours(hours, minutes);

        const appointmentData = {
            doctor,
            specialty,
            date: finalDate,
            reminder,
            notified: false,
            status: 'Upcoming' as 'Upcoming',
        };
        
        if (dialogMode === 'add') {
            await addAppointment(appointmentData);
            toast({ title: "Cita programada con éxito." });
        } else if (selectedAppointment) {
            await updateAppointment(selectedAppointment.id, appointmentData);
            toast({ title: "Cita actualizada con éxito." });
        }

        setIsSaving(false);
        setIsDialogOpen(false);
    }

     const handleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            setDate(selectedDate);
            setIsPopoverOpen(false);
        }
    }

    if(loading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </CardContent>
                 <CardFooter>
                     <Skeleton className="h-10 w-40" />
                </CardFooter>
            </Card>
        )
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
                        <AppointmentList appointments={upcomingAppointments} onEdit={(app) => handleOpenDialog('edit', app)} onDelete={handleDelete} getReminderLabel={getReminderLabel}/>
                    </TabsContent>
                    <TabsContent value="past">
                        <AppointmentList appointments={pastAppointments} onEdit={(app) => handleOpenDialog('edit', app)} onDelete={handleDelete} isPast />
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter>
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><PlusCircle className="mr-2"/>Programar Cita</Button>
                    </DialogTrigger>
                    <DialogContent modal={true}>
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Programar Nueva Cita' : 'Editar Cita'}</DialogTitle>
                        </DialogHeader>
                         <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doctor-name">Nombre del Doctor</Label>
                                <Input id="doctor-name" placeholder="ej., Dr. Smith" value={doctor} onChange={e => setDoctor(e.target.value)} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="specialty">Especialidad</Label>
                                <Input id="specialty" placeholder="ej., Cardiología" value={specialty} onChange={e => setSpecialty(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Fecha</Label>
                                    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
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
                                        <PopoverContent className="w-auto p-0" align="start" portal={false}>
                                            <Calendar
                                                mode="single"
                                                selected={date}
                                                onSelect={handleDateSelect}
                                                initialFocus
                                                locale={es}
                                                fromYear={new Date().getFullYear()}
                                                toYear={new Date().getFullYear() + 5}
                                                disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                 <div className="grid gap-2">
                                    <Label htmlFor="appointment-time">Hora</Label>
                                    <Input id="appointment-time" type="time" value={time} onChange={e => setTime(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="reminder">Recordatorio</Label>
                                <Select value={reminder} onValueChange={setReminder} disabled={!notificationsEnabled}>
                                    <SelectTrigger id="reminder">
                                        <SelectValue placeholder="Selecciona un recordatorio" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1h">1 hora antes</SelectItem>
                                        <SelectItem value="2h">2 horas antes</SelectItem>
                                        <SelectItem value="24h">24 horas antes (por defecto)</SelectItem>
                                        <SelectItem value="2d">2 días antes</SelectItem>
                                        <SelectItem value="none">Sin recordatorio</SelectItem>
                                    </SelectContent>
                                </Select>
                                {!notificationsEnabled && <p className="text-xs text-muted-foreground">Activa las notificaciones para usar esta función.</p>}
                            </div>
                        </div>
                        <DialogFooter>
                             <DialogClose asChild>
                                <Button variant="outline" disabled={isSaving}>Cancelar</Button>
                            </DialogClose>
                            <Button type="submit" onClick={handleSubmit} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {dialogMode === 'add' ? 'Programar' : 'Guardar Cambios'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}

function AppointmentList({ appointments, onEdit, onDelete, isPast = false, getReminderLabel }: { appointments: Appointment[], onEdit: (appointment: Appointment) => void, onDelete: (id: string) => void, isPast?: boolean, getReminderLabel?: (key?: string) => string }) {
    if (appointments.length === 0) {
        return <p className="text-center text-muted-foreground py-8">No se encontraron citas.</p>;
    }
    return (
        <div className="space-y-4 pt-4">
            {appointments.map(app => (
                <div key={app.id} className="flex items-start justify-between rounded-lg border p-3">
                    <div className="flex-1">
                        <p className="font-semibold">{app.doctor}</p>
                        <p className="text-sm text-muted-foreground">{app.specialty}</p>
                        {!isPast && getReminderLabel && app.reminder && app.reminder !== 'none' && (
                             <div className="flex items-center text-xs text-muted-foreground mt-2">
                                <Bell className="h-3 w-3 mr-1" />
                                <span>{getReminderLabel(app.reminder)}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-right">
                            <p className="text-sm font-medium">{format(new Date(app.date), "EEE, d MMM", { locale: es })}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(app.date), "h:mm a")}</p>
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
