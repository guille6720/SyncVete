import { RecoverySessionBootstrap } from '@/components/auth/recovery-session-bootstrap';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export default function ActualizarContrasenaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <RecoverySessionBootstrap>
        {(hasSession) => <ResetPasswordForm hasSession={hasSession} />}
      </RecoverySessionBootstrap>
    </div>
  );
}
