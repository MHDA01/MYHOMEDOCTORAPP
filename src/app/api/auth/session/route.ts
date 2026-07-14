import { getAdminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();
    
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn });
    
    const cookieStore = await cookies();
    cookieStore.set('__session', sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating session cookie:', JSON.stringify(error, null, 2));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('__session');
  return NextResponse.json({ success: true });
}
