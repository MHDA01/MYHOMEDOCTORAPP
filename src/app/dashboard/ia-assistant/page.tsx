
'use client';

import { useState, useRef, useEffect, useContext } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserContext } from '@/context/user-context';
import { FileUp, Loader2, BrainCircuit, Wand2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { summarizeMedicalDocument, SummaryResponse } from '@/ai/flows/summarize-document-flow';

const IAAssistantPage = () => {
  const { user } = useContext(UserContext) ?? {};
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      setError("Por favor, inicia sesión para usar esta función.");
    }
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
        if (selectedFile.type.startsWith('image/') || selectedFile.type === 'application/pdf') {
            setFile(selectedFile);
            setError('');
        } else {
            setError('Tipo de archivo no soportado. Por favor, sube una imagen (JPG, PNG) o un PDF.');
            setFile(null);
        }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
        if (droppedFile.type.startsWith('image/') || droppedFile.type === 'application/pdf') {
            setFile(droppedFile);
            setError('');
        } else {
            setError('Tipo de archivo no soportado. Por favor, sube una imagen (JPG, PNG) o un PDF.');
            setFile(null);
        }
    }
  };


  const handleGenerateReport = async () => {
    if (!file) {
      setError('Por favor, selecciona un documento para continuar.');
      return;
    }
    if (!user) {
      setError('Necesitas iniciar sesión para generar un resumen.');
      return;
    }

    setIsLoading(true);
    setError('');
    setSummary(null);

    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async (event) => {
            const dataUri = event.target?.result as string;
            if (dataUri) {
                try {
                    const result = await summarizeMedicalDocument({ documentDataUri: dataUri });
                    setSummary(result);
                } catch (e) {
                     console.error("Error en el flujo de IA:", e);
                     setError('Hubo un error al procesar el documento. Por favor, inténtalo de nuevo.');
                     toast({ variant: 'destructive', title: 'Error de IA', description: 'No se pudo comunicar con el asistente de IA.' });
                } finally {
                    setIsLoading(false);
                }
            }
        };
        reader.onerror = (error) => {
            console.error("Error al leer el archivo:", error);
            setError('No se pudo leer el archivo. Inténtalo de nuevo.');
            setIsLoading(false);
        };

    } catch (e) {
      console.error("Error al generar el informe:", e);
      setError('Hubo un error al procesar el documento. Por favor, inténtalo de nuevo.');
      setIsLoading(false);
    }
  };

  const renderSummary = () => {
    if (!summary) return null;
    return (
      <Card className="mt-8">
        <CardHeader>
            <div className="flex items-center gap-3">
                <Wand2 className="h-6 w-6 text-primary" />
                <CardTitle className="font-headline text-xl">Resumen del Informe Médico</CardTitle>
            </div>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Diagnóstico Principal</h3>
                <p className="text-muted-foreground">{summary.diagnosticoPrincipal}</p>
            </div>
            
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Hallazgos Clave</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {summary.hallazgosClave.map((item, index) => (
                    <li key={index}>{item}</li>
                    ))}
                </ul>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Recomendaciones</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {summary.recomendaciones.map((item, index) => (
                    <li key={index}>{item}</li>
                    ))}
                </ul>
            </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-full">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl w-full space-y-8">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <BrainCircuit className="h-6 w-6 text-primary" />
                            <CardTitle className="font-headline text-xl">Asistente de Informes Médicos</CardTitle>
                        </div>
                        <CardDescription>Sube un estudio médico (imagen o PDF) y obtén un resumen claro y estructurado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-6">
                            <Label htmlFor="dropzone-file" className="block text-sm font-medium text-foreground mb-2">
                                Sube tu documento
                            </Label>
                            <div className="flex items-center justify-center w-full">
                            <Label 
                                htmlFor="dropzone-file" 
                                className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer bg-background hover:bg-muted/80 transition-colors duration-200"
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                                <FileUp className="w-10 h-10 text-muted-foreground mb-3" />
                                <p className="mb-2 text-sm text-muted-foreground">
                                    <span className="font-semibold text-primary">Haz clic para subir</span> o arrastra y suelta
                                </p>
                                <p className="text-xs text-muted-foreground">{file ? file.name : 'Imagen (JPG, PNG) o PDF'}</p>
                                </div>
                                <input id="dropzone-file" type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*,.pdf" />
                            </Label>
                            </div>
                        </div>
                        {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}
                    </CardContent>
                    <CardFooter>
                         <Button
                            onClick={handleGenerateReport}
                            disabled={isLoading || !file}
                            className="w-full sm:w-auto"
                            >
                            {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                            {isLoading ? 'Generando...' : 'Generar Informe'}
                        </Button>
                    </CardFooter>
                </Card>
                
                {renderSummary()}
            </div>
        </main>
    </div>
  );
};

export default IAAssistantPage;
