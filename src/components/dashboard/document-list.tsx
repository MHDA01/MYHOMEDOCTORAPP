
'use client';

import { useState, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, PlusCircle, MoreVertical, FilePenLine, Trash2, Loader2, UploadCloud, X, BrainCircuit, AlertTriangle, Eye, Download, History } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


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

    const { toast } = useToast();
    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);

    if (!context) throw new Error("DocumentList must be used within a UserProvider");
    const { documents, addDocument, updateDocument, deleteDocument, loading } = context;

    const resetForm = () => {
        setName('');
        setCategory('Lab Result');
        setStudyDate(new Date());
        setFiles([]);
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
                const docData = { name, category, studyDate, uploadedAt: new Date(), files };
                await addDocument(docData);
                toast({ title: "Documento guardado con éxito." });
            } else if (selectedDoc) {
                const updatedData: Partial<DocumentType> = { name, category, studyDate };
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

    const getStatusIndicator = (doc: DocumentType) => {
        switch (doc.processingStatus) {
            case 'completed':
                if (doc.labResults && doc.labResults.length > 0) {
                    return (
                        <div className="flex items-center text-xs text-blue-600 mt-2 gap-1.5">
                            <BrainCircuit className="h-3 w-3" />
                            <span>Datos extraídos por IA</span>
                        </div>
                    );
                }
                return null;
            case 'processing':
                return (
                    <div className="flex items-center text-xs text-amber-600 mt-2 gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Procesando...</span>
                    </div>
                );
            case 'pending':
                 return (
                    <div className="flex items-center text-xs text-muted-foreground mt-2 gap-1.5">
                        <History className="h-3 w-3" />
                        <span>Pendiente de análisis</span>
                    </div>
                );
            case 'error':
                 return (
                    <div className="flex items-center text-xs text-destructive mt-2 gap-1.5">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Error al procesar</span>
                    </div>
                );
            default:
                if (!doc.labResults) {
                     return (
                        <div className="flex items-center text-xs text-muted-foreground mt-2 gap-1.5">
                            <History className="h-3 w-3" />
                            <span>Pendiente de análisis</span>
                        </div>
                    );
                }
                return null;
        }
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
                                            {getStatusIndicator(doc)}
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
                                     <h3 className="font-semibold text-lg flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary"/> Resultados por IA</h3>
                                     {viewingDoc.processingStatus === 'completed' && viewingDoc.labResults && viewingDoc.labResults.length > 0 ? (
                                        <div className="space-y-4 text-sm p-4 bg-muted/50 rounded-lg">
                                           <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Examen</TableHead>
                                                        <TableHead>Valor</TableHead>
                                                        <TableHead>Referencia</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {viewingDoc.labResults.map((result, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell className="font-medium">{result.examen}</TableCell>
                                                            <TableCell>{result.valor} {result.unidades}</TableCell>
                                                            <TableCell>{result.rangoDeReferencia}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                             <Alert variant="default" className="mt-4">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertTitle>Descargo de Responsabilidad</AlertTitle>
                                                <AlertDescription>
                                                   Estos datos fueron extraídos por IA y son solo para fines informativos. Compara siempre con el documento original y consulta a un profesional médico.
                                                </AlertDescription>
                                            </Alert>
                                        </div>
                                     ) : (
                                        <div className="text-center p-6 border-2 border-dashed rounded-lg">
                                            {viewingDoc.processingStatus === 'processing' ? (
                                                <>
                                                    <Loader2 className="mx-auto h-8 w-8 text-muted-foreground animate-spin" />
                                                    <p className="mt-2 text-sm text-muted-foreground">Los datos se están procesando...</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">Esto puede tardar unos minutos.</p>
                                                </>
                                            ) : (
                                                <>
                                                    {viewingDoc.processingStatus === 'error' ? (
                                                        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
                                                    ) : (
                                                        <History className="mx-auto h-8 w-8 text-muted-foreground" />
                                                    )}
                                                    <p className="mt-2 text-sm font-semibold">
                                                        {viewingDoc.processingStatus === 'error' ? 'Error en el procesamiento' : 'Análisis Pendiente'}
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {viewingDoc.processingError || 'La IA no pudo analizar este documento o aún no ha sido procesado.'}
                                                    </p>
                                                </>
                                            )}
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
