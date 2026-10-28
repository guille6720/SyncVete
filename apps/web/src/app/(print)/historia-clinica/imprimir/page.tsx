import { notFound, redirect } from 'next/navigation';
import { PermissionError } from '@/lib/permissions';
import { isPlanRestrictionError } from '@/lib/entitlements';
import { HistoryReportError, loadClinicalHistoryReport } from '@/lib/clinical-history-report-data';
import {
  historyEntryFields,
  historyEntryHeading,
  historyScopeLabel,
} from '@/lib/clinical-history-report';
import { ClinicalHistoryPrintControls } from '@/components/clinical/clinical-history-print-controls';
import { APP_TIMEZONE } from '@sincvete/shared';
import styles from './report.module.css';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Imprimir historia clínica',
  robots: { index: false, follow: false },
};

export default async function ClinicalHistoryPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; date?: string; autoprint?: string }>;
}) {
  const params = await searchParams;
  const report = await loadClinicalHistoryReport({
    patientId: params.patientId ?? '',
    date: params.date,
  }).catch((error) => {
    if (error instanceof PermissionError || isPlanRestrictionError(error)) redirect('/dashboard');
    if (error instanceof HistoryReportError && error.status === 500) throw error;
    notFound();
  });
  const issued = new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(report.generatedAt));
  return (
    <main className={styles.preview}>
      <ClinicalHistoryPrintControls
        patientId={report.patient.id}
        date={report.date}
        autoPrint={params.autoprint !== '0'}
      />
      <article className={styles.sheet}>
        <header className={styles.header}>
          <p className={styles.brand}>SyncVete · {report.clinicName}</p>
          <h1>{historyScopeLabel(report.date)}</h1>
          <h2>{report.patient.name}</h2>
          <p>
            {report.patient.species} · {report.patient.breed ?? 'Raza no registrada'} ·{' '}
            {report.patient.sex}
          </p>
          {report.patient.birth_date && (
            <p>Nacimiento: {report.patient.birth_date.split('-').reverse().join('/')}</p>
          )}
          {report.patient.microchip && <p>Microchip: {report.patient.microchip}</p>}
          <p>Tutor: {report.ownerName}</p>
          <p>
            {report.entries.length} entrada{report.entries.length === 1 ? '' : 's'} · Emitido{' '}
            {issued}
          </p>
        </header>
        {!report.entries.length && <p>No hay atenciones registradas para la fecha seleccionada.</p>}
        {report.entries.map((entry) => (
          <section key={entry.id} className={styles.entry}>
            <h2>{historyEntryHeading(entry)}</h2>
            {historyEntryFields(entry).map(([label, value]) => (
              <div key={label} className={styles.field}>
                <h3>{label}</h3>
                <p>{value}</p>
              </div>
            ))}
          </section>
        ))}
        <footer className={styles.footer}>
          Documento confidencial · Atenciones disponibles en las sucursales habilitadas · Horario de
          la clínica ({APP_TIMEZONE})
        </footer>
      </article>
    </main>
  );
}
