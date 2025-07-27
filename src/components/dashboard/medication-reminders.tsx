'use client';

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Pill, PlusCircle, BellRing } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Medication } from '@/lib/types';


const mockMedications: Medication[] = [
  { id: '1', name: 'Lisinopril', dosage: '10mg', frequency: 'Daily', time: ['9:00 AM'], active: true },
  { id: '2', name: 'Metformin', dosage: '500mg', frequency: 'Twice a day', time: ['8:00 AM', '8:00 PM'], active: true },
  { id: '3', name: 'Atorvastatin', dosage: '20mg', frequency: 'Daily', time: ['9:00 PM'], active: false },
];

export function MedicationReminders() {
    const [medications, setMedications] = useState<Medication[]>(mockMedications);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <BellRing className="h-6 w-6 text-primary" />
                    <CardTitle className="font-headline text-xl">Medication Reminders</CardTitle>
                </div>
                <CardDescription>Stay on track with your medication schedule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {medications.map((med) => (
                    <div key={med.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                            <p className="font-semibold">{med.name} <span className="text-sm font-normal text-muted-foreground">{med.dosage}</span></p>
                            <div className="flex items-center gap-2 mt-1">
                                {med.time.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
                            </div>
                        </div>
                        <Switch checked={med.active} onCheckedChange={(checked) => {
                            setMedications(meds => meds.map(m => m.id === med.id ? {...m, active: checked} : m));
                        }} />
                    </div>
                ))}
            </CardContent>
            <CardFooter>
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><PlusCircle className="mr-2"/>Add Medication</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Medication</DialogTitle>
                        </DialogHeader>
                         <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="med-name">Medication Name</Label>
                                <Input id="med-name" placeholder="e.g., Ibuprofen" />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="dosage">Dosage</Label>
                                <Input id="dosage" placeholder="e.g., 200mg" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="time">Reminder Times (comma separated)</Label>
                                <Input id="time" placeholder="e.g., 9:00 AM, 5:00 PM" />
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="submit" onClick={() => setIsDialogOpen(false)}>Add Reminder</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
