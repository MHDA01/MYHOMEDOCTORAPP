import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { getUserTokenState } from '@/lib/token-system';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const state = await getUserTokenState(decoded.uid);

    return NextResponse.json(state);
  } catch (error: any) {
    console.error('[TOKENS API]', error);
    return NextResponse.json({ error: error.message || 'Error consultando tokens' }, { status: 500 });
  }
}
