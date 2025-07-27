'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Upload, FileText, View, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Document } from '@/lib/types';
import { format } from "date-fns";
import { es } from 'date-fns/locale';

const mockDocuments: Document[] = [
  { id: '1', name: 'Resultados de Análisis de Sangre', category: 'Lab Result', uploadedAt: new Date('2023-10-26'), url: '#' },
  { id: '2', name: 'Radiografía de Tórax', category: 'Imaging Report', uploadedAt: new Date('2023-10-20'), url: '#' },
  { id: '3', name: 'Receta de Amoxicilina', category: 'Prescription', uploadedAt: new Date('2023-09-15'), url: '#' },
];

export function DocumentList() {
    const [documents, setDocuments] = useState<Document[]>(mockDocuments);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const getCategoryLabel = (category: Document['category']) => {
        switch (category) {
            case 'Lab Result': return 'Resultado de Laboratorio';
            case 'Imaging Report': return 'Informe de Imagen';
            case 'Prescription': return 'Receta';
            case 'Other': return 'Otro';
            default: return category;
        }
    };

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
                                            <DropdownMenuItem className="text-destructive">
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
                        <Button><Upload className="mr-2"/>Subir Documento</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Subir Nuevo Documento</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doc-name">Nombre del Documento</Label>
                                <Input id="doc-name" placeholder="ej., Resultados de Análisis de Sangre" />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="doc-category">Categoría</Label>
                                <Select>
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
                            <div className="grid gap-2">
                                <Label htmlFor="doc-file">Archivo</Label>
                                <Input id="doc-file" type="file" />
                            </div>
                        </div>
                        <DialogFooter>
                           <DialogClose asChild>
                             <Button type="submit" onClick={() => setIsDialogOpen(false)}>Subir</Button>
                           </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
