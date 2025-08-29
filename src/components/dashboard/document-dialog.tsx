'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, X, Eye, Camera, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "../../lib/utils";
import type { MedicalDocument } from '../../context/user-context';
import { useToast } from "../../hooks/use-toast";
import { UserContext } from '../../context/user-context';
import { useContext } from 'react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type DialogMode = 'add' | 'edit';

interface DocumentDialogProps {
  mode: DialogMode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  docToEdit: MedicalDocument | null;
}

export function DocumentDialog({ mode, isOpen, onOpenChange, docToEdit }: DocumentDialogProps) {
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

  const stopCameraStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const resetForm = () => {
    setName('');
    setCategory('Lab Result');
    setStudyDate(new Date());
    setSelectedFile(null);
    setCapturedImage(null);
    setIsCameraOpen(false);
    setIsSaving(false);
    stopCameraStream();
  };

  useEffect(() => {
    if (isOpen) {
        if (mode === 'edit' && docToEdit) {
            setName(docToEdit.name);
            setCategory(docToEdit.category);
            setStudyDate(docToEdit.studyDate || docToEdit.uploadedAt);
        } else {
            // Only reset form when opening for 'add' mode
            resetForm();
        }
    } else {
        // Reset form when dialog closes
        resetForm();
    }
  }, [isOpen, mode, docToEdit]);


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
    console.time("handleSubmit_execution"); // Inicia el temporizador
    console.log("handleSubmit: Se inició el guardado. Modo:", mode);

    if (mode === 'add') {
      if (!name || !category || !studyDate || !selectedFile) {
        toast({ variant: 'destructive', title: "Formulario incompleto", description: "Completa todos los campos y toma una foto." });
        console.warn("handleSubmit: Formulario incompleto, guardado cancelado.");
        console.timeEnd("handleSubmit_execution"); // Termina el temporizador
        return;
      }

      setIsSaving(true);
      console.log("handleSubmit: Estado 'isSaving' puesto a true.");
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
        console.error('handleSubmit: Error al guardar:', error);
        toast({ variant: 'destructive', title: "Error al subir el documento.", description: (error as Error).message });
      } finally {
        setIsSaving(false);
        console.log("handleSubmit: Estado 'isSaving' puesto a false en el bloque finally.");
        console.timeEnd("handleSubmit_execution"); // Termina el temporizador
      }
    } else if (mode === 'edit' && docToEdit) {
      if (!name || !category || !studyDate) {
        toast({ variant: 'destructive', title: "Formulario incompleto", description: "Completa todos los campos." });
        console.warn("handleSubmit: Formulario incompleto (edición), guardado cancelado.");
        console.timeEnd("handleSubmit_execution"); // Termina el temporizador
        return;
      }

      setIsSaving(true);
      console.log("handleSubmit: Estado 'isSaving' puesto a true (edición).");
      try {
        const updatedData: Partial<Omit<MedicalDocument, 'id' | 'url' | 'storagePath'>> = { name, category, studyDate };
        await updateDocument(docToEdit.id, updatedData);
        toast({ title: "Documento actualizado con éxito." });
        onOpenChange(false);
      } catch (error) {
        console.error('handleSubmit: Error al actualizar:', error);
        toast({ variant: 'destructive', title: "Error al actualizar el documento.", description: (error as Error).message });
      } finally {
        setIsSaving(false);
        console.log("handleSubmit: Estado 'isSaving' puesto a false en el bloque finally (edición).");
        console.timeEnd("handleSubmit_execution"); // Termina el temporizador
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
                    <img src={capturedImage} alt="Captura" className="w-full h-full object-contain"/>
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