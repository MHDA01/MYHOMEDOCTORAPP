import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('__session')?.value;
  const { pathname } = request.nextUrl;
  const isServerAction = request.method === 'POST' && request.headers.has('next-action');

  
  if (pathname.startsWith('/dashboard') && !session && !isServerAction) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  
  if ((pathname === '/login' || pathname === '/register' || pathname === '/') && session) {
    
    if (pathname !== '/') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
