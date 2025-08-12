
'use client';

import { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, FileText, View, Trash2, Camera, FilePenLine, RefreshCcw, SwitchCamera, Loader2 } from "lucide-react";
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

type DialogMode = 'add' | 'edit';

export function DocumentList() {
    const context = useContext(UserContext);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
    const [viewingDoc, setViewingDoc] = useState<Document | null>(null);

    // Form state
    const [docName, setDocName] = useState('');
    const [docCategory, setDocCategory] = useState<Document['category']>('Other');

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
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

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (error) {
            console.error('Error starting stream:', error);
            setHasCameraPermission(false);
             toast({
                variant: 'destructive',
                title: 'Error de Cámara',
                description: 'No se pudo iniciar la cámara seleccionada.',
            });
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
            toast({
                variant: 'destructive',
                title: 'Acceso a la cámara denegado',
                description: 'Por favor, activa los permisos de la cámara en la configuración de tu navegador para usar esta función.',
            });
        }
    }, [dialogMode, isDialogOpen, stopStream, currentDeviceIndex, startStream, toast]);

    useEffect(() => {
        if (isDialogOpen && dialogMode === 'add' && !capturedImage) {
           initializeCamera();
        } else {
            stopStream();
        }
        
        return () => stopStream();
    }, [isDialogOpen, dialogMode, capturedImage, initializeCamera, stopStream]);
    
     useEffect(() => {
        if (videoDevices.length > 0 && isDialogOpen && dialogMode === 'add' && !capturedImage) {
            const deviceId = videoDevices[currentDeviceIndex]?.deviceId;
            startStream(deviceId);
        }
    }, [currentDeviceIndex, videoDevices, isDialogOpen, dialogMode, capturedImage, startStream]);

    const resetForm = () => {
        setDocName('');
        setDocCategory('Other');
        setCapturedImage(null);
        setCurrentDeviceIndex(0);
    };

    const handleOpenDialog = (mode: DialogMode, doc?: Document) => {
        setDialogMode(mode);
        if(mode === 'edit' && doc) {
            setSelectedDoc(doc);
            setDocName(doc.name);
            setDocCategory(doc.category);
        } else {
            setSelectedDoc(null);
            resetForm();
        }
        setIsDialogOpen(true);
    };

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if(context) {
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/png');
                setCapturedImage(dataUrl);
                stopStream();
            }
        }
    };

    const handleRetake = () => {
        setCapturedImage(null);
    };

    const handleCameraSwitch = () => {
        if (videoDevices.length > 1) {
            setCurrentDeviceIndex((prevIndex) => (prevIndex + 1) % videoDevices.length);
        }
    };

    const handleSubmit = async () => {
        if (!docName || !docCategory) {
            toast({ variant: "destructive", title: "Por favor complete todos los campos" });
            return;
        }
        if (dialogMode === 'add' && !capturedImage) {
            toast({ variant: "destructive", title: "Por favor, capture una foto del documento." });
            return;
        }
        
        setIsSaving(true);
        const docData = {
            name: docName,
            category: docCategory,
            url: capturedImage || selectedDoc?.url || '#',
            uploadedAt: new Date(),
        };

        if (dialogMode === 'add') {
            await addDocument(docData);
            toast({ title: "Documento guardado con éxito" });
        } else if (selectedDoc) {
            await updateDocument(selectedDoc.id, { name: docName, category: docCategory });
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
                <CardDescription>Sube, visualiza y gestiona tus expedientes médicos.</CardDescription>
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
                                        <span className="mt-1">{format(doc.uploadedAt, 'PP', { locale: es })}</span>
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
                                            <DropdownMenuItem onClick={() => setViewingDoc(doc)}><View className="mr-2 h-4 w-4" /> Ver</DropdownMenuItem>
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
            <CardFooter>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => handleOpenDialog('add')}><Camera className="mr-2"/>Tomar Foto de Documento</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Capturar Nuevo Documento' : 'Editar Documento'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                            {dialogMode === 'add' && (
                                <div className="space-y-4">
                                 {capturedImage ? (
                                     <div className="space-y-4 text-center">
                                         <img src={capturedImage} alt="Documento capturado" className="rounded-md w-full" />
                                         <Button variant="outline" onClick={handleRetake}>
                                             <RefreshCcw className="mr-2 h-4 w-4" />
                                             Tomar de Nuevo
                                         </Button>
                                     </div>
                                 ) : (
                                     <div className="space-y-4 text-center">
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
                                                        <SwitchCamera className="mr-2" /> Cambiar Cámara
                                                    </Button>
                                                )}
                                                <Button onClick={handleCapture} disabled={hasCameraPermission !== true}>
                                                        <Camera className="mr-2" /> Tomar Foto
                                                </Button>
                                          </div>
                                     </div>
                                 )}
                                 <canvas ref={canvasRef} className="hidden" />
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="doc-name">Nombre del Documento</Label>
                                <Input id="doc-name" placeholder="ej., Resultados de Análisis de Sangre" value={docName} onChange={e => setDocName(e.target.value)} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="doc-category">Categoría</Label>
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
                        </div>
                        <DialogFooter>
                           <DialogClose asChild>
                               <Button variant="outline" disabled={isSaving}>Cancelar</Button>
                           </DialogClose>
                             <Button type="submit" onClick={handleSubmit} disabled={isSaving || (dialogMode === 'add' && !capturedImage)}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Documento
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
                            {getCategoryLabel(viewingDoc?.category ?? 'Other')} - Subido el {viewingDoc ? format(viewingDoc.uploadedAt, 'PPp', {locale: es}) : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="relative mt-4" style={{'aspectRatio': '1/1.41'}}>
                        {viewingDoc?.url && (
                            <Image src={viewingDoc.url} alt={`Vista previa de ${viewingDoc.name}`} layout="fill" objectFit="contain" />
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

    