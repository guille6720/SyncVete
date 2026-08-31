import { InterconsultationExternalResponder } from '@/components/interconsultations/interconsultation-external-responder';
import { getExternalInterconsultationByToken } from '@/actions/interconsultations';

export default async function InterconsultaResponderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = await getExternalInterconsultationByToken(token);

  if (!payload || payload.ok === false) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-16">
        <div className="w-full rounded-lg border p-6 text-center">
          <h1 className="text-xl font-semibold">Enlace no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {(payload?.error as string) ||
              'El enlace es inválido, expiró o ya no está disponible.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <InterconsultationExternalResponder token={token} payload={payload} />
    </main>
  );
}
