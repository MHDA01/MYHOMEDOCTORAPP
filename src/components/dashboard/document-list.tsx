
'use client';

import { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, FileText, Eye, Trash2, Camera, FilePenLine, RefreshCcw, SwitchCamera, Loader2, BrainCircuit, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Document, IdpExtracted } from '@/lib/types';
import { uploadMedicalDocumentEphemeral } from '@/lib/upload-medical-document';
import { Progress } from '@/components/ui/progress';
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { UserContext } from '@/context/user-context';
import { Skeleton } from '@/components/ui/skeleton';


type DialogMode = 'add' | 'edit';

/** Badge visual para el estado IDP */
function IdpStatusBadge({ status }: { status?: Document['idpStatus'] }) {
    switch (status) {
        case 'pending':
            return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 gap-1"><Clock className="h-3 w-3" />Pendiente</Badge>;
        case 'processing':
            return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Procesando</Badge>;
        case 'done':
            return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 gap-1"><CheckCircle2 className="h-3 w-3" />Listo</Badge>;
        case 'error':
            return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 gap-1"><AlertCircle className="h-3 w-3" />Error</Badge>;
        default:
            return <Badge variant="outline" className="text-muted-foreground gap-1">—</Badge>;
    }
}

/** Dialog para visualizar los datos extraídos por IDP */
function IdpResultsDialog({ doc, open, onOpenChange }: { doc: Document | null; open: boolean; onOpenChange: (v: boolean) => void }) {
    const extracted = doc?.idpExtracted as IdpExtracted | undefined;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BrainCircuit className="h-5 w-5 text-primary" />
                        Resultados IA — {doc?.name}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {doc?.idpStatus === 'error' && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error de procesamiento</AlertTitle>
                            <AlertDescription>{doc.idpError ?? 'Error desconocido'}</AlertDescription>
                        </Alert>
                    )}
                    {extracted ? (
                        <>
                            {extracted.estudio && (
                                <div>
                                    <p className="text-sm font-semibold text-muted-foreground">Estudio</p>
                                    <p className="text-base font-medium">{extracted.estudio}</p>
                                </div>
                            )}
                            {extracted.resultados && extracted.resultados.length > 0 && (
                                <div>
                                    <p className="text-sm font-semibold text-muted-foreground mb-2">Resultados</p>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Parámetro</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Referencia</TableHead>
                                                <TableHead>Interpretación</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {extracted.resultados.map((r, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="font-medium">{r.parametro}</TableCell>
                                                    <TableCell>{r.valor}</TableCell>
                                                    <TableCell className="text-muted-foreground">{r.referencia ?? '—'}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={r.interpretacion === 'Normal' ? 'secondary' : 'destructive'} className="text-xs">
                                                            {r.interpretacion ?? '—'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                            {extracted.conclusion_general && (
                                <div>
                                    <p className="text-sm font-semibold text-muted-foreground">Conclusión General</p>
                                    <p className="text-sm">{extracted.conclusion_general}</p>
                                </div>
                            )}
                        </>
                    ) : doc?.idpStatus !== 'error' ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No hay datos extraídos disponibles.</p>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function DocumentList() {
    const context = useContext(UserContext);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Form state
    const [docName, setDocName] = useState('');
    const [docCategory, setDocCategory] = useState<Document['category']>('Other');

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const { toast } = useToast();

    if (!context) throw new Error("DocumentList must be used within a UserProvider");
    const { documents, addDocument, updateDocument, deleteDocument, loading, user } = context;

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
            // Solicitar permiso y obtener stream (preferir cámara trasera para documentos)
            const initialStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            setHasCameraPermission(true);
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(device => device.kind === 'videoinput');
            setVideoDevices(videoInputs);

            // Usar directamente el stream obtenido (evita stale closure con startStream)
            streamRef.current = initialStream;
            if (videoRef.current) {
                videoRef.current.srcObject = initialStream;
            }
        } catch (error) {
            console.error('Error accessing camera:', error);
            setHasCameraPermission(false);
            toast({
                variant: 'destructive',
                title: 'Acceso a la cámara denegado',
                description: 'Por favor, activa los permisos de la cámara en la configuración de tu navegador para usar esta función.',
            });
        }
    }, [dialogMode, isDialogOpen, stopStream, toast]);

    useEffect(() => {
        if (isDialogOpen && dialogMode === 'add' && !capturedImage) {
           initializeCamera();
        } else {
            stopStream();
        }
        
        return () => stopStream();
    }, [isDialogOpen, dialogMode, capturedImage, initializeCamera, stopStream]);

    const resetForm = () => {
        setDocName('');
        setDocCategory('Other');
        setCapturedImage(null);
        setCurrentDeviceIndex(0);
        setUploadProgress(0);
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

            if (!video.videoWidth || !video.videoHeight) {
                toast({
                    variant: 'destructive',
                    title: 'Cámara inicializando',
                    description: 'Espera un momento a que la cámara se inicie completamente.',
                });
                return;
            }

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

    const handleCameraSwitch = async () => {
        if (videoDevices.length > 1) {
            const nextIndex = (currentDeviceIndex + 1) % videoDevices.length;
            setCurrentDeviceIndex(nextIndex);
            stopStream();
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: videoDevices[nextIndex].deviceId } }
                });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (error) {
                console.error('Error switching camera:', error);
            }
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
        setUploadProgress(0);

        try {
            if (dialogMode === 'add' && capturedImage && context?.user) {
                // 1. Convertir dataURL de canvas a Blob
                const [header, data] = capturedImage.split(',');
                const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
                const bytes = atob(data);
                const arr = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                const blob = new Blob([arr], { type: mime });

                // 2. Crear doc esqueleto en Firestore → obtener ID
                //    Garantiza que la CF de IDP siempre tenga el firestoreDocId
                const newDocId = await addDocument({
                    name: docName,
                    category: docCategory,
                    url: '',          // placeholder; se actualiza en paso 4
                    storagePath: '',  // placeholder; IDP lo elimina tras procesar
                    uploadedAt: new Date(),
                    idpStatus: 'pending',
                });

                // 3. Subir a Storage con firestoreDocId como metadato
                let downloadURL = '', storagePath = '';
                try {
                    ({ downloadURL, storagePath } = await uploadMedicalDocumentEphemeral({
                        tutorId: context.user.uid,
                        patientId: context.user.uid, // Titular: patientId === tutorId
                        file: blob,
                        category: docCategory,
                        firestoreDocId: newDocId,
                        onProgress: setUploadProgress,
                    }));
                } catch (uploadErr) {
                    // Si el upload falla, limpiar el doc esqueleto huérfano
                    await deleteDocument(newDocId);
                    throw uploadErr;
                }

                // 4. Actualizar doc con URL y storagePath reales
                await updateDocument(newDocId, { url: downloadURL, storagePath });
                toast({ title: 'Documento guardado — procesando con IA...' });

            } else if (dialogMode === 'edit' && selectedDoc) {
                // Edición: solo actualiza nombre y categoría
                await updateDocument(selectedDoc.id, { name: docName, category: docCategory });
                toast({ title: "Documento actualizado" });
            }
        } catch (err) {
            console.error('[DocumentList] Error al guardar:', err);
            toast({ variant: 'destructive', title: 'Error al guardar el documento' });
        } finally {
            setIsSaving(false);
            setUploadProgress(0);
            resetForm();
            setIsDialogOpen(false);
        }
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Categoría</TableHead>
                            <TableHead>Subido</TableHead>
                            <TableHead>Estado IA</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {documents.map((doc) => (
                            <TableRow key={doc.id}>
                                <TableCell className="font-medium">{doc.name}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{getCategoryLabel(doc.category)}</Badge>
                                </TableCell>
                                <TableCell>{format(doc.uploadedAt, 'PP', { locale: es })}</TableCell>
                                <TableCell><IdpStatusBadge status={doc.idpStatus} /></TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() => setViewingDoc(doc)}
                                                disabled={!doc.idpStatus || doc.idpStatus === 'pending' || doc.idpStatus === 'processing'}
                                            >
                                                <Eye className="mr-2 h-4 w-4" /> Ver Resultados IA
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleOpenDialog('edit', doc)}><FilePenLine className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(doc.id)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
            {/* Dialog de resultados IDP */}
            <IdpResultsDialog doc={viewingDoc} open={!!viewingDoc} onOpenChange={(v) => { if (!v) setViewingDoc(null); }} />

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
                           {isSaving && uploadProgress > 0 && (
                               <div className="flex-1 space-y-1 mr-2">
                                   <p className="text-xs text-muted-foreground text-center">Subiendo… {uploadProgress}%</p>
                                   <Progress value={uploadProgress} className="h-1.5" />
                               </div>
                           )}
                             <Button type="button" onClick={handleSubmit} disabled={isSaving || (dialogMode === 'add' && !capturedImage)}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Documento
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
