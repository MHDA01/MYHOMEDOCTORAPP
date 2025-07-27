
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Upload, FileText, View, Trash2, Camera, FilePenLine } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Document } from '@/lib/types';
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";


const mockDocuments: Document[] = [
  { id: '1', name: 'Resultados de Análisis de Sangre', category: 'Lab Result', uploadedAt: new Date('2023-10-26'), url: '#' },
  { id: '2', name: 'Radiografía de Tórax', category: 'Imaging Report', uploadedAt: new Date('2023-10-20'), url: '#' },
  { id: '3', name: 'Receta de Amoxicilina', category: 'Prescription', uploadedAt: new Date('2023-09-15'), url: '#' },
];

type DialogMode = 'add' | 'edit';

export function DocumentList() {
    const [documents, setDocuments] = useState<Document[]>(mockDocuments);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const { toast } = useToast();


    useEffect(() => {
        if (isDialogOpen && dialogMode === 'add') {
            const getCameraPermission = async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({video: true});
                setHasCameraPermission(true);

                if (videoRef.current) {
                  videoRef.current.srcObject = stream;
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
            };

            getCameraPermission();
        } else if (!isDialogOpen && videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
      }, [isDialogOpen, dialogMode, toast]);

    const handleOpenDialog = (mode: DialogMode, doc?: Document) => {
        setDialogMode(mode);
        if(mode === 'edit' && doc) {
            setSelectedDoc(doc);
        } else {
            setSelectedDoc(null);
        }
        setIsDialogOpen(true);
    };

    const handleDelete = (docId: string) => {
        setDocuments(docs => docs.filter(doc => doc.id !== docId));
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
    
    const getCategoryValue = (category: Document['category']) => {
        switch (category) {
            case 'Lab Result': return 'lab';
            case 'Imaging Report': return 'imaging';
            case 'Prescription': return 'prescription';
            case 'Other': return 'other';
            default: return 'other';
        }
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
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem><View className="mr-2 h-4 w-4" /> Ver</DropdownMenuItem>
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
            <CardFooter>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => handleOpenDialog('add')}><Camera className="mr-2"/>Tomar Foto de Documento</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{dialogMode === 'add' ? 'Capturar Nuevo Documento' : 'Editar Documento'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            {dialogMode === 'add' && (
                                <>
                                 <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted />
                                 { hasCameraPermission === false && (
                                     <Alert variant="destructive">
                                               <AlertTitle>Se requiere acceso a la cámara</AlertTitle>
                                               <AlertDescription>
                                                 Por favor, permite el acceso a la cámara para usar esta función.
                                               </AlertDescription>
                                       </Alert>
                                 )}
                                </>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="doc-name">Nombre del Documento</Label>
                                <Input id="doc-name" placeholder="ej., Resultados de Análisis de Sangre" defaultValue={selectedDoc?.name} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="doc-category">Categoría</Label>
                                <Select defaultValue={selectedDoc ? getCategoryValue(selectedDoc.category) : undefined}>
                                    <SelectTrigger id="doc-category">
                                        <SelectValue placeholder="Selecciona una categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="lab">Resultado de Laboratorio</SelectItem>
                                        <SelectItem value="prescription">Receta</SelectItem>
                                        <SelectItem value="imaging">Informe de Imagen</SelectItem>
                                        <SelectItem value="other">Otro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                           <DialogClose asChild>
                               <Button variant="outline">Cancelar</Button>
                           </DialogClose>
                           <DialogClose asChild>
                             <Button type="submit" disabled={dialogMode === 'add' && !hasCameraPermission} onClick={() => setIsDialogOpen(false)}>Guardar Documento</Button>
                           </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
