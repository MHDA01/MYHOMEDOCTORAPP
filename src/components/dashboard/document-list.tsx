
'use client';

import { useState, useContext, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, PlusCircle, MoreVertical, FilePenLine, Trash2, Loader2, X, Eye, Download, Camera, History } from "lucide-react";
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


type DialogMode = 'add' | 'edit';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function DocumentList() {
    const context = useContext(UserContext);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedDoc, setSelectedDoc] = useState<DocumentType | null>(null);
    const [viewingDoc, setViewingDoc] = useState<DocumentType | null>(null);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [category, setCategory] = useState<DocumentType['category']>('Lab Result');
    const [studyDate, setStudyDate] = useState<Date | undefined>(new Date());
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const { toast } = useToast();
    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState(true);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);

    if (!context) throw new Error("DocumentList must be used within a UserProvider");
    const { documents, addDocument, updateDocument, deleteDocument, loading } = context;
    
    const stopCameraStream = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    };
    
    useEffect(() => {
      let stream: MediaStream | null = null;
      const getCameraPermission = async () => {
        if (isCameraOpen) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            setHasCameraPermission(true);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } catch (error) {
            console.error("Error accessing camera:", error);
            setHasCameraPermission(false);
            toast({
              variant: "destructive",
              title: "Acceso a la cámara denegado",
              description: "Por favor, habilita los permisos de cámara en tu navegador.",
            });
          }
        }
      };
      getCameraPermission();
      return () => {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      };
    }, [isCameraOpen, toast]);


    const resetForm = () => {
        setName('');
        setCategory('Lab Result');
        setStudyDate(new Date());
        setSelectedFile(null);
        setCapturedImage(null);
        setIsCameraOpen(false);
    }

    const handleOpenDialog = (mode: DialogMode, doc?: DocumentType) => {
        setDialogMode(mode);
        resetForm();
        if (mode === 'edit' && doc) {
            setSelectedDoc(doc);
            setName(doc.name);
            setCategory(doc.category);
            setStudyDate(doc.studyDate || doc.uploadedAt);
        } else {
            setSelectedDoc(null);
            setStudyDate(new Date());
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
    
    const handleTakePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const dataUrl = canvas.toDataURL('image/png');
            setCapturedImage(dataUrl);
            stopCameraStream();
            setIsCameraOpen(false); // Close camera view after taking photo
        }
    }
    
    const handleConfirmPhoto = () => {
        if (capturedImage) {
            fetch(capturedImage)
                .then(res => res.blob())
                .then(blob => {
                    const file = new File([blob], `captura-${Date.now()}.png`, { type: 'image/png' });
                     if (file.size > MAX_FILE_SIZE) {
                        toast({ variant: "destructive", title: `La foto supera el límite de ${MAX_FILE_SIZE / 1024 / 1024}MB.` });
                        return;
                    }
                    setSelectedFile(file);
                });
        }
    }

    useEffect(() => {
        if (capturedImage) {
            handleConfirmPhoto();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [capturedImage]);


    const handleSubmit = async () => {
        if (dialogMode === 'add') {
            if (!name || !category || !studyDate || !selectedFile) {
                toast({ variant: 'destructive', title: "Formulario incompleto", description: "Por favor, completa todos los campos y toma una foto." });
                return;
            }
            
            setIsSaving(true);
            try {
                await addDocument({ name, category, studyDate, uploadedAt: new Date(), file: selectedFile });
                toast({ title: "Documento guardado con éxito." });
                setIsDialogOpen(false);
            } catch (error) {
                toast({ variant: 'destructive', title: "Error al guardar el documento.", description: (error as Error).message });
            } finally {
                setIsSaving(false);
            }

        } else if (dialogMode === 'edit' && selectedDoc) {
            if (!name || !category || !studyDate) {
                toast({ variant: 'destructive', title: "Formulario incompleto", description: "Por favor, completa todos los campos." });
                return;
            }

            setIsSaving(true);
            try {
                const updatedData: Partial<DocumentType> = { name, category, studyDate };
                await updateDocument(selectedDoc.id, updatedData);
                toast({ title: "Documento actualizado con éxito." });
                setIsDialogOpen(false);
            } catch (error) {
                toast({ variant: 'destructive', title: "Error al actualizar el documento.", description: (error as Error).message });
            } finally {
                 setIsSaving(false);
            }
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
                <CardDescription>Añade y gestiona tus exámenes, recetas e informes tomando una foto.</CardDescription>
            </CardHeader>
            <CardContent>
                {documents.length === 0 ? (
                     <div className="text-center py-10 border-2 border-dashed rounded-lg">
                        <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">No hay documentos</h3>
                        <p className="mt-1 text-sm text-gray-500">Empieza tomando una foto de tu primer documento.</p>
                        <div className="mt-6">
                            <Button onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2"/>Añadir con Foto</Button>
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
                                                    {doc.url && 
                                                        <a href={doc.url} target="_blank" rel="noopener noreferrer" download>
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
                 <Dialog open={isDialogOpen} onOpenChange={(open) => { if(!isSaving) { setIsDialogOpen(open); if(!open) stopCameraStream(); }}}>
                    <DialogTrigger asChild>
                         <Button onClick={() => handleOpenDialog('add')}><PlusCircle className="mr-2"/>Añadir con Foto</Button>
                    </DialogTrigger>
                    <DialogContent modal={true} className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Añadir Nuevo Documento' : 'Editar Documento'}</DialogTitle>
                             <DialogDescription>
                                {dialogMode === 'add' ? 'Completa los datos y toma una foto del documento.' : 'Edita los detalles de tu documento.'}
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
                                    <Select value={category} onValueChange={(value: DocumentType['category']) => setCategory(value)}>
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
                                            <Button
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal", !studyDate && "text-muted-foreground")}
                                            >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {studyDate ? format(studyDate, "PPP", { locale: es }) : <span>Elige fecha</span>}
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
                            <div className="space-y-2">
                                <Label>Foto del Documento</Label>
                                {capturedImage ? (
                                    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                                        <img src={capturedImage} alt="Captura" className="w-full h-full object-contain"/>
                                        <div className="absolute top-2 right-2">
                                            <Button variant="destructive" size="icon" onClick={() => { setCapturedImage(null); setSelectedFile(null);}}>
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
                             <DialogClose asChild>
                                <Button variant="outline" disabled={isSaving}>Cancelar</Button>
                             </DialogClose>
                            <Button type="submit" onClick={handleSubmit} disabled={isSaving || (dialogMode === 'add' && !selectedFile)}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                                <DialogDescription>
                                    {getCategoryLabel(viewingDoc.category)} &bull; Fecha: {format(viewingDoc.studyDate || viewingDoc.uploadedAt, "d 'de' MMMM, yyyy", { locale: es })}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                                <h3 className="font-semibold text-lg">Imagen del Documento</h3>
                                 <div className="space-y-2">
                                    {viewingDoc.url ? (
                                        <a href={viewingDoc.url} target="_blank" rel="noopener noreferrer" className="block border rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                                            <img src={viewingDoc.url} alt={`Imagen de ${viewingDoc.name}`} className="w-full h-auto object-contain" data-ai-hint="medical document"/>
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
                )}
            </CardFooter>
        </Card>
    );
}

    