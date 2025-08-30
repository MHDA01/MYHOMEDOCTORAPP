'use client';

import { useState, useContext, useRef, useEffect } from 'react';
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  FileText, PlusCircle, MoreVertical, FilePenLine, Trash2, Loader2, 
  X, Eye, Download, Camera 
} from "lucide-react";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogTrigger, DialogFooter, DialogClose, DialogDescription 
} from "@/components/ui/dialog";
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type DialogMode = 'add' | 'edit';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function DocumentList() {
  const context = useContext(UserContext);
  if (!context) throw new Error("DocumentList must be used within a UserProvider");

  const { documents, addDocument, updateDocument, deleteDocument, loading } = context;
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('add');
  const [selectedDoc, setSelectedDoc] = useState<DocumentType | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocumentType | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentType['category']>('Lab Result');
  const [studyDate, setStudyDate] = useState<Date | undefined>(new Date());
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);

  // State for camera and file handling
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          variant: "destructive",
          title: "Archivo demasiado grande",
          description: `El tamaño máximo es de ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const resetForm = () => {
    setName('');
    setCategory('Lab Result');
    setStudyDate(new Date());
    setSelectedFile(null);
    setIsSaving(false);
    if(fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getCategoryLabel = (category: DocumentType['category']) => {
    const labels: Record<DocumentType['category'], string> = {
      'Lab Result': 'Resultado de Laboratorio',
      'Imaging Report': 'Informe de Imagen',
      'Prescription': 'Receta',
      'Other': 'Otro'
    };
    return labels[category];
  };

  const handleOpenDialog = (mode: DialogMode, doc?: DocumentType) => {
    resetForm();
    setDialogMode(mode);
    if (mode === 'edit' && doc) {
      setSelectedDoc(doc);
      setName(doc.name);
      setCategory(doc.category);
      setStudyDate(doc.studyDate || doc.uploadedAt);
    } else {
      setSelectedDoc(null);
    }
    setIsDialogOpen(true);
  };

  const handleViewDialog = (doc: DocumentType) => {
    setViewingDoc(doc);
    setIsViewDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    toast({ title: "Documento eliminado." });
  };

  const handleSubmit = async () => {
    if (!name || !category || !studyDate) {
      toast({ variant: 'destructive', title: "Formulario incompleto", description: "Completa todos los campos, por favor." });
      return;
    }
    if (dialogMode === 'add' && !selectedFile) {
        toast({ variant: 'destructive', title: "Falta el archivo", description: "Debes seleccionar un archivo para guardar el documento." });
        return;
    }

    setIsSaving(true);
    try {
      if (dialogMode === 'add' && selectedFile) {
        await addDocument({ name, category, studyDate, uploadedAt: new Date(), file: selectedFile });
        toast({ title: "Documento guardado con éxito." });
      } else if (dialogMode === 'edit' && selectedDoc) {
        await updateDocument(selectedDoc.id, { name, category, studyDate });
        toast({ title: "Documento actualizado con éxito." });
      }
      setIsDialogOpen(false);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        toast({ variant: 'destructive', title: "Error al guardar", description: errorMessage });
    } finally {
        setIsSaving(false);
    }
  };

  const groupedDocuments = documents.reduce((acc, doc) => {
    const year = format(doc.studyDate || doc.uploadedAt, 'yyyy');
    if (!acc[year]) acc[year] = [];
    acc[year].push(doc);
    return acc;
  }, {} as Record<string, DocumentType[]>);

  const sortedYears = Object.keys(groupedDocuments).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-8 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardHeader>
        <CardContent className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></CardContent>
        <CardFooter><Skeleton className="h-10 w-40" /></CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <CardTitle className="font-headline text-xl">Documentos Médicos</CardTitle>
        </div>
        <CardDescription>Añade y gestiona tus exámenes, recetas e informes tomando una foto.</CardDescription>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed rounded-lg">
            <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No hay documentos</h3>
            <p className="mt-1 text-sm text-gray-500">Empieza tomando una foto de tu primer documento.</p>
            <div className="mt-6">
              <Button onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2" /> Añadir con Foto</Button>
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
                        <p className="text-sm text-muted-foreground">
                          {getCategoryLabel(doc.category)} - {format(doc.studyDate || doc.uploadedAt, "d 'de' MMMM", { locale: es })}
                        </p>
                      </button>
                      <div className="flex items-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDialog(doc)}><Eye className="mr-2 h-4 w-4" /> Ver Detalles</DropdownMenuItem>
                            {doc.url && <a href={doc.url} target="_blank" rel="noopener noreferrer" download><DropdownMenuItem><Download className="mr-2 h-4 w-4" /> Descargar</DropdownMenuItem></a>}
                            <DropdownMenuItem onClick={() => handleOpenDialog('edit', doc)}><FilePenLine className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(doc.id)}><Trash2 className="mr-2 h-4 w-4" /> Eliminar</DropdownMenuItem>
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
         <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { if(!isSaving) setIsDialogOpen(isOpen) }}>
            <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog('add')}>
                    <PlusCircle className="mr-2" /> Añadir con Foto
                </Button>
            </DialogTrigger>
            <DialogContent modal className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{dialogMode === 'add' ? 'Añadir Nuevo Documento' : 'Editar Documento'}</DialogTitle>
                    <DialogDescription>{dialogMode === 'add' ? 'Completa los datos y toma una foto del documento.' : 'Edita los detalles de tu documento.'}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[75vh] overflow-y-auto pr-4">
                    <div className="grid gap-2">
                        <Label htmlFor="doc-name">Nombre del Documento</Label>
                        <Input id="doc-name" placeholder="Ej: Examen de Sangre" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="category">Categoría</Label>
                            <Select value={category} onValueChange={(v: DocumentType['category']) => setCategory(v)}>
                                <SelectTrigger id="category"><SelectValue placeholder="Selecciona" /></SelectTrigger>
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
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !studyDate && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {studyDate ? format(studyDate, "PPP", { locale: es }) : <span>Elige fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start" portal={false}>
                                    <Calendar mode="single" selected={studyDate} onSelect={(d) => { setStudyDate(d); setIsDatePopoverOpen(false); }} initialFocus locale={es} toDate={new Date()} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear()}/>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    {dialogMode === 'add' && (
                        <div className="space-y-2">
                            <Label>Foto del Documento</Label>
                            <Input 
                                id="file-upload"
                                type="file"
                                accept="image/*,application/pdf"
                                capture="environment"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            {selectedFile ? (
                                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                                    <img src={URL.createObjectURL(selectedFile)} alt="Vista previa" className="w-full h-full object-contain"/>
                                    <Button variant="destructive" size="icon" className="absolute top-2 right-2" onClick={() => setSelectedFile(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" className="w-full h-24" onClick={() => fileInputRef.current?.click()}>
                                    <Camera className="mr-2"/> 
                                    Seleccionar o Tomar Foto
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline" disabled={isSaving}>Cancelar</Button></DialogClose>
                    <Button type="submit" onClick={handleSubmit} disabled={isSaving || (dialogMode === 'add' && !selectedFile)}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {dialogMode === 'add' ? 'Guardar Documento' : 'Guardar Cambios'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {viewingDoc && (
          <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{viewingDoc.name}</DialogTitle>
                <DialogDescription>{getCategoryLabel(viewingDoc.category)} • Fecha: {format(viewingDoc.studyDate || viewingDoc.uploadedAt, "d 'de' MMMM, yyyy", { locale: es })}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                <h3 className="font-semibold text-lg">Imagen del Documento</h3>
                <div className="space-y-2">
                  {viewingDoc.url ? (
                    <a href={viewingDoc.url} target="_blank" rel="noopener noreferrer" className="block border rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                      <img src={viewingDoc.url} alt={`Imagen de ${viewingDoc.name}`} className="w-full h-auto object-contain"/>
                    </a>
                  ) : (
                    <div className="flex items-center justify-center p-8 border-2 border-dashed rounded-lg"><Loader2 className="h-8 w-8 text-muted-foreground animate-spin"/><p className="ml-4 text-muted-foreground">Cargando imagen...</p></div>
                  )}
                </div>
              </div>
              <DialogFooter><DialogClose asChild><Button variant="outline">Cerrar</Button></DialogClose></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>
    </Card>
  );
}
