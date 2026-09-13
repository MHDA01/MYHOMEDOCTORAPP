import { redirect } from 'next/navigation';

// El Agente de Crecimiento ahora vive en el panel de administración.
export default function GrowthPage() {
  redirect('/dashboard/admin/crecimiento');
}
