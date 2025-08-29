'use client';

import { useState, useContext, useRef, useEffect, useCallback } from 'react';
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import {
  PlusCircle,
  FileText,
  MoreVertical,
  Eye,
  Download,
  FilePenLine,
  Trash2,
  Camera,
  Loader2,
  X,
  Calendar as CalendarIcon
} from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import { Skeleton } from '../ui/skeleton';
import { UserContext, MedicalDocument } from '@/context/user-context';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "../../lib/utils";

// Helper function from document-table and view-document-dialog
const getCategoryLabel = (category: MedicalDocument['category']) => {
    const labels: Record<MedicalDocument['category'], string> = {
      'Lab Result': 'Resultado de Laboratorio',
      'Imaging Report': 'Informe de Imagen',
      'Prescription': 'Receta',
      'Other': 'Otro'
    };
    return labels[category];
};

// --- Sub-components (inlined and not exported) ---

// From document-table.tsx
interface DocumentTableProps {
  documents: MedicalDocument[];
  onView: (doc: MedicalDocument) => void;
  onEdit: (doc: MedicalDocument) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

function DocumentTable({ documents, onView, onEdit, onDelete, onAdd }: DocumentTableProps) {
  const sortedDocuments = [...documents].sort((a, b) => {
    const dateA = a.studyDate || a.uploadedAt;
    const dateB = b.studyDate || b.uploadedAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedDocuments.length > 0 ? (
          sortedDocuments.map(doc => (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">{doc.name}</TableCell>
              <TableCell>{getCategoryLabel(doc.category)}</TableCell>
              <TableCell>{format(doc.studyDate || doc.uploadedAt, "d MMM yyyy", { locale: es })}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Más acciones</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(doc)}>
                      <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                    </DropdownMenuItem>
                    {doc.url &&
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" download>
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" /> Descargar
                        </DropdownMenuItem>
                      </a>
                    }
                    <DropdownMenuItem onClick={() => onEdit(doc)}>
                      <FilePenLine className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(doc.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className="h-48 text-center">
              <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No hay documentos</h3>
              <p className="mt-1 text-sm text-muted-foreground">Empieza tomando una foto de tu primer documento.</p>
              <Button className="mt-6" onClick={onAdd}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Añadir con Foto
              </Button>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// From document-dialog.tsx
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
type DialogMode = 'add' | 'edit';

interface DocumentDialogProps {
  mode: DialogMode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  docToEdit: MedicalDocument | null;
}

function DocumentDialog({ mode, isOpen, onOpenChange, docToEdit }: DocumentDialogProps) {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('DocumentDialog must be used within a UserProvider');
  }

  const { addDocument, updateDocument } = context;
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MedicalDocument['category']>('Lab Result');
  const [studyDate, setStudyDate] = useState<Date | undefined>(new Date());
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);

  const stopCameraStream = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetForm = useCallback(() => {
    setName('');
    setCategory('Lab Result');
    setStudyDate(new Date());
    setSelectedFile(null);
    setCapturedImage(null);
    setIsCameraOpen(false);
    setIsSaving(false);
    stopCameraStream();
  }, [stopCameraStream]);

  useEffect(() => {
    if (isOpen) {
        if (mode === 'edit' && docToEdit) {
            setName(docToEdit.name);
            setCategory(docToEdit.category);
            setStudyDate(docToEdit.studyDate || docToEdit.uploadedAt);
        } else {
            resetForm();
        }
    } else {
        resetForm();
    }
  }, [isOpen, mode, docToEdit, resetForm]);


  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isCameraOpen) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(s => {
          stream = s;
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.error("Error cámara:", err);
          setHasCameraPermission(false);
          toast({
            variant: "destructive",
            title: "Acceso a la cámara denegado",
            description: "Por favor, habilita los permisos de cámara en tu navegador.",
          });
        });
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isCameraOpen, toast]);

  const handleTakePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedImage(dataUrl);
      stopCameraStream();
      setIsCameraOpen(false);
    }
  };

  const handleConfirmPhoto = async () => {
    if (capturedImage) {
      const res = await fetch(capturedImage);
      const blob = await res.blob();
      const file = new File([blob], `captura-${Date.now()}.png`, { type: 'image/png' });

      if (file.size > MAX_FILE_SIZE) {
        toast({
          variant: "destructive",
          title: `La foto supera el límite de ${MAX_FILE_SIZE / 1024 / 1024}MB.`
        });
        return;
      }
      setSelectedFile(file);
      toast({ title: "Foto lista para guardar" });
    }
  };

  const handleSubmit = async () => {
    if (mode === 'add') {
      if (!name || !category || !studyDate || !selectedFile) {
        toast({ variant: 'destructive', title: "Formulario incompleto", description: "Completa todos los campos y toma una foto." });
        return;
      }

      setIsSaving(true);
      try {
        await addDocument({
          name,
          category,
          studyDate,
          file: selectedFile,
        });
        toast({ title: "Documento subido con éxito." });
        onOpenChange(false);
      } catch (error) {
        toast({ variant: 'destructive', title: "Error al subir el documento.", description: (error as Error).message });
      } finally {
        setIsSaving(false);
      }
    } else if (mode === 'edit' && docToEdit) {
      if (!name || !category || !studyDate) {
        toast({ variant: 'destructive', title: "Formulario incompleto", description: "Completa todos los campos." });
        return;
      }

      setIsSaving(true);
      try {
        const updatedData: Partial<Omit<MedicalDocument, 'id' | 'url' | 'storagePath'>> = { name, category, studyDate };
        await updateDocument(docToEdit.id, updatedData);
        toast({ title: "Documento actualizado con éxito." });
        onOpenChange(false);
      } catch (error) {
        toast({ variant: 'destructive', title: "Error al actualizar el documento.", description: (error as Error).message });
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDialogClose = (open: boolean) => {
      if (!isSaving) {
          onOpenChange(open);
          if (!open) {
              stopCameraStream();
          }
      }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Añadir Nuevo Documento' : 'Editar Documento'}</DialogTitle>
          <DialogDescription>
            {mode === 'add' ? 'Completa los datos y toma una foto del documento.' : 'Edita los detalles de tu documento.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[75vh] overflow-y-auto pr-4">
            <div className="grid gap-2">
                <Label htmlFor="doc-name">Nombre del Documento</Label>
                <Input id="doc-name" placeholder="Ej: Examen de Sangre" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="category">Categoría</Label>
                    <Select value={category} onValueChange={(v: MedicalDocument['category']) => setCategory(v)}>
                        <SelectTrigger id="category">
                        <SelectValue placeholder="Selecciona" />
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
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !studyDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {studyDate ? format(studyDate, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={studyDate}
                            onSelect={(d) => { setStudyDate(d); setIsDatePopoverOpen(false); }}
                            initialFocus
                            locale={es}
                            fromYear={new Date().getFullYear() - 120}
                            toYear={new Date().getFullYear()}
                        />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {mode === 'add' && (
            <div className="space-y-2">
                <Label>Foto del Documento</Label>
                {capturedImage ? (
                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                    <Image src={capturedImage} alt="Captura" fill className="object-contain"/>
                    <div className="absolute top-2 right-2 flex gap-2">
                    <Button variant="secondary" size="icon" onClick={handleConfirmPhoto}>
                        <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => { setCapturedImage(null); setSelectedFile(null); }}>
                        <X className="h-4 w-4" />
                    </Button>
                    </div>
                </div>
                ) : isCameraOpen ? (
                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                    <video ref={videoRef} className="w-full h-full object-contain" autoPlay muted playsInline></video>
                    {!hasCameraPermission && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white p-4 text-center">
                        <Camera className="h-8 w-8 mb-2" />
                        <p className="font-semibold">Cámara no disponible</p>
                        <p className="text-sm">Revisa los permisos de tu navegador.</p>
                    </div>
                    )}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <Button onClick={handleTakePhoto} disabled={!hasCameraPermission} size="lg" className="rounded-full w-16 h-16">
                        <Camera className="h-8 w-8"/>
                    </Button>
                    </div>
                    <canvas ref={canvasRef} className="hidden"></canvas>
                </div>
                ) : (
                <Button variant="outline" className="w-full h-24" onClick={() => setIsCameraOpen(true)}>
                    <Camera className="mr-2"/> Abrir Cámara
                </Button>
                )}
            </div>
            )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleDialogClose(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isSaving || (mode === 'add' && !selectedFile)}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'add' ? 'Guardar Documento' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// From view-document-dialog.tsx
interface ViewDocumentDialogProps {
  doc: MedicalDocument | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

function ViewDocumentDialog({ doc, isOpen, onOpenChange }: ViewDocumentDialogProps) {
  if (!doc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doc.name}</DialogTitle>
          <DialogDescription>
            {getCategoryLabel(doc.category)} • Fecha: {format(doc.studyDate || doc.uploadedAt, "d 'de' MMMM, yyyy", { locale: es })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <h3 className="font-semibold text-lg">Imagen del Documento</h3>
          <div className="space-y-2">
            {doc.url ? (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="relative block w-full aspect-video border rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                <Image src={doc.url} alt={`Imagen de ${doc.name}`} fill className="object-contain"/>
              </a>
            ) : (
              <div className="flex items-center justify-center p-8 border-2 border-dashed rounded-lg">
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin"/>
                <p className="ml-4 text-muted-foreground">Cargando imagen...</p>
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
  );
}


// --- Main Component ---

export function DocumentList() {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('DocumentList must be used within a UserProvider');
  }

  const { documents, deleteDocument, loading } = context;
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('add');
  const [docToEdit, setDocToEdit] = useState<MedicalDocument | null>(null);

  const [viewingDoc, setViewingDoc] = useState<MedicalDocument | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const handleOpenAddDialog = () => {
    setDialogMode('add');
    setDocToEdit(null);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (doc: MedicalDocument) => {
    setDialogMode('edit');
    setDocToEdit(doc);
    setIsDialogOpen(true);
  };

  const handleViewDialog = (doc: MedicalDocument) => {
    setViewingDoc(doc);
    setIsViewDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      toast({ title: "Documento eliminado." });
    } catch (error) {
      toast({ variant: 'destructive', title: "Error al eliminar el documento." });
    }
  };

  if (loading) {
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
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <FileText className="h-7 w-7 text-primary" />
            </div>
            <div>
              <CardTitle className="font-headline text-xl">Documentos Médicos</CardTitle>
              <CardDescription>Añade y gestiona tus exámenes, recetas e informes tomando una foto.</CardDescription>
            </div>
          </div>
          <Button onClick={handleOpenAddDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir con Foto
          </Button>
        </CardHeader>
        <CardContent>
          <DocumentTable
            documents={documents}
            onView={handleViewDialog}
            onEdit={handleOpenEditDialog}
            onDelete={handleDelete}
            onAdd={handleOpenAddDialog}
          />
        </CardContent>
      </Card>

      <DocumentDialog
        mode={dialogMode}
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        docToEdit={docToEdit}
      />

      <ViewDocumentDialog
        doc={viewingDoc}
        isOpen={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
      />
    </>
  );
}