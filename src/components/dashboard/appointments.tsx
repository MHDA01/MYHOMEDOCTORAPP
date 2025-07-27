'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, CalendarClock, PlusCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Appointment } from '@/lib/types';


const mockAppointments: Appointment[] = [
  { id: '1', doctor: 'Dr. Evelyn Reed', specialty: 'Cardiologist', date: new Date('2024-08-15T10:00:00'), status: 'Upcoming' },
  { id: '2', doctor: 'Dr. Ben Carter', specialty: 'Dermatologist', date: new Date('2024-08-22T14:30:00'), status: 'Upcoming' },
  { id: '3', doctor: 'Dr. Olivia Chen', specialty: 'General Practitioner', date: new Date('2024-07-05T09:00:00'), status: 'Past' },
];

export function Appointments() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    const upcomingAppointments = mockAppointments.filter(a => a.status === 'Upcoming');
    const pastAppointments = mockAppointments.filter(a => a.status === 'Past');

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <CalendarClock className="h-6 w-6 text-primary" />
                    <CardTitle className="font-headline text-xl">Appointments</CardTitle>
                </div>
                <CardDescription>Manage your upcoming and past appointments.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="upcoming">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                        <TabsTrigger value="past">Past</TabsTrigger>
                    </TabsList>
                    <TabsContent value="upcoming">
                        <AppointmentList appointments={upcomingAppointments} />
                    </TabsContent>
                    <TabsContent value="past">
                        <AppointmentList appointments={pastAppointments} />
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter>
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><PlusCircle className="mr-2"/>Schedule Appointment</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Schedule New Appointment</DialogTitle>
                        </DialogHeader>
                         <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doctor-name">Doctor's Name</Label>
                                <Input id="doctor-name" placeholder="e.g., Dr. Smith" />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="specialty">Specialty</Label>
                                <Input id="specialty" placeholder="e.g., Cardiology" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Date</Label>
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
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="submit" onClick={() => setIsDialogOpen(false)}>Schedule</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}

function AppointmentList({ appointments }: { appointments: Appointment[] }) {
    if (appointments.length === 0) {
        return <p className="text-center text-muted-foreground py-8">No appointments found.</p>;
    }
    return (
        <div className="space-y-4 pt-4">
            {appointments.map(app => (
                <div key={app.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                        <p className="font-semibold">{app.doctor}</p>
                        <p className="text-sm text-muted-foreground">{app.specialty}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium">{format(app.date, "EEE, MMM d")}</p>
                        <p className="text-xs text-muted-foreground">{format(app.date, "h:mm a")}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
