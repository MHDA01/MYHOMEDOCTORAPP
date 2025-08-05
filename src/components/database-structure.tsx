'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Database, File, Folder, User, Users, Bell, Pill, Calendar } from "lucide-react";

export function DatabaseStructure() {
  return (
    <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
            <div className="flex items-center gap-3">
                <Database className="h-6 w-6 text-primary"/>
                <CardTitle className="font-headline text-xl">Estructura de la Base de Datos (Firestore)</CardTitle>
            </div>
            <CardDescription>Así es como se organizan tus datos de forma segura en la nube.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm font-mono">
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Folder className="h-5 w-5 text-amber-500"/>
                <span>users/</span>
                <span className="text-xs text-muted-foreground ml-auto">Colección Principal</span>
            </div>

            <div className="flex items-start gap-4 pl-6">
                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mt-2.5"/>
                <div className="flex-1 space-y-3 border p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                         <User className="h-5 w-5 text-sky-500"/>
                        <span>&#123;userId&#125;</span>
                        <span className="text-xs text-muted-foreground ml-auto">Documento de Usuario (ID de Auth)</span>
                    </div>

                    <div className="pl-8 space-y-2 text-xs">
                        <p><strong className="text-primary-foreground/80">personalInfo:</strong> &#123; firstName, lastName, ... &#125;</p>
                        <p><strong className="text-primary-foreground/80">healthInfo:</strong> &#123; allergies, surgicalHistory, ... &#125;</p>
                        <p><strong className="text-primary-foreground/80">fcmToken:</strong> "token_del_dispositivo_xyz..."</p>
                    </div>

                    {/* Sub-collections */}
                    <div className="pl-6 space-y-3 pt-2">
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
                            <Folder className="h-5 w-5 text-amber-600"/>
                            <span>appointments/</span>
                            <span className="text-xs text-muted-foreground ml-auto">Sub-colección</span>
                        </div>
                         <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 ml-4">
                            <Calendar className="h-5 w-5 text-red-500"/>
                            <span>&#123;appointmentId&#125;: &#123; doctor, specialty, date, ... &#125;</span>
                        </div>
                        
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
                            <Folder className="h-5 w-5 text-amber-600"/>
                            <span>medications/</span>
                            <span className="text-xs text-muted-foreground ml-auto">Sub-colección</span>
                        </div>
                         <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 ml-4">
                            <Pill className="h-5 w-5 text-green-500"/>
                            <span>&#123;medicationId&#125;: &#123; name, dosage, frequency, ... &#125;</span>
                        </div>

                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
                            <Folder className="h-5 w-5 text-amber-600"/>
                            <span>documents/</span>
                             <span className="text-xs text-muted-foreground ml-auto">Sub-colección</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 ml-4">
                            <File className="h-5 w-5 text-blue-500"/>
                            <span>&#123;documentId&#125;: &#123; name, category, url, ... &#125;</span>
                        </div>

                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
                            <Folder className="h-5 w-5 text-amber-600"/>
                            <span>alarms/</span>
                             <span className="text-xs text-muted-foreground ml-auto">Sub-colección</span>
                        </div>
                         <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 ml-4">
                            <Bell className="h-5 w-5 text-purple-500"/>
                            <span>&#123;alarmId&#125;: &#123; fcmToken, message, alarmTime, ... &#125;</span>
                        </div>
                    </div>
                </div>
            </div>
        </CardContent>
    </Card>
  );
}
