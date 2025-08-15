
'use client';

import { useState, useEffect, useContext, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, PlusCircle, MoreVertical, FilePenLine, Trash2, Loader2, UploadCloud, X, BrainCircuit, AlertTriangle, Eye, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Document as DocumentType } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from '../ui/checkbox';


type DialogMode = 'add' | 'edit';
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function DocumentList() {
    const context = useContext(UserContext);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedDoc, setSelectedDoc] = useState<DocumentType | null>(null);
    const [viewingDoc, setViewingDoc] = useState<DocumentType | null>(null);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [category, setCategory] = useState<DocumentType['category']>('Lab Result');
    const [studyDate, setStudyDate] = useState<Date | undefined>();
    const [files, setFiles] = useState<File[]>([]);
    const [consent, setConsent] = useState(false);

    const { toast } = useToast();
    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);

    if (!context) throw new Error("DocumentList must be used within a UserProvider");
    const { documents, addDocument, updateDocument, deleteDocument, loading } = context;

    const resetForm = () => {
        setName('');
        setCategory('Lab Result');
        setStudyDate(new Date());
        setFiles([]);
        setConsent(false);
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            if (files.length + newFiles.length > MAX_FILES) {
                toast({ variant: "destructive", title: `No puedes subir más de ${MAX_FILES} archivos.` });
                return;
            }
            const oversizedFiles = newFiles.filter(f => f.size > MAX_FILE_SIZE);
            if (oversizedFiles.length > 0) {
                toast({ variant: "destructive", title: `Algunos archivos superan el límite de ${MAX_FILE_SIZE / 1024 / 1024}MB.` });
                return;
            }
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleOpenDialog = (mode: DialogMode, doc?: DocumentType) => {
        setDialogMode(mode);
        if (mode === 'edit' && doc) {
            setSelectedDoc(doc);
            setName(doc.name);
            setCategory(doc.category);
            setStudyDate(doc.studyDate || doc.uploadedAt);
            setConsent(doc.consent);
            setFiles([]); // No se pueden editar los archivos, solo los metadatos
        } else {
            setSelectedDoc(null);
            resetForm();
        }
        setIsDialogOpen(true);
    };
    
    const handleViewDialog = (doc: DocumentType) => {
        setViewingDoc(doc);
        setIsViewDialogOpen(true);
    }

    const handleDelete = async (id: string) => {
        await deleteDocument(id);
        toast({ title: "Documento eliminado." });
    }

    const fileToDataUri = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    const handleSubmit = async () => {
        if (!name || !category || !studyDate) {
            toast({ variant: 'destructive', title: "Por favor, completa todos los campos." });
            return;
        }
        if (dialogMode === 'add' && files.length === 0) {
            toast({ variant: 'destructive', title: "Debes subir al menos un archivo." });
            return;
        }
        setIsSaving(true);
        
        try {
            if (dialogMode === 'add') {
                const dataUris = await Promise.all(files.map(fileToDataUri));
                const docData = { name, category, studyDate, uploadedAt: new Date(), urls: dataUris, consent };
                await addDocument(docData);
                toast({ title: "Documento guardado con éxito." });
            } else if (selectedDoc) {
                const updatedData: Partial<DocumentType> = { name, category, studyDate, consent };
                await updateDocument(selectedDoc.id, updatedData);
                toast({ title: "Documento actualizado con éxito." });
            }
        } catch (error) {
             toast({ variant: 'destructive', title: "Error al guardar el documento." });
             console.error("Error saving document: ", error);
        } finally {
            setIsSaving(false);
            setIsDialogOpen(false);
        }
    }
    
    const getCategoryLabel = (category: DocumentType['category']) => {
        const labels: Record<DocumentType['category'], string> = {
            'Lab Result': 'Resultado de Laboratorio',
            'Imaging Report': 'Informe de Imagen',
            'Prescription': 'Receta',
            'Other': 'Otro'
        };
        return labels[category];
    };

    const groupedDocuments = documents.reduce((acc, doc) => {
        const year = format(doc.studyDate || doc.uploadedAt, 'yyyy');
        if (!acc[year]) acc[year] = [];
        acc[year].push(doc);
        return acc;
    }, {} as Record<string, DocumentType[]>);

    const sortedYears = Object.keys(groupedDocuments).sort((a, b) => b.localeCompare(a));


    if(loading) {
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
                     <Skeleton className="h-10 w-40" />
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <CardTitle className="font-headline text-xl">Documentos Médicos</CardTitle>
                </div>
                <CardDescription>Sube y gestiona tus exámenes, recetas e informes.</CardDescription>
            </CardHeader>
            <CardContent>
                {documents.length === 0 ? (
                     <div className="text-center py-10 border-2 border-dashed rounded-lg">
                        <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">No hay documentos</h3>
                        <p className="mt-1 text-sm text-gray-500">Empieza subiendo tu primer documento.</p>
                        <div className="mt-6">
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2"/>Subir Documento</Button>
                                </DialogTrigger>
                                {/* Dialog Content is in the footer */}
                            </Dialog>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {sortedYears.map(year => (
                             <div key={year}>
                                <h3 className="text-lg font-semibold mb-3">{year}</h3>
                                <div className="space-y-3">
                                {groupedDocuments[year].map(doc => (
                                    <div key={doc.id} className="flex items-start justify-between rounded-lg border p-3 pl-4 hover:bg-muted/50 transition-colors">
                                        <button className="flex-1 text-left" onClick={() => handleViewDialog(doc)}>
                                            <p className="font-semibold">{doc.name}</p>
                                            <p className="text-sm text-muted-foreground">{getCategoryLabel(doc.category)} - {format(doc.studyDate || doc.uploadedAt, "d 'de' MMMM", { locale: es })}</p>
                                            {doc.aiSummary && (
                                                 <div className="flex items-center text-xs text-blue-600 mt-2 gap-1.5">
                                                    <BrainCircuit className="h-3 w-3" />
                                                    <span>Resumen de IA disponible</span>
                                                </div>
                                            )}
                                        </button>
                                        <div className="flex items-center">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleViewDialog(doc)}>
                                                        <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                                                    </DropdownMenuItem>
                                                    {doc.urls.length > 0 && 
                                                        <a href={doc.urls[0]} target="_blank" rel="noopener noreferrer" download={`documento-${doc.name}.png`}>
                                                            <DropdownMenuItem>
                                                                <Download className="mr-2 h-4 w-4" /> Descargar
                                                            </DropdownMenuItem>
                                                        </a>
                                                    }
                                                    <DropdownMenuItem onClick={() => handleOpenDialog('edit', doc)}>
                                                        <FilePenLine className="mr-2 h-4 w-4" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(doc.id)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
            <CardFooter>
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                         <Button onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2"/>Subir Documento</Button>
                    </DialogTrigger>
                    <DialogContent modal={true} className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Subir Nuevo Documento' : 'Editar Documento'}</DialogTitle>
                            <DialogDescription>
                                {dialogMode === 'add' ? 'Sube imágenes o PDFs de tus informes, recetas o resultados.' : 'Edita los detalles de tu documento.'}
                            </DialogDescription>
                        </DialogHeader>
                         <div className="grid gap-6 py-4 max-h-[75vh] overflow-y-auto pr-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doc-name">Nombre del Documento</Label>
                                <Input id="doc-name" placeholder="Ej: Examen de Sangre, Receta Oftalmológica" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="category">Categoría</Label>
                                    <Select value={category} onValueChange={(value: DocumentType['category']) => setCategory(value)}>
                                        <SelectTrigger id="category">
                                            <SelectValue placeholder="Selecciona una categoría" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Lab Result">Resultado de Laboratorio</SelectItem>
                                            <SelectItem value="Imaging Report">Informe de Imagen</SelectItem>
                                            <SelectItem value="Prescription">Receta</SelectItem>
                                            <SelectItem value="Other">Otro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Fecha del Estudio</Label>
                                    <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal", !studyDate && "text-muted-foreground")}
                                            >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {studyDate ? format(studyDate, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start" portal={false}>
                                            <Calendar
                                                mode="single"
                                                selected={studyDate}
                                                onSelect={(d) => { setStudyDate(d); setIsDatePopoverOpen(false); }}
                                                initialFocus
                                                locale={es}
                                                toDate={new Date()}
                                                captionLayout="dropdown-buttons"
                                                fromYear={1950}
                                                toYear={new Date().getFullYear()}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>

                           {dialogMode === 'add' && (
                            <div className="grid gap-2">
                                <Label>Archivos</Label>
                                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                                    <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                                    <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-semibold text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:text-primary/80">
                                        <span>Selecciona archivos para subir</span>
                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/*,application/pdf" onChange={handleFileChange} />
                                    </label>
                                    <p className="text-xs text-muted-foreground mt-1">Imágenes o PDF hasta {MAX_FILE_SIZE / 1024 / 1024}MB. Máximo {MAX_FILES} archivos.</p>
                                </div>
                                {files.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        <h4 className="font-medium text-sm">Archivos seleccionados:</h4>
                                        <ul className="divide-y rounded-md border">
                                            {files.map((file, index) => (
                                                <li key={index} className="flex items-center justify-between p-2 text-sm">
                                                    <span className="truncate">{file.name}</span>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFile(index)}>
                                                        <X className="h-4 w-4"/>
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                           )}

                             <div className="items-top flex space-x-2 mt-4">
                                <Checkbox id="terms1" checked={consent} onCheckedChange={(checked) => setConsent(Boolean(checked))} />
                                <div className="grid gap-1.5 leading-none">
                                    <label
                                    htmlFor="terms1"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                    Autorizo el análisis con IA
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                    Al marcar esta casilla, autorizas el uso de IA para procesar tu documento y generar un resumen. No se compartirán datos personales identificables. Revisa nuestros términos de privacidad.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                             <DialogClose asChild>
                                <Button variant="outline" disabled={isSaving}>Cancelar</Button>
                            </DialogClose>
                            <Button type="submit" onClick={handleSubmit} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {dialogMode === 'add' ? 'Subir y Guardar' : 'Guardar Cambios'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {viewingDoc && (
                    <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                        <DialogContent className="sm:max-w-3xl">
                            <DialogHeader>
                                <DialogTitle>{viewingDoc.name}</DialogTitle>
                                <DialogDescription>
                                    {getCategoryLabel(viewingDoc.category)} &bull; Fecha: {format(viewingDoc.studyDate || viewingDoc.uploadedAt, "d 'de' MMMM, yyyy", { locale: es })}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto pr-4">
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-lg">Imágenes del Documento</h3>
                                     <div className="space-y-2">
                                        {viewingDoc.urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block border rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                                                <img src={url} alt={`Página ${i+1}`} className="w-full h-auto object-contain" data-ai-hint="medical document"/>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                     <h3 className="font-semibold text-lg flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary"/> Resumen de IA</h3>
                                     {viewingDoc.aiSummary ? (
                                        <div className="space-y-4 text-sm p-4 bg-muted/50 rounded-lg">
                                            <div>
                                                <h4 className="font-semibold mb-1">Diagnóstico Principal</h4>
                                                <p className="text-muted-foreground">{viewingDoc.aiSummary.diagnosticoPrincipal}</p>
                                            </div>
                                             <div>
                                                <h4 className="font-semibold mb-1">Hallazgos Clave</h4>
                                                <ul className="list-disc list-inside pl-2 space-y-1 text-muted-foreground">
                                                    {viewingDoc.aiSummary.hallazgosClave && Array.isArray(viewingDoc.aiSummary.hallazgosClave) ? 
                                                        viewingDoc.aiSummary.hallazgosClave.map((item, i) => <li key={i}>{item}</li>)
                                                        : <li>No se encontraron hallazgos clave.</li>
                                                    }
                                                </ul>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold mb-1">Recomendaciones</h4>
                                                 <ul className="list-disc list-inside pl-2 space-y-1 text-muted-foreground">
                                                    {viewingDoc.aiSummary.recomendaciones && Array.isArray(viewingDoc.aiSummary.recomendaciones) ?
                                                        viewingDoc.aiSummary.recomendaciones.map((item, i) => <li key={i}>{item}</li>)
                                                        : <li>No se encontraron recomendaciones.</li>
                                                    }
                                                </ul>
                                            </div>
                                             <Alert variant="default" className="mt-4">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertTitle>Descargo de Responsabilidad</AlertTitle>
                                                <AlertDescription>
                                                   Este resumen fue generado por IA y es solo para fines informativos. Consulta siempre a un profesional médico para obtener un diagnóstico y tratamiento.
                                                </AlertDescription>
                                            </Alert>
                                        </div>
                                     ) : viewingDoc.consent ? (
                                        <div className="text-center p-6 border-2 border-dashed rounded-lg">
                                            <Loader2 className="mx-auto h-8 w-8 text-muted-foreground animate-spin" />
                                            <p className="mt-2 text-sm text-muted-foreground">El resumen aún se está procesando...</p>
                                        </div>
                                     ) : (
                                        <div className="text-center p-6 border-2 border-dashed rounded-lg">
                                            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
                                            <p className="mt-2 text-sm text-muted-foreground">No se generó un resumen de IA para este documento porque no se otorgó el consentimiento.</p>
                                        </div>
                                     )}
                                </div>
                            </div>
                             <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Cerrar</Button>
                                </DialogClose>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </CardFooter>
        </Card>
    );
}
