'use client';

import { useActionState, useState } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import type { OwnerAppBrand } from '@/lib/owner-app';
import { OwnerAppBrandMark } from './owner-app-brand';
import { acceptPortalInviteForm, activatePortalAccount } from '@/actions/portal';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PortalInvitePreview } from '@sincvete/shared';

interface PortalActivateFormProps {
  brand?: OwnerAppBrand;
  token: string;
  preview: PortalInvitePreview | null;
  isLoggedIn: boolean;
  isStaff: boolean;
  /** When true, form sits inside OwnerAppInstall without a second card. */
  embedded?: boolean;
}

export function PortalActivateForm({
  token,
  brand,
  preview,
  isLoggedIn,
  isStaff,
  embedded = false,
}: PortalActivateFormProps) {
  const [state, formAction, pending] = useActionState(activatePortalAccount, null);
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptPortalInviteForm, null);
  const [showLogin, setShowLogin] = useState(false);

  if (!token || !preview) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            {brand ? <OwnerAppBrandMark brand={brand} /> : <BrandLogo href="/" size="md" />}
          </div>
          <CardDescription>Invitación inválida o vencida</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Pedile a tu veterinaria un enlace nuevo para acceder a la app de tus mascotas.
        </CardContent>
      </Card>
    );
  }

  if (isStaff) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            {brand ? <OwnerAppBrandMark brand={brand} /> : <BrandLogo href="/" size="md" />}
          </div>
          <CardDescription>Esta cuenta es del equipo de la clínica</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Usá otro email para el portal del tutor.
        </CardContent>
      </Card>
    );
  }

  if (isLoggedIn) {
    const body = (
      <div className="space-y-4">
        {!embedded && (
          <div className="text-center">
            <h2 className="text-lg font-semibold">Continuar con tu cuenta</h2>
            <p className="text-sm text-muted-foreground">
              {preview.clinicName} te invita a ver las mascotas de {preview.ownerName}
            </p>
          </div>
        )}
        {embedded && (
          <div>
            <h2 className="text-lg font-semibold">Continuar con tu cuenta</h2>
            <p className="mt-1 text-sm text-slate-600">
              Vas a vincular esta sesión con {preview.email} para ver las mascotas de{' '}
              {preview.ownerName}.
            </p>
          </div>
        )}
        {!embedded && (
          <p className="text-sm text-muted-foreground">
            Vas a vincular esta sesión con el email {preview.email}.
          </p>
        )}
        <form action={acceptAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          {acceptState?.error && <p className="text-sm text-destructive">{acceptState.error}</p>}
          <Button type="submit" className="w-full" disabled={acceptPending}>
            {acceptPending ? 'Entrando…' : 'Entrar a la app'}
          </Button>
        </form>
      </div>
    );
    if (embedded) return body;
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">{body}</CardContent>
      </Card>
    );
  }

  if (showLogin) {
    return (
      <div className="space-y-3">
        <LoginForm brand={brand} ownerAccess redirectTo={`/portal/activar?token=${token}`} />
        <Button variant="ghost" className="w-full" onClick={() => setShowLogin(false)}>
          Volver a crear mi cuenta
        </Button>
      </div>
    );
  }

  const form = (
    <div className="space-y-4">
      <div className={embedded ? undefined : 'text-center'}>
        <h2 className="text-lg font-semibold">Creá tu cuenta</h2>
        <p className={`text-sm ${embedded ? 'mt-1 text-slate-600' : 'text-muted-foreground'}`}>
          {embedded
            ? `Completá tus datos. La veterinaria activará el acceso para ver las mascotas de ${preview.ownerName}.`
            : `Creá tu acceso. La veterinaria lo activará para ver las mascotas de ${preview.ownerName}`}
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={preview.email} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Tu nombre</Label>
          <Input
            id="fullName"
            name="fullName"
            required
            defaultValue={preview.ownerName}
            minLength={2}
          />
          {state?.fieldErrors?.fullName && (
            <p className="text-sm text-destructive">{state.fieldErrors.fullName[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          {state?.fieldErrors?.password && (
            <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
          )}
        </div>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{' '}
        <button
          type="button"
          onClick={() => setShowLogin(true)}
          className="font-medium text-primary hover:underline"
        >
          Ingresar
        </button>
      </p>
    </div>
  );

  if (embedded) return form;

  return (
    <Card className="w-full max-w-md">
      <CardContent className="pt-6">{form}</CardContent>
    </Card>
  );
}
