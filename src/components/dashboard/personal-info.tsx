'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { User, FilePenLine, Calendar as CalendarIcon, HeartPulse, Hospital } from "lucide-react";
import type { PersonalInfo as PersonalInfoType } from '@/lib/types';
import { format, differenceInYears, differenceInMonths, subYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";


const initialInfo: PersonalInfoType = {
  firstName: 'John',
  lastName: 'Doe',
  sex: 'male',
  dateOfBirth: new Date('1985-05-20'),
  insuranceProvider: 'Isapre',
  isapreName: 'Colmena',
};

const calculateAge = (dob: Date) => {
    const today = new Date();
    const years = differenceInYears(today, dob);
    const months = differenceInMonths(today, subYears(today, years)) - differenceInMonths(dob, subYears(dob, years));
    const correctedMonths = months < 0 ? months + 12 : months;
    
    let ageString = `${years} años`;
    if (correctedMonths > 0) {
      ageString += ` y ${correctedMonths} ${correctedMonths === 1 ? 'mes' : 'meses'}`;
    }
    return ageString;
};

export function PersonalInfo() {
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoType>(initialInfo);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editableInfo, setEditableInfo] = useState<PersonalInfoType>(initialInfo);
  
  const handleEditClick = () => {
    setEditableInfo(JSON.parse(JSON.stringify(personalInfo)));
    setIsDialogOpen(true);
  }

  const handleSave = () => {
    setPersonalInfo(editableInfo);
    setIsDialogOpen(false);
  }
  
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
        setEditableInfo({ ...editableInfo, dateOfBirth: date });
    }
  }


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline text-xl">Información Personal</CardTitle>
        </div>
        <CardDescription>Tus datos personales y previsión.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><strong>Nombres:</strong><p className="text-muted-foreground">{personalInfo.firstName}</p></div>
            <div><strong>Apellidos:</strong><p className="text-muted-foreground">{personalInfo.lastName}</p></div>
            <div><strong>Sexo:</strong><p className="text-muted-foreground capitalize">{personalInfo.sex === 'male' ? 'Masculino' : personalInfo.sex === 'female' ? 'Femenino' : 'Indeterminado'}</p></div>
            <div>
                <strong>Fecha de Nacimiento:</strong>
                <p className="text-muted-foreground">{format(personalInfo.dateOfBirth, 'd \'de\' MMMM \'de\' yyyy', { locale: es })} ({calculateAge(personalInfo.dateOfBirth)})</p>
            </div>
            <div>
                <strong>Previsión:</strong>
                <p className="text-muted-foreground">{personalInfo.insuranceProvider}</p>
            </div>
            {personalInfo.insuranceProvider === 'Isapre' && (
                <div>
                    <strong>Isapre:</strong>
                    <p className="text-muted-foreground">{personalInfo.isapreName}</p>
                </div>
            )}
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
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Información Personal</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="firstName">Nombres</Label>
                        <Input id="firstName" value={editableInfo.firstName} onChange={(e) => setEditableInfo({...editableInfo, firstName: e.target.value})} />
                    </div>
                     <div className="grid gap-2">
                        <Label htmlFor="lastName">Apellidos</Label>
                        <Input id="lastName" value={editableInfo.lastName} onChange={(e) => setEditableInfo({...editableInfo, lastName: e.target.value})} />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label>Sexo</Label>
                    <RadioGroup
                        value={editableInfo.sex}
                        onValueChange={(value) => setEditableInfo({...editableInfo, sex: value as 'male' | 'female' | 'other'})}
                        className="flex items-center gap-4"
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="male" id="male" />
                            <Label htmlFor="male">Masculino</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="female" id="female" />
                            <Label htmlFor="female">Femenino</Label>
                        </div>
                         <div className="flex items-center space-x-2">
                            <RadioGroupItem value="other" id="other" />
                            <Label htmlFor="other">Indeterminado</Label>
                        </div>
                    </RadioGroup>
                </div>
                 <div className="grid gap-2">
                    <Label>Fecha de Nacimiento</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant={"outline"}
                            className={cn("w-full justify-start text-left font-normal", !editableInfo.dateOfBirth && "text-muted-foreground")}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editableInfo.dateOfBirth ? format(editableInfo.dateOfBirth, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                            mode="single"
                            selected={editableInfo.dateOfBirth}
                            onSelect={handleDateSelect}
                            initialFocus
                            locale={es}
                            captionLayout="dropdown-buttons"
                            fromYear={1920}
                            toYear={new Date().getFullYear()}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="grid gap-2">
                    <Label>Previsión</Label>
                    <Select value={editableInfo.insuranceProvider} onValueChange={(value) => setEditableInfo({...editableInfo, insuranceProvider: value as 'Fonasa' | 'Isapre'})}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona una previsión" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Fonasa"><div className="flex items-center gap-2"><HeartPulse/> Fonasa</div></SelectItem>
                            <SelectItem value="Isapre"><div className="flex items-center gap-2"><Hospital/> Isapre</div></SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {editableInfo.insuranceProvider === 'Isapre' && (
                     <div className="grid gap-2">
                        <Label htmlFor="isapreName">Nombre de la Isapre</Label>
                        <Input id="isapreName" value={editableInfo.isapreName} onChange={(e) => setEditableInfo({...editableInfo, isapreName: e.target.value})} />
                    </div>
                )}
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
