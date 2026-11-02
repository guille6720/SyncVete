import Link from 'next/link';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { PRELIMINARY_STORAGE_PLANS, storageAlert } from '@/lib/storage-status';
import { storageSandboxQuote } from '@/lib/billing/storage-sandbox';

export const dynamic = 'force-dynamic';

interface StorageStatus {
  usedBytes: number;
  pendingBytes?: number;
  committedBytes?: number;
  quotaBytes: number | null;
  quotaUnlimited?: boolean;
  unknownSizes: number;
  measuredAt: string;
  buckets: Record<string, number>;
}

export default async function StoragePage() {
  await requirePermission('org:manage');
  const client = await createServerClient();
  const { data, error } = await client.rpc('get_own_storage_status' as never);
  const status = error ? null : data as StorageStatus | null;
  const committedBytes = status ? status.committedBytes ?? status.usedBytes : 0;
  const alert = status?.quotaUnlimited ? 'normal'
    : status?.quotaBytes === 0 ? 'full'
      : status ? storageAlert(committedBytes, status.quotaBytes) : 'unknown';
  const messages = { unknown: 'Cuota pendiente de configuración', normal: 'Espacio disponible', warning: 'Alcanzaste el 80% de tu espacio', critical: 'Alcanzaste el 95% de tu espacio', full: 'Alcanzaste tu cuota de almacenamiento' };
  const gb = (bytes: number) => `${(bytes / 1_000_000_000).toLocaleString('es-AR', { maximumFractionDigits: 3 })} GB`;
  return <main className="space-y-6">
    <Link href="/configuracion">Volver a Configuración</Link>
    <h1 className="text-2xl font-bold">Almacenamiento y disponibilidad</h1>
    <section className="rounded-lg border p-4 space-y-2">
      <h2 className="font-semibold">Archivos de tu organización</h2>
      <p>Las cargas verifican el espacio disponible antes de guardar cada archivo.</p>
      {!status ? <p>No se pudo consultar el uso. Intentá nuevamente más tarde.</p> : <>
        <p>{gb(status.usedBytes)} utilizados · {status.quotaUnlimited ? 'sin límite de capacidad configurado' : status.quotaBytes === null ? 'cuota pendiente' : `${gb(status.quotaBytes)} de cuota`}</p>
        {(status.pendingBytes ?? 0) > 0 && <p>{gb(status.pendingBytes ?? 0)} reservados para cargas pendientes de confirmar</p>}
        <p role="status">{messages[alert]}</p>
        {!status.quotaUnlimited && status.quotaBytes !== null && <p>{gb(Math.max(0, status.quotaBytes - committedBytes))} disponibles</p>}
        {Object.entries(status.buckets).map(([bucket, bytes]) => <p key={bucket}>{bucket}: {gb(bytes)}</p>)}
        {status.unknownSizes > 0 && <p>Hay {status.unknownSizes} archivos sin tamaño verificable. El total es parcial.</p>}
        <p>Medido: {new Date(status.measuredAt).toLocaleString('es-AR', { timeZone: 'America/Buenos_Aires' })}. Incluye adjuntos, fotos e importaciones/exportaciones; excluye la base de datos.</p>
      </>}
    </section>
    <section className="rounded-lg border p-4 space-y-2">
      <h2 className="font-semibold">Disponibilidad del servicio</h2>
      <p>Sin historial de monitoreo verificado. Todavía no hay un porcentaje de disponibilidad medido.</p>
      <p>Última restauración de respaldo verificada: sin evidencia disponible.</p>
    </section>
    {process.env.STORAGE_SANDBOX_CATALOG === 'true' && process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://owmcrqvnfubyjxrlyhlc.supabase.co' && <section className="rounded-lg border p-4 space-y-2">
      <h2 className="font-semibold">Planes preliminares de prueba</h2>
      {PRELIMINARY_STORAGE_PLANS.map(plan => {
        const quote = storageSandboxQuote(plan.key, process.env.NEXT_PUBLIC_SUPABASE_URL);
        return <p key={quote.planKey}>{quote.name}: ARS {(quote.amountMinor / 100).toLocaleString('es-AR')}/mes · {gb(quote.quotaBytes)}</p>;
      })}
      <p>Simulación sin contratación ni cobros. Tratamiento de impuestos pendiente de validación.</p>
    </section>}
  </main>;
}
