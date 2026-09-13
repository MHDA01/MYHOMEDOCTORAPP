import { RevisionProtocolo } from '@/components/admin/revision-protocolo';

export default async function AdminRevisionProtocoloPage({ params }: { params: Promise<{ borradorId: string }> }) {
  const { borradorId } = await params;
  return <RevisionProtocolo borradorId={borradorId} />;
}
