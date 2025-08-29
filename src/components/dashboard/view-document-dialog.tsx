'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "../ui/dialog";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import type { MedicalDocument } from '../../context/user-context';

const getCategoryLabel = (category: MedicalDocument['category']) => {
    const labels: Record<MedicalDocument['category'], string> = {
      'Lab Result': 'Resultado de Laboratorio',
      'Imaging Report': 'Informe de Imagen',
      'Prescription': 'Receta',
      'Other': 'Otro'
    };
    return labels[category];
};

interface ViewDocumentDialogProps {
  doc: MedicalDocument | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function ViewDocumentDialog({ doc, isOpen, onOpenChange }: ViewDocumentDialogProps) {
  if (!doc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doc.name}</DialogTitle>
          <DialogDescription>
            {getCategoryLabel(doc.category)} • Fecha: {format(doc.studyDate || doc.uploadedAt, "d 'de' MMMM, yyyy", { locale: es })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <h3 className="font-semibold text-lg">Imagen del Documento</h3>
          <div className="space-y-2">
            {doc.url ? (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="block border rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                <img src={doc.url} alt={`Imagen de ${doc.name}`} className="w-full h-auto object-contain"/>
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
  );
}