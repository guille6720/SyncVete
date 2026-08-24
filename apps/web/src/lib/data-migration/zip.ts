import 'server-only';

import {
  DATA_MIGRATION_FORMAT,
  DATA_MIGRATION_FORMAT_VERSION,
  buildBranchTemplateCsv,
  buildClinicalTemplateCsv,
  buildLabOrderTemplateCsv,
  buildOwnerTemplateCsv,
  buildPatientTemplateCsv,
  buildPrescriptionTemplateCsv,
  buildSampleMigrationManifest,
  buildSurgeryTemplateCsv,
  buildVaccinationTemplateCsv,
  buildHospitalizationTemplateCsv,
  buildAppointmentTemplateCsv,
  buildConsultationTemplateCsv,
  buildInventoryProductTemplateCsv,
  buildInvoiceTemplateCsv,
  buildPaymentTemplateCsv,
  buildStaffMapTemplateCsv,
  buildBranchMapTemplateCsv,
  buildAttachmentMetaTemplateCsv,
  buildCutoverRoundtripNotes,
  parseCsv,
  parseMigrationManifest,
  type MigrationZipManifest,
} from '@sincvete/shared';
import JSZip from 'jszip';

export type ParsedMigrationZip = {
  manifest: MigrationZipManifest;
  branchesCsv: string | null;
  ownersCsv: string | null;
  patientsCsv: string | null;
  clinicalCsv: string | null;
  vaccinationsCsv: string | null;
  labOrdersCsv: string | null;
  surgeriesCsv: string | null;
  prescriptionsCsv: string | null;
  hospitalizationsCsv: string | null;
  appointmentsCsv: string | null;
  consultationsCsv: string | null;
  inventoryProductsCsv: string | null;
  invoicesCsv: string | null;
  paymentsCsv: string | null;
  attachmentPaths: string[];
};

function findEntry(zip: JSZip, candidates: string[]): JSZip.JSZipObject | null {
  for (const name of candidates) {
    const direct = zip.file(name);
    if (direct) return direct;
  }
  const files = Object.keys(zip.files);
  for (const candidate of candidates) {
    const match = files.find((f) => f.replace(/\\/g, '/').endsWith(candidate));
    if (match) return zip.file(match);
  }
  return null;
}

export async function parseSyncveteMigrationZip(buffer: ArrayBuffer): Promise<ParsedMigrationZip> {
  const zip = await JSZip.loadAsync(buffer);
  const manifestFile = findEntry(zip, ['manifest.json']);
  if (!manifestFile) throw new Error('El ZIP no incluye manifest.json');
  const manifestRaw = JSON.parse(await manifestFile.async('string')) as unknown;
  const manifest = parseMigrationManifest(manifestRaw);
  if (!manifest) {
    throw new Error('manifest.json inválido (format debe ser syncvete-migration)');
  }

  const branches = findEntry(zip, ['branches.csv', 'data/branches.csv']);
  const owners = findEntry(zip, ['owners.csv', 'data/owners.csv']);
  const patients = findEntry(zip, ['patients.csv', 'data/patients.csv']);
  const clinical = findEntry(zip, [
    'clinical_records.csv',
    'clinical-records.csv',
    'data/clinical_records.csv',
    'data/clinical-records.csv',
  ]);
  const vaccinations = findEntry(zip, ['vaccinations.csv', 'data/vaccinations.csv']);
  const labOrders = findEntry(zip, ['lab_orders.csv', 'data/lab_orders.csv']);
  const surgeries = findEntry(zip, ['surgeries.csv', 'data/surgeries.csv']);
  const prescriptions = findEntry(zip, ['prescriptions.csv', 'data/prescriptions.csv']);
  const hospitalizations = findEntry(zip, [
    'hospitalizations.csv',
    'data/hospitalizations.csv',
  ]);
  const appointments = findEntry(zip, ['appointments.csv', 'data/appointments.csv']);
  const consultations = findEntry(zip, ['consultations.csv', 'data/consultations.csv']);
  const inventoryProducts = findEntry(zip, [
    'inventory_products.csv',
    'data/inventory_products.csv',
  ]);
  const invoices = findEntry(zip, ['invoices.csv', 'data/invoices.csv']);
  const payments = findEntry(zip, [
    'payments.csv',
    'data/payments.csv',
    'invoice_payments.csv',
    'data/invoice_payments.csv',
  ]);

  const attachmentPaths = Object.keys(zip.files).filter((path) => {
    const normalized = path.replace(/\\/g, '/');
    return (
      !zip.files[path]?.dir &&
      (normalized.startsWith('attachments/') || normalized.includes('/attachments/'))
    );
  });

  return {
    manifest,
    branchesCsv: branches ? await branches.async('string') : null,
    ownersCsv: owners ? await owners.async('string') : null,
    patientsCsv: patients ? await patients.async('string') : null,
    clinicalCsv: clinical ? await clinical.async('string') : null,
    vaccinationsCsv: vaccinations ? await vaccinations.async('string') : null,
    labOrdersCsv: labOrders ? await labOrders.async('string') : null,
    surgeriesCsv: surgeries ? await surgeries.async('string') : null,
    prescriptionsCsv: prescriptions ? await prescriptions.async('string') : null,
    hospitalizationsCsv: hospitalizations ? await hospitalizations.async('string') : null,
    appointmentsCsv: appointments ? await appointments.async('string') : null,
    consultationsCsv: consultations ? await consultations.async('string') : null,
    inventoryProductsCsv: inventoryProducts ? await inventoryProducts.async('string') : null,
    invoicesCsv: invoices ? await invoices.async('string') : null,
    paymentsCsv: payments ? await payments.async('string') : null,
    attachmentPaths,
  };
}

export async function buildSampleMigrationZip(sourceSystem = 'VetLegacy'): Promise<Uint8Array> {
  const zip = new JSZip();
  const manifest = buildSampleMigrationManifest(sourceSystem);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('branches.csv', buildBranchTemplateCsv());
  zip.file('owners.csv', buildOwnerTemplateCsv());
  zip.file('patients.csv', buildPatientTemplateCsv());
  zip.file('clinical_records.csv', buildClinicalTemplateCsv());
  zip.file('vaccinations.csv', buildVaccinationTemplateCsv());
  zip.file('lab_orders.csv', buildLabOrderTemplateCsv());
  zip.file('surgeries.csv', buildSurgeryTemplateCsv());
  zip.file('prescriptions.csv', buildPrescriptionTemplateCsv());
  zip.file('hospitalizations.csv', buildHospitalizationTemplateCsv());
  zip.file('appointments.csv', buildAppointmentTemplateCsv());
  zip.file('consultations.csv', buildConsultationTemplateCsv());
  zip.file('inventory_products.csv', buildInventoryProductTemplateCsv());
  zip.file('invoices.csv', buildInvoiceTemplateCsv());
  zip.file('payments.csv', buildPaymentTemplateCsv());
  zip.file('staff_map.csv', buildStaffMapTemplateCsv());
  zip.file('branch_map.csv', buildBranchMapTemplateCsv());
  zip.file('attachments_meta.csv', buildAttachmentMetaTemplateCsv());
  zip.file('roundtrip_notes.txt', buildCutoverRoundtripNotes());
  zip.folder('attachments')?.folder('PAT-001')?.file(
    'README.txt',
    'Colocá aquí PDFs/JPG/PNG del paciente externo PAT-001.\nOpcional: attachments_meta.csv en la raíz mapea sucursal/staff por archivo.\n'
  );
  zip.file(
    'INSTRUCTIONS.txt',
    [
      'SyncVete migration package',
      `format=${DATA_MIGRATION_FORMAT}`,
      `version=${DATA_MIGRATION_FORMAT_VERSION}`,
      '',
      'Orden recomendado:',
      '1) branches.csv',
      '2) owners.csv',
      '3) patients.csv',
      '4) clinical_records.csv / vaccinations.csv / lab_orders.csv / surgeries.csv / prescriptions.csv',
      '5) attachments/<external_patient_id>/*.(jpg|png|pdf|webp|gif)',
      '6) attachments_meta.csv (opcional: branch/staff por archivo)',
      '',
    ].join('\n')
  );
  return zip.generateAsync({ type: 'uint8array' });
}

export function summarizeZipContents(parsed: ParsedMigrationZip) {
  const countRows = (csv: string | null) => (csv ? parseCsv(csv).rows.length : 0);
  return {
    sourceSystem: parsed.manifest.sourceSystem ?? null,
    version: parsed.manifest.version,
    branches: countRows(parsed.branchesCsv),
    owners: countRows(parsed.ownersCsv),
    patients: countRows(parsed.patientsCsv),
    clinicalRecords: countRows(parsed.clinicalCsv),
    vaccinations: countRows(parsed.vaccinationsCsv),
    labOrders: countRows(parsed.labOrdersCsv),
    surgeries: countRows(parsed.surgeriesCsv),
    prescriptions: countRows(parsed.prescriptionsCsv),
    hospitalizations: countRows(parsed.hospitalizationsCsv),
    appointments: countRows(parsed.appointmentsCsv),
    consultations: countRows(parsed.consultationsCsv),
    inventoryProducts: countRows(parsed.inventoryProductsCsv),
    invoices: countRows(parsed.invoicesCsv),
    payments: countRows(parsed.paymentsCsv),
    attachments: parsed.attachmentPaths.length,
  };
}
