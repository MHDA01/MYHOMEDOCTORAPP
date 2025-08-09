
'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { User, FilePenLine, HeartPulse, Hospital, Loader2, MapPin } from "lucide-react";
import type { PersonalInfo as PersonalInfoType } from '@/lib/types';
import { format, differenceInYears, isValid, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';


const calculateAge = (dob: Date | undefined): string => {
    if (!dob || !isValid(dob)) return '';
    const today = new Date();
    const years = differenceInYears(today, dob);
    if (years < 0) return '';
    return `${years} años`;
};

const getValidDate = (date: string | Date | undefined): Date | undefined => {
    if (!date) return undefined;
    const d = date instanceof Date ? date : new Date(date);
    return isValid(d) ? d : undefined;
}

const countryHealthData = {
    argentina: {
      label: 'Obra Social',
      options: ['No tengo', 'Obra Social Sindical', 'Obra Social de Dirección', 'PAMI', 'Medicina Prepaga'],
      requiresInputFor: ['PAMI', 'Medicina Prepaga'],
      inputLabel: (option: string) => `Nombre de la ${option}`
    },
    colombia: {
      label: 'Seguridad Social',
      options: ['No tengo', 'EPS contributiva', 'EPS subsidiada', 'Medicina Prepagada'],
      requiresInputFor: ['EPS contributiva', 'EPS subsidiada', 'Medicina Prepagada'],
      inputLabel: () => `¿A qué EPS o prepagada está adscrito?`
    },
    chile: {
      label: 'Previsión',
      options: ['Fonasa', 'Isapre', 'Particular'],
      requiresInputFor: ['Isapre'],
      inputLabel: () => `Nombre de la Isapre`
    }
};


export function PersonalInfo() {
  const context = useContext(UserContext);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editableInfo, setEditableInfo] = useState<PersonalInfoType | null>(null);
  const [age, setAge] = useState<string>('');
  
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

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
      setEditableInfo(context.personalInfo);
      const dob = getValidDate(context.personalInfo.dateOfBirth);
      if (dob) {
        setDay(format(dob, 'dd'));
        setMonth(format(dob, 'MM'));
        setYear(format(dob, 'yyyy'));
      }
    }
  }, [context?.personalInfo, isDialogOpen]);

  if (!context) {
    throw new Error('PersonalInfo must be used within a UserProvider');
  }

  const { personalInfo, updatePersonalInfo, loading } = context;

  const handleEditClick = () => {
    if (personalInfo) {
      setEditableInfo({ ...personalInfo });
      setIsDialogOpen(true);
    }
  }

  const handleSave = async () => {
    if (editableInfo) {
      setIsSaving(true);
      const newDate = parse(`${year}-${month}-${day}`, 'yyyy-MM-dd', new Date());
      
      const updatedInfo: PersonalInfoType = {
          ...editableInfo,
          dateOfBirth: isValid(newDate) ? newDate : editableInfo.dateOfBirth,
      };

      await updatePersonalInfo(updatedInfo);
      setIsSaving(false);
      setIsDialogOpen(false);
    }
  }

  const handleCountryChange = (country: PersonalInfoType['country']) => {
    if (editableInfo) {
        setEditableInfo({
            ...editableInfo,
            country: country,
            insuranceProvider: '',
            insuranceProviderName: '',
        });
    }
  }

  const handleInsuranceChange = (provider: string) => {
    if (editableInfo) {
        setEditableInfo({
            ...editableInfo,
            insuranceProvider: provider,
            insuranceProviderName: '',
        });
    }
  }
  
  const displayDob = getValidDate(personalInfo?.dateOfBirth);
  
  const selectedCountryData = personalInfo ? countryHealthData[personalInfo.country] : null;
  const requiresProviderName = selectedCountryData && selectedCountryData.requiresInputFor.includes(personalInfo?.insuranceProvider || '');


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
        <CardDescription>Tus datos personales, país y sistema de salud.</CardDescription>
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
            <div><strong>País:</strong><p className="text-muted-foreground capitalize">{personalInfo.country}</p></div>
            {selectedCountryData && (
                 <div>
                    <strong>{selectedCountryData.label}:</strong>
                    <p className="text-muted-foreground">{personalInfo.insuranceProvider}</p>
                </div>
            )}
            {requiresProviderName && (
                <div>
                    <strong>Nombre de la Entidad:</strong>
                    <p className="text-muted-foreground">{personalInfo.insuranceProviderName}</p>
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
                        <div className="flex items-center gap-2">
                            <Input type="number" value={day} onChange={(e) => setDay(e.target.value)} placeholder="DD" aria-label="Día de nacimiento" />
                            <Input type="number" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="MM" aria-label="Mes de nacimiento" />
                            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="AAAA" aria-label="Año de nacimiento" />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label>País de Residencia</Label>
                        <Select value={editableInfo.country} onValueChange={(value) => handleCountryChange(value as PersonalInfoType['country'])}>
                            <SelectTrigger><SelectValue placeholder="Selecciona un país" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="chile"><div className="flex items-center gap-2"><MapPin/> Chile</div></SelectItem>
                                <SelectItem value="argentina"><div className="flex items-center gap-2"><MapPin/> Argentina</div></SelectItem>
                                <SelectItem value="colombia"><div className="flex items-center gap-2"><MapPin/> Colombia</div></SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {editableInfo.country && countryHealthData[editableInfo.country] && (
                        <div className="grid gap-2">
                            <Label>{countryHealthData[editableInfo.country].label}</Label>
                            <Select value={editableInfo.insuranceProvider} onValueChange={(value) => handleInsuranceChange(value)}>
                                <SelectTrigger><SelectValue placeholder={`Selecciona tu ${countryHealthData[editableInfo.country].label.toLowerCase()}`} /></SelectTrigger>
                                <SelectContent>
                                    {countryHealthData[editableInfo.country].options.map(opt => (
                                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    
                    {editableInfo.country && countryHealthData[editableInfo.country]?.requiresInputFor.includes(editableInfo.insuranceProvider) && (
                        <div className="grid gap-2">
                            <Label htmlFor="insuranceProviderName">{countryHealthData[editableInfo.country].inputLabel(editableInfo.insuranceProvider)}</Label>
                            <Input id="insuranceProviderName" value={editableInfo.insuranceProviderName} onChange={(e) => setEditableInfo({...editableInfo, insuranceProviderName: e.target.value})} />
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
