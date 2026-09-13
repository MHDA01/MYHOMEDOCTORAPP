import { redirect } from 'next/navigation';

// La revisión de consejos diarios ahora vive en el panel de administración.
export default function GrowthTipsPage() {
  redirect('/dashboard/admin/consejos');
}
