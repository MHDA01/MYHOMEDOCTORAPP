
'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { User, FilePenLine, Calendar as CalendarIcon, HeartPulse, Hospital, Loader2 } from "lucide-react";
import type { PersonalInfo as PersonalInfoType } from '@/lib/types';
import { format, differenceInYears, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';


const calculateAge = (dob: Date | undefined): string => {
    if (!dob || !isValid(dob)) return '';
    const today = new Date();
    const years = differenceInYears(today, dob);
    if (years < 0) return '';
    return `${years} años`;
};


export function PersonalInfo() {
  const context = useContext(UserContext);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editableInfo, setEditableInfo] = useState<PersonalInfoType | null>(null);
  const [age, setAge] = useState<string>('');

  const getValidDate = (date: string | Date | undefined): Date | undefined => {
    if (!date) return undefined;
    const d = date instanceof Date ? date : parseISO(date as string);
    return isValid(d) ? d : undefined;
  }

  useEffect(() => {
    if (context?.personalInfo?.dateOfBirth) {
        const validDob = getValidDate(context.personalInfo.dateOfBirth);
        if (validDob) {
            setAge(calculateAge(validDob));
        }
    }
  }, [context?.personalInfo?.dateOfBirth]);


  useEffect(() => {
    if (context?.personalInfo) {
      const dob = getValidDate(context.personalInfo.dateOfBirth);
      const info = { ...context.personalInfo, dateOfBirth: dob || new Date() };
      setEditableInfo(info);
    }
  }, [context?.personalInfo, isDialogOpen]);

  if (!context) {
    throw new Error('PersonalInfo must be used within a UserProvider');
  }

  const { personalInfo, updatePersonalInfo, loading } = context;

  const handleEditClick = () => {
    if (personalInfo) {
      const dob = getValidDate(personalInfo.dateOfBirth);
      setEditableInfo({ ...personalInfo, dateOfBirth: dob || new Date() });
      setIsDialogOpen(true);
    }
  }

  const handleSave = async () => {
    if (editableInfo) {
      setIsSaving(true);
      await updatePersonalInfo(editableInfo);
      setIsSaving(false);
      setIsDialogOpen(false);
    }
  }
  
  const handleDateSelect = (date: Date | undefined) => {
    if (date && editableInfo) {
        setEditableInfo({ ...editableInfo, dateOfBirth: date });
        setIsPopoverOpen(false);
    }
  }

  const displayDob = getValidDate(personalInfo?.dateOfBirth);

  if (loading || !personalInfo) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
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
                <p className="text-muted-foreground">{displayDob ? `${format(displayDob, "d 'de' MMMM 'de' yyyy", { locale: es })} (${age})` : 'No registrada'}</p>
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
          <DialogContent className="sm:max-w-lg" modal={true}>
            <DialogHeader>
              <DialogTitle>Editar Información Personal</DialogTitle>
            </DialogHeader>
            {editableInfo && (
                <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
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
                        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                variant={"outline"}
                                className={cn("w-full justify-start text-left font-normal", !editableInfo.dateOfBirth && "text-muted-foreground")}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {editableInfo.dateOfBirth && isValid(getValidDate(editableInfo.dateOfBirth)) ? format(getValidDate(editableInfo.dateOfBirth) as Date, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start" portal={false}>
                                <Calendar
                                    mode="single"
                                    selected={getValidDate(editableInfo.dateOfBirth)}
                                    onSelect={handleDateSelect}
                                    locale={es}
                                    captionLayout="dropdown-buttons"
                                    fromYear={1920}
                                    toYear={new Date().getFullYear()}
                                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                    initialFocus
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
