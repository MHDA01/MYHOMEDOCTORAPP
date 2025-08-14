
'use client';

import { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, FileText, View, Trash2, Camera, FilePenLine, RefreshCcw, SwitchCamera, Loader2, CalendarIcon, X, Upload, BrainCircuit, AlertCircle, FileUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Document } from '@/lib/types';
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '../ui/calendar';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Checkbox } from '../ui/checkbox';


type DialogMode = 'add' | 'edit';
const MAX_FILES = 10;

// Helper to convert a file to a data URI
const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

export function DocumentList() {
    const context = useContext(UserContext);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [capturedImages, setCapturedImages] = useState<string[]>([]); // Stores data URIs
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
    const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    
    // Form state
    const [docName, setDocName] = useState('');
    const [docCategory, setDocCategory] = useState<Document['category']>('Other');
    const [studyDate, setStudyDate] = useState<Date | undefined>(new Date());
    const [consentGiven, setConsentGiven] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const { toast } = useToast();

    if (!context) throw new Error("DocumentList must be used within a UserProvider");
    const { documents, addDocument, updateDocument, deleteDocument, loading } = context;

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    const startStream = useCallback(async (deviceId?: string) => {
        stopStream();
        if (hasCameraPermission !== true) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: deviceId ? { exact: deviceId } : undefined }
            });
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (error) {
            console.error('Error starting stream:', error);
            setHasCameraPermission(false);
            toast({ variant: 'destructive', title: 'Error de Cámara', description: 'No se pudo iniciar la cámara seleccionada.' });
        }
    }, [hasCameraPermission, stopStream, toast]);

    const initializeCamera = useCallback(async () => {
        if (dialogMode !== 'add' || !isDialogOpen) return;
        stopStream();

        try {
            const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
            setHasCameraPermission(true);
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(device => device.kind === 'videoinput');
            setVideoDevices(videoInputs);
            initialStream.getTracks().forEach(track => track.stop());
            const selectedDeviceId = videoInputs.length > 0 ? videoInputs[currentDeviceIndex].deviceId : undefined;
            await startStream(selectedDeviceId);
        } catch (error) {
            console.error('Error accessing camera:', error);
            setHasCameraPermission(false);
        }
    }, [dialogMode, isDialogOpen, stopStream, currentDeviceIndex, startStream]);

    useEffect(() => {
        if (isDialogOpen && dialogMode === 'add') initializeCamera();
        else stopStream();
        return () => stopStream();
    }, [isDialogOpen, dialogMode, initializeCamera, stopStream]);
    
    useEffect(() => {
        if (videoDevices.length > 0 && isDialogOpen && dialogMode === 'add') {
            const deviceId = videoDevices[currentDeviceIndex]?.deviceId;
            startStream(deviceId);
        }
    }, [currentDeviceIndex, videoDevices, isDialogOpen, dialogMode, startStream]);

    const resetForm = () => {
        setDocName('');
        setDocCategory('Other');
        setStudyDate(new Date());
        setCapturedImages([]);
        setCurrentDeviceIndex(0);
        setConsentGiven(false);
    };

    const handleOpenDialog = (mode: DialogMode, doc?: Document) => {
        setDialogMode(mode);
        if(mode === 'edit' && doc) {
            setSelectedDoc(doc);
            setDocName(doc.name);
            setDocCategory(doc.category);
            setStudyDate(doc.studyDate ? new Date(doc.studyDate) : new Date(doc.uploadedAt));
            setConsentGiven(doc.consent);
        } else {
            setSelectedDoc(null);
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const remainingSlots = MAX_FILES - capturedImages.length;
            if (files.length > remainingSlots) {
                toast({ variant: "destructive", title: `Límite de ${MAX_FILES} archivos excedido.`});
                return;
            }
            const dataUris = await Promise.all(files.map(fileToDataUri));
            setCapturedImages(prev => [...prev, ...dataUris]);
        }
    };

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current && capturedImages.length < MAX_FILES) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/png');
                setCapturedImages(prev => [...prev, dataUrl]);
            }
        }
    };

    const handleRemoveImage = (index: number) => {
        setCapturedImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleCameraSwitch = () => {
        if (videoDevices.length > 1) {
            setCurrentDeviceIndex((prevIndex) => (prevIndex + 1) % videoDevices.length);
        }
    };
    
    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            setStudyDate(selectedDate);
            setIsPopoverOpen(false);
        }
    }

    const handleSubmit = async () => {
        if (!docName || !docCategory) {
            toast({ variant: "destructive", title: "Por favor complete todos los campos" });
            return;
        }
        if (dialogMode === 'add' && capturedImages.length === 0) {
            toast({ variant: "destructive", title: "Por favor, capture o suba al menos una imagen del documento." });
            return;
        }
        if (dialogMode === 'add' && !consentGiven) {
            toast({ variant: "destructive", title: "Se requiere su consentimiento para procesar el documento." });
            return;
        }
        
        setIsSaving(true);

        if (dialogMode === 'add') {
            const docData = {
                name: docName,
                category: docCategory,
                urls: capturedImages,
                uploadedAt: new Date(),
                studyDate: studyDate || new Date(),
                consent: consentGiven
            };
            await addDocument(docData);
        } else if (selectedDoc) {
            await updateDocument(selectedDoc.id, { 
                name: docName, 
                category: docCategory, 
                studyDate: studyDate,
                consent: consentGiven,
            });
            toast({ title: "Documento actualizado" });
        }
        
        setIsSaving(false);
        setIsDialogOpen(false);
    };

    const handleDelete = async (docId: string) => {
        await deleteDocument(docId);
        toast({ title: "Documento eliminado" });
    }

    const getCategoryLabel = (category: Document['category']) => {
        switch (category) {
            case 'Lab Result': return 'Resultado de Laboratorio';
            case 'Imaging Report': return 'Informe de Imagen';
            case 'Prescription': return 'Receta';
            case 'Other': return 'Otro';
            default: return category;
        }
    };

    if (loading) {
         return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
                 <CardFooter>
                     <Skeleton className="h-10 w-52" />
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
                <CardDescription>Sube, visualiza y gestiona tus expedientes. La IA puede generar un resumen si lo autorizas.</CardDescription>
            </CardHeader>
            <CardContent>
                {documents.length > 0 ? (
                    <div className="space-y-3">
                        {documents.map((doc) => (
                           <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{doc.name}</p>
                                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 items-center">
                                        <Badge variant="secondary" className="mt-1">{getCategoryLabel(doc.category)}</Badge>
                                        <span className="mt-1">
                                            Estudio: {format(doc.studyDate || doc.uploadedAt, 'PP', { locale: es })}
                                        </span>
                                        {doc.aiSummary && <Badge variant="outline" className="mt-1 bg-blue-100 text-blue-800"><BrainCircuit className="h-3 w-3 mr-1" /> Resumido</Badge>}
                                    </div>
                                </div>
                                <div className="flex-shrink-0">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setViewingDoc(doc)}><View className="mr-2 h-4 w-4" /> Ver Detalles</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleOpenDialog('edit', doc)}><FilePenLine className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(doc.id)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                           </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-muted-foreground py-8">No has subido ningún documento.</p>
                )}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => handleOpenDialog('add')}><Camera className="mr-2"/>Añadir Documento</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Añadir Nuevo Documento' : 'Editar Documento'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                            {dialogMode === 'add' && (
                                <div className="space-y-4">
                                     <div className="space-y-2">
                                        <Label>Subir Archivos (PDF, JPG, PNG)</Label>
                                        <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                                            <FileUp className="mr-2"/> Seleccionar Archivos ({capturedImages.length}/{MAX_FILES})
                                        </Button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            className="hidden"
                                            multiple
                                            accept="image/*,application/pdf"
                                            onChange={handleFileChange}
                                        />
                                     </div>
                                     <div className="space-y-2 text-center">
                                         <Label>O tomar fotos con la cámara</Label>
                                         <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                                         {hasCameraPermission === false && (
                                             <Alert variant="destructive">
                                                <AlertTitle>Se requiere acceso a la cámara</AlertTitle>
                                                <AlertDescription>
                                                 Por favor, permite el acceso a la cámara para usar esta función.
                                                </AlertDescription>
                                               </Alert>
                                         )}
                                          <div className="flex justify-center gap-4">
                                                {videoDevices.length > 1 && (
                                                    <Button variant="outline" onClick={handleCameraSwitch} disabled={hasCameraPermission !== true}>
                                                        <SwitchCamera className="mr-2" /> Cambiar
                                                    </Button>
                                                )}
                                                <Button onClick={handleCapture} disabled={hasCameraPermission !== true || capturedImages.length >= MAX_FILES}>
                                                        <Camera className="mr-2" /> Tomar Foto
                                                </Button>
                                          </div>
                                     </div>
                                 <canvas ref={canvasRef} className="hidden" />
                                 {capturedImages.length > 0 && (
                                     <div className="space-y-2">
                                         <Label>Imágenes para subir ({capturedImages.length}/{MAX_FILES})</Label>
                                         <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                             {capturedImages.map((imgSrc, index) => (
                                                 <div key={index} className="relative">
                                                     <Image src={imgSrc} alt={`Captura ${index + 1}`} width={100} height={100} className="rounded-md object-cover w-full aspect-square" />
                                                     <Button size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => handleRemoveImage(index)}>
                                                         <X className="h-4 w-4" />
                                                     </Button>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                 )}
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="doc-name">Nombre del Documento</Label>
                                <Input id="doc-name" placeholder="ej., Resultados de Análisis de Sangre" value={docName} onChange={e => setDocName(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Categoría</Label>
                                    <Select value={docCategory} onValueChange={(value) => setDocCategory(value as Document['category'])}>
                                        <SelectTrigger id="doc-category">
                                            <SelectValue placeholder="Selecciona una categoría" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Lab Result">Resultado de Laboratorio</SelectItem>
                                            <SelectItem value="Prescription">Receta</SelectItem>
                                            <SelectItem value="Imaging Report">Informe de Imagen</SelectItem>
                                            <SelectItem value="Other">Otro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Fecha del Estudio</Label>
                                    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal",!studyDate && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {studyDate ? format(studyDate, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start" portal={false}>
                                            <Calendar
                                                mode="single" selected={studyDate} onSelect={handleDateSelect}
                                                initialFocus locale={es} captionLayout="dropdown-buttons"
                                                fromYear={new Date().getFullYear() - 80} toYear={new Date().getFullYear()}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                             {dialogMode === 'add' && (
                                <div className="items-top flex space-x-2 mt-4 rounded-md border p-4">
                                    <Checkbox id="terms1" checked={consentGiven} onCheckedChange={(checked) => setConsentGiven(checked as boolean)} />
                                    <div className="grid gap-1.5 leading-none">
                                        <label htmlFor="terms1" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Consentimiento de Procesamiento de Datos
                                        </label>
                                        <p className="text-xs text-muted-foreground">
                                          Al marcar esta casilla, autorizo a la aplicación a procesar los documentos subidos con una IA para extraer texto y generar un resumen. Entiendo que debo revisar el resumen generado.
                                        </p>
                                    </div>
                                </div>
                             )}
                        </div>
                        <DialogFooter>
                           <DialogClose asChild>
                               <Button variant="outline" disabled={isSaving}>Cancelar</Button>
                           </DialogClose>
                             <Button type="submit" onClick={handleSubmit} disabled={isSaving || (dialogMode === 'add' && (capturedImages.length === 0 || !consentGiven))}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSaving ? 'Procesando...' : 'Guardar Documento'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
            
            <Dialog open={!!viewingDoc} onOpenChange={(open) => !open && setViewingDoc(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{viewingDoc?.name}</DialogTitle>
                         <DialogDescription>
                            {getCategoryLabel(viewingDoc?.category ?? 'Other')} - Estudiado el {viewingDoc ? format(viewingDoc.studyDate || viewingDoc.uploadedAt, 'PPp', {locale: es}) : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-6">
                        {viewingDoc?.aiSummary && (
                            <Card className="bg-blue-50 border-blue-200">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2 text-blue-900"><BrainCircuit/> Resumen de IA</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 text-sm text-blue-800">
                                    <div>
                                        <h4 className="font-semibold mb-1">Diagnóstico Principal</h4>
                                        <p>{viewingDoc.aiSummary.diagnosticoPrincipal}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold mb-1">Hallazgos Clave</h4>
                                        <ul className="list-disc list-inside pl-2 space-y-1">
                                            {viewingDoc.aiSummary.hallazgosClave.map((item, i) => <li key={i}>{item}</li>)}
                                        </ul>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold mb-1">Recomendaciones</h4>
                                        <ul className="list-disc list-inside pl-2 space-y-1">
                                            {viewingDoc.aiSummary.recomendaciones.map((item, i) => <li key={i}>{item}</li>)}
                                        </ul>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Alert variant="default" className="bg-blue-100 border-blue-300">
                                        <AlertCircle className="h-4 w-4 !text-blue-700" />
                                        <AlertTitle className="text-blue-800">Descargo de Responsabilidad</AlertTitle>
                                        <AlertDescription className="text-blue-700">
                                            Este resumen fue generado por IA y es solo para fines informativos. Debe ser revisado por un profesional médico.
                                        </AlertDescription>
                                    </Alert>
                                </CardFooter>
                            </Card>
                        )}
                        {viewingDoc?.urls && viewingDoc.urls.length > 0 && (
                            <Carousel className="w-full">
                                <CarouselContent>
                                    {viewingDoc.urls.map((url, index) => (
                                        <CarouselItem key={index}>
                                            <div className="p-1">
                                                <div className="relative aspect-[3/4] w-full bg-muted rounded-md overflow-hidden">
                                                    <Image src={url} alt={`Vista previa de ${viewingDoc.name} - Página ${index + 1}`} layout="fill" objectFit="contain" />
                                                </div>
                                                 <p className="text-center text-sm text-muted-foreground mt-2">Página {index + 1} de {viewingDoc.urls.length}</p>
                                            </div>
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                <CarouselPrevious />
                                <CarouselNext />
                            </Carousel>
                        )}
                    </div>
                     <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cerrar</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </Card>
    );
}
