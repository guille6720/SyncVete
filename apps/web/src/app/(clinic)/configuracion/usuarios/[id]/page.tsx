import { redirect } from 'next/navigation';

/** Legacy path — module moved outside Configuración. */
export default async function LegacyManagedUserDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/usuarios/${id}`);
}
