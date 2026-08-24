'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updatePassword } from '@/actions/auth';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ResetPasswordFormProps {
  hasSession: boolean;
}

export function ResetPasswordForm({ hasSession }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(updatePassword, null);

  if (!hasSession) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <BrandLogo href="/login" size="lg" priority />
          </div>
          <div>
            <CardTitle>Enlace inválido o vencido</CardTitle>
            <CardDescription>
              Pedí un nuevo enlace de recuperación para cambiar tu contraseña
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <Button asChild className="w-full">
            <Link href="/recuperar-contrasena">Recuperar contraseña</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Volver al inicio de sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center">
          <BrandLogo href="/login" size="lg" priority />
        </div>
        <div>
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>Elegí una contraseña nueva para tu cuenta</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
            />
            {state?.fieldErrors?.password && (
              <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmá la contraseña</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
            />
            {state?.fieldErrors?.confirmPassword && (
              <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword[0]}</p>
            )}
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
