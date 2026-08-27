import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@sincvete/db';
import { APP_CANONICAL_HOST, APP_LEGACY_HOSTS } from '@sincvete/shared';
import { recoveryRedirectPath } from '@/lib/auth/recovery-redirect';

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/auth/callback',
  '/portal/activar',
  '/check-in',
  '/recuperar-contrasena',
  '/actualizar-contrasena',
  '/manifest.webmanifest',
  '/sw.js',
  '/manual',
  '/api/manual',
  '/legal',
];

export async function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if ((APP_LEGACY_HOSTS as readonly string[]).includes(hostname)) {
    const url = request.nextUrl.clone();
    url.hostname = APP_CANONICAL_HOST;
    url.protocol = 'https:';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Keep getUser() (not getClaims-only): refreshes cookies and preserves
  // revocation semantics required for clinic session security.
  const authStarted = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authMs = performance.now() - authStarted;

  const { pathname } = request.nextUrl;

  const recoveryPath = recoveryRedirectPath(pathname, request.nextUrl.searchParams);
  if (recoveryPath) {
    const url = request.nextUrl.clone();
    url.pathname = recoveryPath;
    return NextResponse.redirect(url);
  }

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    const redirectTo = request.nextUrl.searchParams.get('redirectTo');
    const url = request.nextUrl.clone();
    if (redirectTo?.startsWith('/portal/activar')) {
      const parsed = new URL(redirectTo, request.nextUrl.origin);
      url.pathname = '/portal/activar';
      const token = parsed.searchParams.get('token');
      url.search = token ? `?token=${encodeURIComponent(token)}` : '';
      return NextResponse.redirect(url);
    }
    url.pathname = '/home';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Landing pública: no redirigir usuarios logueados fuera de /
  // (pueden entrar a la app desde el header /login → /home)

  if (process.env.VERCEL_ENV === 'preview' || process.env.SYNC_VETE_PERF_TIMING === '1') {
    supabaseResponse.headers.set(
      'Server-Timing',
      `mw-auth;desc="middleware getUser";dur=${authMs.toFixed(1)}`
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
