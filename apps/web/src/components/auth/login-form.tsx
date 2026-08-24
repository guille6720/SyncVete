'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signIn } from '@/actions/auth';
import { APP_NAME } from '@sincvete/shared';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginFormProps {
  redirectTo?: string;
  errorCode?: string;
}

export function LoginForm({ redirectTo, errorCode }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center">
          <BrandLogo href="/" size="lg" priority />
        </div>
        <CardDescription>Ingresá a tu clínica o al portal del tutor</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {redirectTo?.startsWith('/portal/activar') && (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="tu@email.com"
            />
            {state?.fieldErrors?.email && (
              <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            {state?.fieldErrors?.password && (
              <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
            )}
            <p className="text-right">
              <Link
                href="/recuperar-contrasena"
                className="text-sm font-medium text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {errorCode === 'auth_callback' && (
            <p className="text-sm text-destructive">
              El enlace de acceso expiró o no es válido. Probá iniciar sesión de nuevo o recuperá tu
              contraseña.
            </p>
          )}
          {errorCode === 'portal_denied' && (
            <p className="text-sm text-destructive">Esta cuenta no tiene acceso a {APP_NAME}.</p>
          )}
          {errorCode === 'incomplete_account' && (
            <p className="text-sm text-destructive">
              Tu usuario existe pero la clínica no quedó configurada. Volvé a registrarte con un
              identificador nuevo, o pedí soporte para reparar la cuenta.
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Ingresando…' : 'Ingresar'}
          </Button>

          <p className="text-center text-sm">
            <Link
              href="/recuperar-contrasena"
              className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900"
            >
              ¿Olvidaste tu contraseña? Recuperarla
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Registrá tu clínica
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
