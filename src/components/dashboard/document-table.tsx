'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { MoreVertical, Eye, Download, FilePenLine, Trash2, Camera, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import type { MedicalDocument } from '../../context/medical-documents-context';

const getCategoryLabel = (category: MedicalDocument['category']) => {
    const labels: Record<MedicalDocument['category'], string> = {
      'Lab Result': 'Resultado de Laboratorio',
      'Imaging Report': 'Informe de Imagen',
      'Prescription': 'Receta',
      'Other': 'Otro'
    };
    return labels[category];
};

interface DocumentTableProps {
  documents: MedicalDocument[];
  onView: (doc: MedicalDocument) => void;
  onEdit: (doc: MedicalDocument) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function DocumentTable({ documents, onView, onEdit, onDelete, onAdd }: DocumentTableProps) {
  const sortedDocuments = [...documents].sort((a, b) => {
    const dateA = a.studyDate || a.uploadedAt;
    const dateB = b.studyDate || b.uploadedAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedDocuments.length > 0 ? (
          sortedDocuments.map(doc => (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">{doc.name}</TableCell>
              <TableCell>{getCategoryLabel(doc.category)}</TableCell>
              <TableCell>{format(doc.studyDate || doc.uploadedAt, "d MMM yyyy", { locale: es })}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Más acciones</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(doc)}>
                      <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                    </DropdownMenuItem>
                    {doc.url && 
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" download>
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" /> Descargar
                        </DropdownMenuItem>
                      </a>
                    }
                    <DropdownMenuItem onClick={() => onEdit(doc)}>
                      <FilePenLine className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(doc.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className="h-48 text-center">
              <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No hay documentos</h3>
              <p className="mt-1 text-sm text-muted-foreground">Empieza tomando una foto de tu primer documento.</p>
              <Button className="mt-6" onClick={onAdd}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Añadir con Foto
              </Button>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}