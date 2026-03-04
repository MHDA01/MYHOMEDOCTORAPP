'use client';

import { useState, useEffect, useContext, useMemo } from 'react';
import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc,
  getDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import type { FamilyProfile, FamilyProfileMedical } from '@/lib/types';
import { COLECCION_TUTOR, SUBCOLECCION_INTEGRANTES, SUBCOLECCION_HISTORIAL, DOC_HISTORIAL } from '@/lib/constants';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  UserPlus, Pencil, Trash2, HeartPulse, AlertCircle,
  Pill, Star, User, Users, Baby, Stethoscope, MapPin, Shield, FileText, Loader2
} from 'lucide-react';
import { MemberDocumentList } from '@/components/dashboard/member-document-list';

// Las rutas canónicas de Firestore están centralizadas en @/lib/constants

const RELATIONSHIPS = [
  'Titular', 'C�nyuge / Pareja', 'Hijo/a', 'Padre', 'Madre',
  'Hermano/a', 'Abuelo/a', 'Nieto/a', 'Otro familiar'
];

const countryHealthData: Record<string, {
  label: string;
  options: string[];
  requiresInputFor: string[];
  inputLabel: (opt: string) => string;
}> = {
  argentina: {
    label: 'Obra Social',
    options: ['No tengo', 'Obra Social Sindical', 'Obra Social de Direcci�n', 'PAMI', 'Medicina Prepaga'],
    requiresInputFor: ['PAMI', 'Medicina Prepaga'],
    inputLabel: (opt) => `Nombre de la ${opt}`
  },
  colombia: {
    label: 'Seguridad Social',
    options: ['No tengo', 'EPS contributiva', 'EPS subsidiada', 'Medicina Prepagada'],
    requiresInputFor: ['EPS contributiva', 'EPS subsidiada', 'Medicina Prepagada'],
    inputLabel: () => `�A qu� EPS o prepagada est� adscrito?`
  },
  chile: {
    label: 'Previsi�n',
    options: ['Fonasa', 'Isapre', 'Particular'],
    requiresInputFor: ['Isapre'],
    inputLabel: () => `Nombre de la Isapre`
  }
};

const emptyForm = {
  firstName: '',
  lastName: '',
  sex: 'male' as FamilyProfile['sex'],
  dateOfBirth: '',
  weight: undefined as number | undefined,
  country: undefined as FamilyProfile['country'],
  insuranceProvider: '',
  insuranceProviderName: '',
  relationship: '',
  esTitular: false,
  pathologicalHistory: '',
  surgicalHistory: '',
  gynecologicalHistory: '',
};

function calcAge(dob: string): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function sexLabel(sex: string) {
  if (sex === 'male') return 'Masculino';
  if (sex === 'female') return 'Femenino';
  return 'Indeterminado';
}

function sexIcon(sex: string) {
  if (sex === 'male') return '\u{1F468}';
  if (sex === 'female') return '\u{1F469}';
  return '\u{1F464}';
}

export function FamilyProfiles() {
  const context = useContext(UserContext);
  const [profiles, setProfiles] = useState<FamilyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingMedical, setLoadingMedical] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [ageDisplay, setAgeDisplay] = useState('');
  const [allergiesText, setAllergiesText] = useState('');
  const [medicationsText, setMedicationsText] = useState('');

  const userId = context?.user?.uid;
  const personalInfo = context?.personalInfo;
  const healthInfo  = context?.healthInfo;

  // Si no hay ningún Titular en Integrantes, se inyecta una tarjeta sintética
  // construida desde personalInfo del contexto para que siempre aparezca el tutor.
  const displayProfiles = useMemo<FamilyProfile[]>(() => {
    const hasTitular = profiles.some(p => p.esTitular || p.relationship === 'Titular');
    if (!hasTitular && personalInfo) {
      const dob = personalInfo.dateOfBirth instanceof Date
        ? personalInfo.dateOfBirth.toISOString().split('T')[0]
        : '';
      const titularCard: FamilyProfile = {
        id: '__tutor__',
        userId: userId || '',
        firstName: personalInfo.firstName || '',
        lastName: personalInfo.lastName || '',
        sex: personalInfo.sex || 'other',
        dateOfBirth: dob,
        age: dob ? calcAge(dob) : undefined,
        country: personalInfo.country,
        insuranceProvider: personalInfo.insuranceProvider || '',
        insuranceProviderName: personalInfo.insuranceProviderName || '',
        relationship: 'Titular',
        esTitular: true,
        allergies: healthInfo?.allergies || [],
        medications: healthInfo?.medications || [],
        hasHistory: !!(healthInfo?.pathologicalHistory || healthInfo?.surgicalHistory),
      };
      return [titularCard, ...profiles];
    }
    return profiles;
  }, [profiles, personalInfo, healthInfo, userId]);

  useEffect(() => {
    if (!userId) return;
    const ref = collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES);
    const unsub = onSnapshot(ref, (snap) => {
      const data: FamilyProfile[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<FamilyProfile, 'id'>)
      }));
      data.sort((a, b) => {
        const aT = a.esTitular || a.relationship === 'Titular';
        const bT = b.esTitular || b.relationship === 'Titular';
        if (aT && !bT) return -1;
        if (!aT && bT) return 1;
        return 0;
      });
      setProfiles(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (form.dateOfBirth) {
      setAgeDisplay(`${calcAge(form.dateOfBirth)} a�os`);
    } else {
      setAgeDisplay('');
    }
  }, [form.dateOfBirth]);

  const openNew = () => {
    setForm({ ...emptyForm });
    setAllergiesText('');
    setMedicationsText('');
    setEditingId(null);
    setAgeDisplay('');
    setSheetOpen(true);
  };

  const openEdit = async (profile: FamilyProfile) => {
    setForm({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      sex: profile.sex || 'male',
      dateOfBirth: profile.dateOfBirth || '',
      weight: profile.weight,
      country: profile.country,
      insuranceProvider: profile.insuranceProvider || '',
      insuranceProviderName: profile.insuranceProviderName || '',
      relationship: profile.relationship || '',
      esTitular: profile.esTitular || profile.relationship === 'Titular',
      // Se cargan de forma diferida desde historial/registro
      pathologicalHistory: '',
      surgicalHistory: '',
      gynecologicalHistory: '',
    });
    setAllergiesText((profile.allergies || []).join(', '));
    setMedicationsText((profile.medications || []).join(', '));
    setAgeDisplay(profile.dateOfBirth ? `${calcAge(profile.dateOfBirth)} a�os` : '');
    setSheetOpen(true);

    // Tarjeta sintética del tutor: carga historial desde el contexto, no desde Firestore
    if (profile.id === '__tutor__') {
      setEditingId(null); // se guardará como nuevo documento en Integrantes
      setForm(prev => ({
        ...prev,
        pathologicalHistory: healthInfo?.pathologicalHistory || '',
        surgicalHistory: healthInfo?.surgicalHistory || '',
        gynecologicalHistory: healthInfo?.gynecologicalHistory || '',
      }));
      setLoadingMedical(false);
      return;
    }

    setEditingId(profile.id);

    // Carga diferida: leer historial clínico pesado sólo al abrir el editor
    setLoadingMedical(true);
    try {
      const historialRef = doc(
        db,
        COLECCION_TUTOR, userId!,
        SUBCOLECCION_INTEGRANTES, profile.id,
        SUBCOLECCION_HISTORIAL, DOC_HISTORIAL
      );
      const snap = await getDoc(historialRef);
      if (snap.exists()) {
        const data = snap.data() as FamilyProfileMedical;
        setForm(prev => ({
          ...prev,
          pathologicalHistory: data.pathologicalHistory || '',
          surgicalHistory: data.surgicalHistory || '',
          gynecologicalHistory: data.gynecologicalHistory || '',
        }));
      }
    } catch (err) {
      console.warn('No se pudo cargar el historial clínico:', err);
    } finally {
      setLoadingMedical(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!form.firstName || !form.lastName || !form.dateOfBirth || !form.relationship) {
      alert('Por favor completa los campos requeridos: nombres, apellidos, fecha de nacimiento y parentesco.');
      return;
    }
    setSaving(true);

    // Documento padre: campos ligeros para las tarjetas
    const summaryData: Omit<FamilyProfile, 'id'> = {
      userId,
      firstName: form.firstName,
      lastName: form.lastName,
      sex: form.sex,
      dateOfBirth: form.dateOfBirth,
      age: calcAge(form.dateOfBirth),
      weight: form.weight ? Number(form.weight) : undefined,
      country: form.country,
      insuranceProvider: form.insuranceProvider || '',
      insuranceProviderName: form.insuranceProviderName || '',
      relationship: form.relationship,
      esTitular: form.relationship === 'Titular',
      allergies: allergiesText.split(',').map(s => s.trim()).filter(Boolean),
      medications: medicationsText.split(',').map(s => s.trim()).filter(Boolean),
      // Flag ligero para mostrar indicador en tarjeta sin leer el historial completo
      hasHistory: !!(form.pathologicalHistory || form.surgicalHistory || (form.sex === 'female' && form.gynecologicalHistory)),
      updatedAt: serverTimestamp(),
    };

    // Subcolección historial/registro: texto clínico pesado — sólo se lee al editar
    const medicalData: FamilyProfileMedical = {
      pathologicalHistory: form.pathologicalHistory || '',
      surgicalHistory: form.surgicalHistory || '',
      gynecologicalHistory: form.sex === 'female' ? (form.gynecologicalHistory || '') : '',
      updatedAt: serverTimestamp(),
    };

    try {
      let docIdToUpdate = editingId;
      if (!docIdToUpdate) {
        const existing = profiles.find(p =>
          p.firstName === form.firstName &&
          p.lastName === form.lastName &&
          p.dateOfBirth === form.dateOfBirth
        );
        if (existing) docIdToUpdate = existing.id;
      }

      if (docIdToUpdate) {
        const profileDocRef = doc(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, docIdToUpdate);
        const medicalDocRef = doc(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, docIdToUpdate, SUBCOLECCION_HISTORIAL, DOC_HISTORIAL);
        // Escritura paralela: ambos docs en una sola operación lógica
        await Promise.all([
          setDoc(profileDocRef, summaryData, { merge: true }),
          setDoc(medicalDocRef, medicalData, { merge: true }),
        ]);
      } else {
        const newRef = await addDoc(
          collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES),
          { ...summaryData, createdAt: serverTimestamp() }
        );
        await setDoc(
          doc(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, newRef.id, SUBCOLECCION_HISTORIAL, DOC_HISTORIAL),
          medicalData
        );
      }
      setSheetOpen(false);
    } catch (e: any) {
      alert(`Error al guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profileId: string) => {
    if (!userId) return;
    try {
      await deleteDoc(doc(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, profileId));
    } catch (e: any) {
      alert(`Error al eliminar: ${e.message}`);
    }
  };

  const selectedCountryData = form.country ? countryHealthData[form.country] : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Header perfiles */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-lg">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Grupo Familiar</h2>
            <p className="text-sm text-muted-foreground">
              {displayProfiles.length} perfil{displayProfiles.length !== 1 ? 'es' : ''} registrado{displayProfiles.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
          <UserPlus className="h-4 w-4" />
          Agregar Familiar
        </Button>
      </div>

      {/* Lista de perfiles */}
      {displayProfiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No hay perfiles familiares a�n</p>
            <p className="text-sm text-muted-foreground mt-1">Agrega el perfil del Titular y de tus familiares para comenzar</p>
            <Button onClick={openNew} variant="outline" className="mt-4 gap-2">
              <UserPlus className="h-4 w-4" />
              Crear primer perfil
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayProfiles.map(profile => {
            const esTitular = profile.esTitular || profile.relationship === 'Titular';
            const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
            const age = profile.dateOfBirth ? calcAge(profile.dateOfBirth) : profile.age;
            return (
              <Card
                key={profile.id}
                className={`relative hover:shadow-md transition-shadow ${esTitular ? 'ring-2 ring-amber-300 bg-amber-50/30' : ''}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-3xl">{sexIcon(profile.sex)}</span>
                      <div className="min-w-0">
                        <CardTitle className="text-base text-foreground truncate">{fullName || 'Sin nombre'}</CardTitle>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="secondary" className="bg-accent/10 text-accent text-xs">
                            {profile.relationship}
                          </Badge>
                          {esTitular && (
                            <Badge className="bg-amber-100 text-amber-800 text-xs border-amber-200">
                              <Star className="h-3 w-3 mr-1 fill-amber-500 text-amber-500" />
                              Titular
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-primary hover:bg-primary/10"
                        onClick={() => openEdit(profile)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!esTitular && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>�Eliminar perfil?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acci�n elimina permanentemente el perfil de <strong>{fullName}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => handleDelete(profile.id)}
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2 text-sm">
                  <div className="flex flex-wrap gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{sexLabel(profile.sex)}</span>
                    {age !== undefined && <span>{age} a�os</span>}
                    {profile.weight && <span>{profile.weight} kg</span>}
                    {profile.country && <span className="capitalize flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.country}</span>}
                  </div>
                  {profile.insuranceProvider && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3 text-primary" />
                      {profile.insuranceProvider}{profile.insuranceProviderName ? ` � ${profile.insuranceProviderName}` : ''}
                    </p>
                  )}
                  <div className="border-t pt-2 space-y-1">
                    {(profile.allergies || []).length > 0 && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 text-orange-400 mt-0.5 shrink-0" />
                        {profile.allergies!.join(', ')}
                      </p>
                    )}
                    {(profile.medications || []).length > 0 && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <Pill className="h-3 w-3 text-accent mt-0.5 shrink-0" />
                        {profile.medications!.join(', ')}
                      </p>
                    )}
                    {/* Flag ligero — no descarga el historial clínico completo */}
                    {profile.hasHistory && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <HeartPulse className="h-3 w-3 text-red-400 shrink-0" />
                        Tiene antecedentes médicos
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sheet Agregar/Editar con Tabs (igual estructura que Mi Historial) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-foreground">
              {editingId ? 'Editar Perfil Familiar' : 'Agregar Nuevo Perfil Familiar'}
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="personal" className="flex-1">
                <User className="h-4 w-4 mr-1" /> Info Personal
              </TabsTrigger>
              <TabsTrigger value="historial" className="flex-1">
                <HeartPulse className="h-4 w-4 mr-1" /> Historial M�dico
              </TabsTrigger>              <TabsTrigger value="documentos" className="flex-1">
                <FileText className="h-4 w-4 mr-1" /> Documentos
              </TabsTrigger>            </TabsList>

            {/* Tab: Informaci�n Personal */}
            <TabsContent value="personal" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fp-firstName">Nombres *</Label>
                  <Input
                    id="fp-firstName"
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="Ej: Mar�a"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fp-lastName">Apellidos *</Label>
                  <Input
                    id="fp-lastName"
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="Ej: Gonz�lez"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Parentesco *</Label>
                <Select
                  value={form.relationship}
                  onValueChange={v => setForm(f => ({ ...f, relationship: v, esTitular: v === 'Titular' }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona el parentesco" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sexo *</Label>
                <RadioGroup
                  value={form.sex}
                  onValueChange={v => setForm(f => ({ ...f, sex: v as FamilyProfile['sex'] }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="male" id="fp-male" />
                    <Label htmlFor="fp-male">Masculino</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="female" id="fp-female" />
                    <Label htmlFor="fp-female">Femenino</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="other" id="fp-other" />
                    <Label htmlFor="fp-other">Indeterminado</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fp-dob">Fecha de Nacimiento *</Label>
                  <Input
                    id="fp-dob" type="date"
                    value={form.dateOfBirth}
                    onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Edad calculada</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    {ageDisplay || '�'}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="fp-weight">Peso (kg)</Label>
                <Input
                  id="fp-weight" type="number" min="1" max="300"
                  value={form.weight ?? ''}
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="Ej: 70"
                />
              </div>

              <div className="space-y-1">
                <Label>Pa�s de Residencia</Label>
                <Select
                  value={form.country ?? ''}
                  onValueChange={v => setForm(f => ({
                    ...f,
                    country: v as FamilyProfile['country'],
                    insuranceProvider: '',
                    insuranceProviderName: ''
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona un pa�s" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chile">
                      <div className="flex items-center gap-2"><MapPin className="h-3 w-3" /> Chile</div>
                    </SelectItem>
                    <SelectItem value="argentina">
                      <div className="flex items-center gap-2"><MapPin className="h-3 w-3" /> Argentina</div>
                    </SelectItem>
                    <SelectItem value="colombia">
                      <div className="flex items-center gap-2"><MapPin className="h-3 w-3" /> Colombia</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedCountryData && (
                <div className="space-y-1">
                  <Label>{selectedCountryData.label}</Label>
                  <Select
                    value={form.insuranceProvider ?? ''}
                    onValueChange={v => setForm(f => ({ ...f, insuranceProvider: v, insuranceProviderName: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Selecciona ${selectedCountryData.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedCountryData.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedCountryData && form.insuranceProvider &&
                selectedCountryData.requiresInputFor.includes(form.insuranceProvider) && (
                  <div className="space-y-1">
                    <Label htmlFor="fp-insurance-name">
                      {selectedCountryData.inputLabel(form.insuranceProvider)}
                    </Label>
                    <Input
                      id="fp-insurance-name"
                      value={form.insuranceProviderName ?? ''}
                      onChange={e => setForm(f => ({ ...f, insuranceProviderName: e.target.value }))}
                    />
                  </div>
                )}
            </TabsContent>

            {/* Tab: Historial Médico */}
            <TabsContent value="historial" className="space-y-4">

              {/* Alergias y medicamentos: vienen del doc padre, disponibles de inmediato */}
              <div className="space-y-1">
                <Label htmlFor="fp-allergies" className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-orange-400" /> Alergias (separadas por comas)
                </Label>
                <Textarea
                  id="fp-allergies" rows={2}
                  value={allergiesText}
                  onChange={e => setAllergiesText(e.target.value)}
                  placeholder="Ej: Penicilina, Mariscos, Látex"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="fp-medications" className="flex items-center gap-1">
                  <Pill className="h-4 w-4 text-accent" /> Medicamentos Frecuentes (separados por comas)
                </Label>
                <Textarea
                  id="fp-medications" rows={2}
                  value={medicationsText}
                  onChange={e => setMedicationsText(e.target.value)}
                  placeholder="Ej: Metformina 850mg, Losartán 50mg"
                />
              </div>

              {/* Historial clínico pesado: cargado bajo demanda desde historial/registro */}
              {loadingMedical ? (
                <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Cargando historial clínico...</span>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="fp-pathological" className="flex items-center gap-1">
                      <HeartPulse className="h-4 w-4 text-red-400" /> Antecedentes Patológicos
                    </Label>
                    <Textarea
                      id="fp-pathological" rows={3}
                      value={form.pathologicalHistory ?? ''}
                      onChange={e => setForm(f => ({ ...f, pathologicalHistory: e.target.value }))}
                      placeholder="Ej: Hipertensión diagnosticada en 2010, Diabetes tipo 2..."
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="fp-surgical" className="flex items-center gap-1">
                      <Stethoscope className="h-4 w-4 text-purple-400" /> Antecedentes Quirúrgicos
                    </Label>
                    <Textarea
                      id="fp-surgical" rows={3}
                      value={form.surgicalHistory ?? ''}
                      onChange={e => setForm(f => ({ ...f, surgicalHistory: e.target.value }))}
                      placeholder="Ej: Apendicectomía en 2005, Cesárea en 2012..."
                    />
                  </div>

                  {form.sex === 'female' && (
                    <div className="space-y-1">
                      <Label htmlFor="fp-gyneco" className="flex items-center gap-1">
                        <Baby className="h-4 w-4 text-pink-400" /> Antecedentes Gineco-Obstétricos
                      </Label>
                      <Textarea
                        id="fp-gyneco" rows={3}
                        value={form.gynecologicalHistory ?? ''}
                        onChange={e => setForm(f => ({ ...f, gynecologicalHistory: e.target.value }))}
                        placeholder="Ej: G2P1A1, FUM: enero 2025..."
                      />
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* Tab: Documentos Médicos */}
            <TabsContent value="documentos" className="space-y-4">
              <MemberDocumentList userId={userId!} profileId={editingId} />
            </TabsContent>

          </Tabs>

          <SheetFooter className="mt-6 gap-2 flex-row justify-end">
            <SheetClose asChild>
              <Button variant="outline">Cancelar</Button>
            </SheetClose>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
