'use client';

import { useState, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { PlusCircle, FileText } from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import { Skeleton } from '../ui/skeleton';
import { DocumentTable } from './document-table';
import { DocumentDialog } from './document-dialog';
import { ViewDocumentDialog } from './view-document-dialog';
import { UserContext, MedicalDocument } from '@/context/user-context';

type DialogMode = 'add' | 'edit';

export function DocumentList() {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('DocumentList must be used within a UserProvider');
  }

  const { documents, deleteDocument, loading, addDocument, updateDocument } = context;
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