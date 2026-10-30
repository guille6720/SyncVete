import type { ClinicalHistoryReport, HistoryReportEntry } from './clinical-history-report';

export function reportFixture(): ClinicalHistoryReport {
  const entry: HistoryReportEntry = {
    id: 'a0000000-0000-4000-8000-000000000004',
    organization_id: 'a0000000-0000-4000-8000-000000000001',
    branch_id: 'a0000000-0000-4000-8000-000000000002',
    patient_id: 'a0000000-0000-4000-8000-000000000005',
    owner_id: 'a0000000-0000-4000-8000-000000000006',
    appointment_id: null,
    recorded_by: null,
    entry_date: '2026-10-28T14:30:00Z',
    entry_type: 'consulta',
    title: 'Control clínico de ejemplo',
    anamnesis: 'Paciente activo. Alimentación e hidratación conservadas.',
    physical_exam: 'Mucosas rosadas. Temperatura y frecuencia cardíaca dentro de rango.',
    diagnosis: 'Evolución favorable. Control de rutina.',
    treatment: 'Indicaciones de cuidado y control según evolución.',
    plan: 'Revisión en siete días. Consultar ante cambios en el estado general.',
    notes: 'Registro ficticio para verificar la impresión.',
    weight_kg: 12.5,
    temperature_c: 38.4,
    created_at: '2026-10-28T14:30:00Z',
    updated_at: '2026-10-28T14:30:00Z',
    deleted_at: null,
    professionalName: 'Dra. María Pérez',
    branchName: 'Sucursal de ejemplo',
  };
  return {
    clinicName: 'Veterinaria de ejemplo',
    patient: {
      id: entry.patient_id,
      name: 'Luna — ejemplo',
      species: 'Canino',
      breed: 'Mestizo',
      sex: 'Hembra',
      birth_date: '2020-03-15',
      microchip: null,
    },
    ownerName: 'Tutor de ejemplo',
    generatedAt: '2026-10-28T16:00:00Z',
    entries: [entry],
  };
}
