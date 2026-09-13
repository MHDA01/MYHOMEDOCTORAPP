import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { logPaymentTransaction } from '@/lib/token-system';
import { ACCESO_LIBRE } from '@/config/acceso';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Etapa gratuita: no se crea ningún cobro (src/config/acceso.ts).
  if (ACCESO_LIBRE) {
    return NextResponse.json({ error: 'MyHomeDoctorApp es gratuita en este momento.' }, { status: 403 });
  }
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const body = await request.json().catch(() => ({}));

    const wompyBaseUrl = process.env.WOMPY_BASE_URL || 'https://api.wompy.com';
    const wompyPrivateKey = process.env.WOMPY_PRIVATE_KEY || process.env.WOMPY_API_KEY;
    const wompyRedirectUrl = process.env.WOMPY_REDIRECT_URL || process.env.WOMPY_SUCCESS_URL || 'https://myhomedoctorapp.web.app/dashboard/teleorientacion';
    const amount = Number(process.env.CONSULTATION_COST_COP || 24500);
    const paidTokens = Number(process.env.PAID_TOKENS_PER_MONTH || 210);

    if (!wompyPrivateKey) {
      return NextResponse.json({ error: 'Wompy no configurado' }, { status: 500 });
    }

    const res = await fetch(`${wompyBaseUrl}/v1/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wompyPrivateKey}`,
      },
      body: JSON.stringify({
        amount,
        currency: 'COP',
        reference: `teleorientacion_monthly_${uid}`,
        description: 'Plan Teleorientación Mensual (7 consultas/día)',
        redirect_url: wompyRedirectUrl,
        metadata: { uid, tokens: paidTokens, planDays: 30 },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: 'No se pudo crear la transacción' }, { status: 502 });
    }

    await logPaymentTransaction(uid, {
      status: 'pending',
      amount,
      reference: `teleorientacion_monthly_${uid}`,
      wompy_id: data.id,
      payment_url: data.links?.payment_url || data.payment_url,
      description: 'Plan Teleorientación Mensual',
    });

    return NextResponse.json({ success: true, payment_url: data.links?.payment_url || data.payment_url, transaction: data });
  } catch (error: any) {
    console.error('[WOMPY API]', error);
    return NextResponse.json({ error: error.message || 'Error al iniciar transacción' }, { status: 500 });
  }
}
