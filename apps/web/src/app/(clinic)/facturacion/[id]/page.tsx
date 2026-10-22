import { notFound, redirect } from 'next/navigation';
import { canManageBilling, canReadBilling, getInvoice } from '@/actions/billing';
import { canSendWhatsApp } from '@/actions/whatsapp';
import { InvoiceDetail } from '@/components/billing/invoice-detail';
import { resolveListHref } from '@/lib/list-return';

interface FacturaDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}

export default async function FacturaDetailPage({ params, searchParams }: FacturaDetailPageProps) {
  const canRead = await canReadBilling();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const query = await searchParams;
  const [data, canWrite, canWhatsApp] = await Promise.all([
    getInvoice(id),
    canManageBilling(),
    canSendWhatsApp(),
  ]);

  if (!data) notFound();

  return (
    <InvoiceDetail
      invoice={data.invoice}
      items={data.items}
      payments={data.payments}
      canWrite={canWrite}
      canSendWhatsApp={canWhatsApp}
      listHref={resolveListHref('/facturacion', query.return)}
    />
  );
}
