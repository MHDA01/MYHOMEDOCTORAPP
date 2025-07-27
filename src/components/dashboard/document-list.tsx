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

const mockDocuments: Document[] = [
  { id: '1', name: 'Blood Test Results', category: 'Lab Result', uploadedAt: new Date('2023-10-26'), url: '#' },
  { id: '2', name: 'Chest X-Ray', category: 'Imaging Report', uploadedAt: new Date('2023-10-20'), url: '#' },
  { id: '3', name: 'Amoxicillin Prescription', category: 'Prescription', uploadedAt: new Date('2023-09-15'), url: '#' },
];

export function DocumentList() {
    const [documents, setDocuments] = useState<Document[]>(mockDocuments);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <CardTitle className="font-headline text-xl">Medical Documents</CardTitle>
                </div>
                <CardDescription>Upload, view, and manage your medical records.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Uploaded</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {documents.map((doc) => (
                            <TableRow key={doc.id}>
                                <TableCell className="font-medium">{doc.name}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{doc.category}</Badge>
                                </TableCell>
                                <TableCell>{doc.uploadedAt.toLocaleDateString()}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem><View className="mr-2 h-4 w-4" /> View</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive">
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
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
                        <Button><Upload className="mr-2"/>Upload Document</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Upload New Document</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="doc-name">Document Name</Label>
                                <Input id="doc-name" placeholder="e.g., Blood Test Results" />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="doc-category">Category</Label>
                                <Select>
                                    <SelectTrigger id="doc-category">
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="lab">Lab Result</SelectItem>
                                        <SelectItem value="prescription">Prescription</SelectItem>
                                        <SelectItem value="imaging">Imaging Report</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="doc-file">File</Label>
                                <Input id="doc-file" type="file" />
                            </div>
                        </div>
                        <DialogFooter>
                           <DialogClose asChild>
                             <Button type="submit" onClick={() => setIsDialogOpen(false)}>Upload</Button>
                           </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}
