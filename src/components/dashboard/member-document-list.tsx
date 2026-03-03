'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadMedicalDocumentEphemeral } from '@/lib/upload-medical-document';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Camera, FileText, Trash2, RefreshCcw, SwitchCamera,
  Loader2, FolderOpen, Info
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

type DocCategory = 'Lab Result' | 'Imaging Report' | 'Prescription' | 'Other';

type MemberDoc = {
  id: string;
  name: string;
  category: DocCategory;
  url: string;
  uploadedAt: Date;
};

const CATEGORY_LABELS: Record<DocCategory, string> = {
  'Lab Result': 'Resultado de Lab.',
  'Imaging Report': 'Imagen Médica',
  'Prescription': 'Receta',
  'Other': 'Otro',
};

interface Props {
  userId: string;
  profileId: string | null;
}

export function MemberDocumentList({ userId, profileId }: Props) {
  const [docs, setDocs] = useState<MemberDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState<DocCategory>('Other');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  // Firestore path: Cuentas_Tutor/{userId}/Integrantes/{profileId}/Documentos
  const collectionPath = profileId
    ? `Cuentas_Tutor/${userId}/Integrantes/${profileId}/Documentos`
    : null;

  useEffect(() => {
    if (!collectionPath) { setLoadingDocs(false); return; }
    const ref = collection(db, collectionPath);
    const unsub = onSnapshot(ref, (snap) => {
      const data: MemberDoc[] = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          name: raw.name,
          category: raw.category as DocCategory,
          url: raw.url,
          uploadedAt: raw.uploadedAt?.toDate ? raw.uploadedAt.toDate() : new Date(raw.uploadedAt),
        };
      });
      data.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
      setDocs(data);
      setLoadingDocs(false);
    }, () => setLoadingDocs(false));
    return () => unsub();
  }, [collectionPath]);

  // Camera helpers
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
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
    } catch {
      setHasCameraPermission(false);
    }
  }, [hasCameraPermission, stopStream]);

  const initCamera = useCallback(async () => {
    stopStream();
    try {
      const init = await navigator.mediaDevices.getUserMedia({ video: true });
      setHasCameraPermission(true);
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(inputs);
      init.getTracks().forEach(t => t.stop());
      await startStream(inputs[currentDeviceIndex]?.deviceId);
    } catch {
      setHasCameraPermission(false);
    }
  }, [stopStream, startStream, currentDeviceIndex]);

  useEffect(() => {
    if (dialogOpen && !capturedImage) initCamera();
    else stopStream();
    return () => stopStream();
  }, [dialogOpen, capturedImage, initCamera, stopStream]);

  useEffect(() => {
    if (videoDevices.length > 0 && dialogOpen && !capturedImage) {
      startStream(videoDevices[currentDeviceIndex]?.deviceId);
    }
  }, [currentDeviceIndex, videoDevices, dialogOpen, capturedImage, startStream]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(v, 0, 0);
      setCapturedImage(c.toDataURL('image/png'));
      stopStream();
    }
  };

  /** Convierte un dataURL (base64) capturado por canvas a un Blob subible */
  const dataURLtoBlob = (dataURL: string): Blob => {
    const [header, data] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const resetDialog = () => {
    setDocName(''); setDocCategory('Other');
    setCapturedImage(null); setCurrentDeviceIndex(0); setUploadProgress(0);
  };

  const handleOpenDialog = () => { resetDialog(); setDialogOpen(true); };

  const handleSave = async () => {
    if (!docName || !capturedImage || !collectionPath || !profileId) {
      toast({ variant: 'destructive', title: 'Completa todos los campos y captura el documento.' });
      return;
    }
    setSaving(true);
    setUploadProgress(0);
    try {
      // 1. Convertir dataURL de canvas a Blob
      const blob = dataURLtoBlob(capturedImage);

      // 2. Subir a Firebase Storage en la zona temporal de OCR
      //    Ruta: temp_ocr_uploads/{userId}/{profileId}/{nombre_timestamp}
      //    Metadato: customMetadata.toBeProcessed = 'true'  ← gatillo para Cloud Function
      const { downloadURL, storagePath } = await uploadMedicalDocumentEphemeral({
        tutorId: userId,
        patientId: profileId,
        file: blob,
        onProgress: setUploadProgress,
      });

      // 3. Registrar referencia en Firestore (URL de Storage, no base64)
      await addDoc(collection(db, collectionPath), {
        name: docName,
        category: docCategory,
        url: downloadURL,
        storagePath,          // guardamos la ruta para poder borrar el archivo después
        uploadedAt: serverTimestamp(),
      });

      toast({ title: 'Documento guardado con éxito' });
      setDialogOpen(false);
    } catch (err) {
      console.error('[MemberDocumentList] Error al guardar:', err);
      toast({ variant: 'destructive', title: 'Error al guardar el documento' });
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!collectionPath) return;
    await deleteDoc(doc(db, collectionPath, docId));
    toast({ title: 'Documento eliminado' });
  };

  // Profile not saved yet
  if (!profileId) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <div className="p-3 bg-amber-50 rounded-full">
          <Info className="h-6 w-6 text-amber-500" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Guarda primero el perfil para poder añadir documentos médicos
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loadingDocs ? 'Cargando...' : `${docs.length} documento${docs.length !== 1 ? 's' : ''}`}
        </p>
        <Button size="sm" onClick={handleOpenDialog} className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
          <Camera className="h-4 w-4" /> Capturar Documento
        </Button>
      </div>

      {/* List */}
      {docs.length === 0 && !loadingDocs ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No hay documentos aún</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <FileText className="h-5 w-5 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[d.category]} · {format(d.uploadedAt, 'PP', { locale: es })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-xs hidden sm:flex">{CATEGORY_LABELS[d.category]}</Badge>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(d.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog captura */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Capturar Documento Médico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            {capturedImage ? (
              <div className="space-y-3 text-center">
                <img src={capturedImage} alt="Captura" className="rounded-md w-full" />
                <Button variant="outline" size="sm" onClick={() => setCapturedImage(null)}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Repetir foto
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                {hasCameraPermission === false && (
                  <Alert variant="destructive">
                    <AlertTitle>Cámara no disponible</AlertTitle>
                    <AlertDescription>Permite el acceso a la cámara en tu navegador.</AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-center gap-3">
                  {videoDevices.length > 1 && (
                    <Button variant="outline" size="sm" onClick={() => setCurrentDeviceIndex(i => (i + 1) % videoDevices.length)}>
                      <SwitchCamera className="mr-2 h-4 w-4" /> Cambiar cámara
                    </Button>
                  )}
                  <Button size="sm" onClick={handleCapture} disabled={hasCameraPermission !== true}>
                    <Camera className="mr-2 h-4 w-4" /> Tomar foto
                  </Button>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />

            <div className="space-y-1">
              <Label htmlFor="mdl-name">Nombre del documento</Label>
              <Input
                id="mdl-name"
                value={docName}
                onChange={e => setDocName(e.target.value)}
                placeholder="Ej: Resultado de glucosa junio 2026"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mdl-cat">Categoría</Label>
              <Select value={docCategory} onValueChange={v => setDocCategory(v as DocCategory)}>
                <SelectTrigger id="mdl-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Lab Result">Resultado de Laboratorio</SelectItem>
                  <SelectItem value="Prescription">Receta</SelectItem>
                  <SelectItem value="Imaging Report">Imagen Médica</SelectItem>
                  <SelectItem value="Other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2">
            {saving && uploadProgress > 0 && (
              <div className="w-full space-y-1">
                <p className="text-xs text-muted-foreground text-center">
                  Subiendo… {uploadProgress}%
                </p>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}
            <div className="flex gap-2 justify-end w-full">
              <DialogClose asChild>
                <Button variant="outline" disabled={saving}>Cancelar</Button>
              </DialogClose>
              <Button
                onClick={handleSave}
                disabled={saving || !capturedImage}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
