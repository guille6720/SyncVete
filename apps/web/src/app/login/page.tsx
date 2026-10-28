import { LoginForm } from '@/components/auth/login-form';

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string; error?: string; reason?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <LoginForm
        redirectTo={params.redirectTo}
        errorCode={params.error}
        errorReason={params.reason}
      />
    </div>
  );
}
