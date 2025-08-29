'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { PlusCircle } from "lucide-react";
import type { MedicalDocument } from '../../context/medical-documents-context';
import { useToast } from "../../hooks/use-toast";
import { useMedicalDocuments } from '../../context/medical-documents-context';
import { Skeleton } from '../ui/skeleton';
import { DocumentTable } from './document-table';
import { DocumentDialog } from './document-dialog';
import { ViewDocumentDialog } from './view-document-dialog';

type DialogMode = 'add' | 'edit';

export function DocumentList() {
  const { documents, deleteDocument, loading } = useMedicalDocuments();
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
            <div className="space-y-1">
                <CardTitle className="font-headline text-xl">Documentos Médicos</CardTitle>
                <CardDescription>Añade y gestiona tus exámenes, recetas e informes.</CardDescription>
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