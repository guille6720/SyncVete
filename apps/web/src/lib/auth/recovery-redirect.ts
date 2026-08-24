/** Runs in the browser before React hydrates — catches recovery tokens on the landing page. */
export const AUTH_RECOVERY_REDIRECT_SCRIPT = `(function(){try{var p=window.location.pathname;if(p==='/actualizar-contrasena'||p==='/auth/callback')return;var h=window.location.hash;if(h&&(h.indexOf('type=recovery')!==-1||(h.indexOf('access_token=')!==-1&&h.indexOf('refresh_token=')!==-1))){window.location.replace('/actualizar-contrasena'+h);return;}var s=window.location.search;if(!s)return;var q=new URLSearchParams(s);var type=q.get('type');if(type==='recovery'&&(q.has('token_hash')||q.has('code'))){window.location.replace('/actualizar-contrasena'+s);return;}if(p==='/'&&q.has('code')&&!q.has('next')){window.location.replace('/actualizar-contrasena'+s);}}catch(e){}})();`;

export function recoveryRedirectPath(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname === '/actualizar-contrasena' || pathname === '/auth/callback') {
    return null;
  }

  if (pathname !== '/' && pathname !== '/login') {
    return null;
  }

  const type = searchParams.get('type');
  if (type === 'recovery' && (searchParams.has('token_hash') || searchParams.has('code'))) {
    return '/actualizar-contrasena';
  }

  if (pathname === '/' && searchParams.has('code') && !searchParams.has('next')) {
    return '/actualizar-contrasena';
  }

  return null;
}
