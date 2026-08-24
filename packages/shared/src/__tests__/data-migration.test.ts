import { describe, expect, it } from 'vitest';
import {
  autoMapColumns,
  buildBranchTemplateCsv,
  buildOwnerTemplateCsv,
  buildPatientTemplateCsv,
  buildVaccinationTemplateCsv,
  CLINICAL_IMPORT_FIELDS,
  chunkRange,
  guessMimeFromFilename,
  LAB_ORDER_IMPORT_FIELDS,
  normalizeDocument,
  OWNER_IMPORT_FIELDS,
  PATIENT_IMPORT_FIELDS,
  parseCsv,
  parseImportDate,
  parseMigrationAttachmentPath,
  parseMigrationManifest,
  normalizeExportDateRange,
  isSpecialtyExportType,
  SPECIALTY_EXPORT_CHILD_FILES,
  SPECIALTY_EXPORT_TYPES,
  FOCUSED_EXPORT_ZIP_COMPANIONS,
  FOCUSED_EXPORT_JSON_KEYS,
  buildFocusedExportJsonPayload,
  nextFullMigrationStep,
  previousFullMigrationStep,
  FULL_MIGRATION_STEPS,
  FULL_MIGRATION_STEP_MAP_USAGE,
  buildValidationReportCsv,
  buildBatchErrorsReportCsv,
  unresolvedConflictRows,
  EXPORT_TYPE_LABELS,
  EXPORT_TYPES,
  IMPORT_TYPES,
  MAX_IMPORT_CSV_BYTES,
  MAX_IMPORT_ZIP_BYTES,
  buildIntegrityReportCsv,
  buildIdMapReportCsv,
  buildOrgIdMapCsv,
  sumOrphanCounts,
  parseImportDateTime,
  validateAppointmentRows,
  CONSULTATION_IMPORT_FIELDS,
  validateConsultationRows,
  buildAppointmentTemplateCsv,
  buildConsultationTemplateCsv,
  buildStaffMapTemplateCsv,
  parseStaffMapCsv,
  parseBranchMapCsv,
  resolveImportStaffUserId,
  buildInventoryProductTemplateCsv,
  validateInventoryProductRows,
  buildInvoiceTemplateCsv,
  validateInvoiceRows,
  buildPaymentTemplateCsv,
  validatePaymentRows,
  PAYMENT_IMPORT_FIELDS,
  buildBillingReconcileCsv,
  buildCutoverPackReadme,
  buildBranchMapTemplateCsv,
  buildAttachmentMetaKey,
  buildAttachmentMetaTemplateCsv,
  parseAttachmentMetaCsv,
  buildAttachmentMetaExportCsv,
  ATTACHMENT_META_IMPORT_FIELDS,
  buildCutoverRoundtripNotes,
  CUTOVER_PACK_VERSION,
  INVOICE_IMPORT_FIELDS,
  buildExportCatalogCsv,
  buildFreezeRecommendationsCsv,
  buildMigrationChecklistCsv,
  CUTOVER_FREEZE_EXPORT_RECOMMENDATIONS,
  DATA_MIGRATION_AUDIT_ACTIONS,
  isCutoverPackReady,
  summarizeMigrationChecklist,
  validateBranchRows,
  validateClinicalRows,
  validateLabOrderRows,
  validateOwnerRows,
  validatePatientRows,
  validateVaccinationRows,
  resolveImportBranchId,
  DATA_MIGRATION_FORMAT_VERSION,
  buildSampleMigrationManifest,
} from '../constants/data-migration';

describe('data-migration branch-aware imports (phase 23)', () => {
  it('resolveImportBranchId uses default, mapped id, or fails unmapped', () => {
    expect(
      resolveImportBranchId({
        externalBranchId: null,
        branchIdByExternal: { 'BR-001': 'uuid-1' },
        defaultBranchId: 'default-branch',
      })
    ).toEqual({ ok: true, branchId: 'default-branch' });

    expect(
      resolveImportBranchId({
        externalBranchId: 'BR-001',
        branchIdByExternal: { 'BR-001': 'uuid-1' },
        defaultBranchId: 'default-branch',
      })
    ).toEqual({ ok: true, branchId: 'uuid-1' });

    expect(
      resolveImportBranchId({
        externalBranchId: 'BR-404',
        branchIdByExternal: { 'BR-001': 'uuid-1' },
        defaultBranchId: 'default-branch',
      })
    ).toEqual({ ok: false, reason: 'unmapped_branch' });

    expect(
      resolveImportBranchId({
        externalBranchId: 'branch-uuid-known',
        branchIdByExternal: {},
        knownBranchInternalIds: new Set(['branch-uuid-known']),
        defaultBranchId: 'default-branch',
      })
    ).toEqual({ ok: true, branchId: 'branch-uuid-known' });
  });

  it('validateAppointmentRows flags unmapped external_branch_id and accepts mapped', () => {
    const baseRow = {
      externalAppointmentId: 'A1',
      externalPatientId: 'P1',
      externalBranchId: 'BR-404' as string | null,
      externalAssignedUserId: null as string | null,
      startsAt: '2024-10-01 10:00',
      endsAt: '2024-10-01 10:30',
      appointmentType: 'consulta',
      status: 'programada',
      title: 'Control',
      notes: null,
      sourceSystem: 'legacy',
    };
    const unmapped = validateAppointmentRows(
      [{ rowNumber: 2, ...baseRow, externalBranchId: 'BR-404' }],
      { knownPatientExternalIds: new Set(['P1']), knownBranchExternalIds: new Set(['BR-001']), locale: 'es-AR' }
    );
    expect(unmapped.some((i) => i.code === 'unmapped_branch')).toBe(true);

    const mapped = validateAppointmentRows(
      [{ rowNumber: 2, ...baseRow, externalBranchId: 'BR-001' }],
      { knownPatientExternalIds: new Set(['P1']), knownBranchExternalIds: new Set(['BR-001']), locale: 'es-AR' }
    );
    expect(mapped.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('uses migration format version 1.6', () => {
    expect(DATA_MIGRATION_FORMAT_VERSION).toBe('1.6');
    expect(buildSampleMigrationManifest().version).toBe('1.6');
  });
});

describe('data-migration branch-aware owners/patients (phase 30)', () => {
  it('OWNER_IMPORT_FIELDS and PATIENT_IMPORT_FIELDS include external_branch_id', () => {
    expect(OWNER_IMPORT_FIELDS.some((f) => f.key === 'external_branch_id')).toBe(true);
    expect(PATIENT_IMPORT_FIELDS.some((f) => f.key === 'external_branch_id')).toBe(true);
  });

  it('validateOwnerRows flags unmapped external_branch_id', () => {
    const issues = validateOwnerRows(
      [
        {
          rowNumber: 2,
          externalOwnerId: 'OWN-001',
          externalBranchId: 'BR-404',
          fullName: 'Juan Perez',
          documentType: null,
          documentNumber: null,
          phone: null,
          email: null,
          address: null,
          city: null,
          province: null,
          postalCode: null,
          notes: null,
        },
      ],
      { knownBranchExternalIds: new Set(['BR-001']) }
    );
    expect(issues.some((i) => i.code === 'unmapped_branch')).toBe(true);
  });

  it('buildOwnerTemplateCsv and buildPatientTemplateCsv include external_branch_id sample', () => {
    expect(buildOwnerTemplateCsv()).toContain('external_branch_id');
    expect(buildOwnerTemplateCsv()).toContain('BR-001');
    expect(buildPatientTemplateCsv()).toContain('external_branch_id');
    expect(buildPatientTemplateCsv()).toContain('BR-001');
  });
});

describe('data-migration branch-aware clinical imports (phase 25)', () => {
  it('CLINICAL_IMPORT_FIELDS includes external_branch_id', () => {
    expect(CLINICAL_IMPORT_FIELDS.some((f) => f.key === 'external_branch_id')).toBe(true);
  });

  it('validateVaccinationRows flags unmapped external_branch_id', () => {
    const issues = validateVaccinationRows(
      [
        {
          rowNumber: 2,
          externalVaccinationId: 'VAC-001',
          externalPatientId: 'PAT-001',
          externalBranchId: 'BR-404',
          externalAssignedUserId: null,
          vaccineName: 'Antirrábica',
          administeredAt: '2024-03-01',
          nextDueAt: null,
          manufacturer: null,
          lotNumber: null,
          originalVeterinarian: null,
          notes: null,
          sourceSystem: 'VetLegacy',
        },
      ],
      {
        knownPatientExternalIds: new Set(['PAT-001']),
        knownBranchExternalIds: new Set(['BR-001']),
        locale: 'es-AR',
      }
    );
    expect(issues.some((i) => i.code === 'unmapped_branch')).toBe(true);
  });

  it('buildVaccinationTemplateCsv includes external_branch_id sample', () => {
    const csv = buildVaccinationTemplateCsv();
    expect(csv).toContain('external_branch_id');
    expect(csv).toContain('BR-001');
  });
});

describe('data-migration appointment staff mapping (phase 35)', () => {
  it('resolveImportStaffUserId: empty→null; mapped; direct known internal; unmapped fail', () => {
    expect(
      resolveImportStaffUserId({
        externalAssignedUserId: null,
        userIdByExternal: { 'VET-1': 'uuid-1' },
      })
    ).toEqual({ ok: true, userId: null });

    expect(
      resolveImportStaffUserId({
        externalAssignedUserId: '  ',
        userIdByExternal: { 'VET-1': 'uuid-1' },
      })
    ).toEqual({ ok: true, userId: null });

    expect(
      resolveImportStaffUserId({
        externalAssignedUserId: null,
        userIdByExternal: { 'VET-1': 'uuid-1' },
        defaultUserId: 'importer-uuid',
      })
    ).toEqual({ ok: true, userId: 'importer-uuid' });

    expect(
      resolveImportStaffUserId({
        externalAssignedUserId: '  ',
        userIdByExternal: { 'VET-1': 'uuid-1' },
        defaultUserId: 'importer-uuid',
      })
    ).toEqual({ ok: true, userId: 'importer-uuid' });

    expect(
      resolveImportStaffUserId({
        externalAssignedUserId: 'VET-1',
        userIdByExternal: { 'VET-1': 'uuid-mapped' },
      })
    ).toEqual({ ok: true, userId: 'uuid-mapped' });

    expect(
      resolveImportStaffUserId({
        externalAssignedUserId: 'uuid-direct',
        knownStaffInternalIds: new Set(['uuid-direct']),
      })
    ).toEqual({ ok: true, userId: 'uuid-direct' });

    expect(
      resolveImportStaffUserId({
        externalAssignedUserId: 'VET-404',
        userIdByExternal: { 'VET-1': 'uuid-1' },
        knownStaffInternalIds: new Set(['uuid-2']),
      })
    ).toEqual({ ok: false, reason: 'unmapped_staff' });
  });

  it('validateAppointmentRows flags unmapped external_assigned_user_id', () => {
    const issues = validateAppointmentRows(
      [
        {
          rowNumber: 2,
          externalAppointmentId: 'A1',
          externalPatientId: 'P1',
          externalBranchId: null,
          externalAssignedUserId: 'VET-404',
          startsAt: '2024-10-01 10:00',
          endsAt: '2024-10-01 10:30',
          appointmentType: 'consulta',
          status: 'programada',
          title: null,
          notes: null,
          sourceSystem: null,
        },
      ],
      {
        knownPatientExternalIds: new Set(['P1']),
        knownStaffExternalIds: new Set(['VET-1']),
        knownStaffInternalIds: new Set(['profile-uuid']),
        locale: 'es-AR',
      }
    );
    expect(issues.some((i) => i.code === 'unmapped_staff')).toBe(true);

    const ok = validateAppointmentRows(
      [
        {
          rowNumber: 2,
          externalAppointmentId: 'A1',
          externalPatientId: 'P1',
          externalBranchId: null,
          externalAssignedUserId: 'VET-1',
          startsAt: '2024-10-01 10:00',
          endsAt: '2024-10-01 10:30',
          appointmentType: 'consulta',
          status: 'programada',
          title: null,
          notes: null,
          sourceSystem: null,
        },
      ],
      {
        knownPatientExternalIds: new Set(['P1']),
        knownStaffExternalIds: new Set(['VET-1']),
        locale: 'es-AR',
      }
    );
    expect(ok.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('parseStaffMapCsv builds map', () => {
    const csv = 'external_staff_id,internal_user_id\nVET-1,uuid-1\nVET-2,uuid-2\n';
    const parsed = parseStaffMapCsv(csv);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.map).toEqual({ 'VET-1': 'uuid-1', 'VET-2': 'uuid-2' });
  });

  it('buildStaffMapTemplateCsv has headers', () => {
    const csv = buildStaffMapTemplateCsv();
    expect(csv).toContain('external_staff_id');
    expect(csv).toContain('internal_user_id');
    expect(csv).toContain('VET-LEGACY-01');
  });
});

describe('data-migration clinical staff mapping (phase 37)', () => {
  it('CLINICAL_IMPORT_FIELDS and LAB_ORDER_IMPORT_FIELDS include external_assigned_user_id', () => {
    expect(CLINICAL_IMPORT_FIELDS.some((f) => f.key === 'external_assigned_user_id')).toBe(true);
    expect(LAB_ORDER_IMPORT_FIELDS.some((f) => f.key === 'external_assigned_user_id')).toBe(true);
  });

  it('validateLabOrderRows flags unmapped external_assigned_user_id', () => {
    const issues = validateLabOrderRows(
      [
        {
          rowNumber: 2,
          externalLabOrderId: 'LAB-001',
          externalPatientId: 'PAT-001',
          externalBranchId: null,
          externalAssignedUserId: 'VET-404',
          orderedAt: '2024-06-01',
          title: 'Hemograma',
          tests: null,
          priority: null,
          sampleType: null,
          interpretation: null,
          originalVeterinarian: null,
          notes: null,
          sourceSystem: null,
        },
      ],
      {
        knownPatientExternalIds: new Set(['PAT-001']),
        knownStaffExternalIds: new Set(['VET-1']),
        knownStaffInternalIds: new Set(['profile-uuid']),
        locale: 'es-AR',
      }
    );
    expect(issues.some((i) => i.code === 'unmapped_staff')).toBe(true);
  });

  it('validateVaccinationRows flags unmapped external_assigned_user_id', () => {
    const issues = validateVaccinationRows(
      [
        {
          rowNumber: 2,
          externalVaccinationId: 'VAC-001',
          externalPatientId: 'PAT-001',
          externalBranchId: null,
          externalAssignedUserId: 'VET-404',
          vaccineName: 'Antirrábica',
          administeredAt: '2024-03-01',
          nextDueAt: null,
          manufacturer: null,
          lotNumber: null,
          originalVeterinarian: null,
          notes: null,
          sourceSystem: 'VetLegacy',
        },
      ],
      {
        knownPatientExternalIds: new Set(['PAT-001']),
        knownStaffExternalIds: new Set(['VET-1']),
        knownStaffInternalIds: new Set(['profile-uuid']),
        locale: 'es-AR',
      }
    );
    expect(issues.some((i) => i.code === 'unmapped_staff')).toBe(true);
  });
});

describe('data-migration clinical staff mapping (phase 36)', () => {
  it('CONSULTATION_IMPORT_FIELDS includes external_assigned_user_id', () => {
    expect(CONSULTATION_IMPORT_FIELDS.some((f) => f.key === 'external_assigned_user_id')).toBe(true);
  });

  it('validateConsultationRows flags unmapped external_assigned_user_id', () => {
    const baseRow = {
      rowNumber: 2,
      externalConsultationId: 'CON-001',
      externalPatientId: 'PAT-001',
      externalBranchId: null as string | null,
      externalAssignedUserId: 'VET-404' as string | null,
      externalAppointmentId: null as string | null,
      startedAt: '2024-10-01 10:05',
      completedAt: null as string | null,
      status: 'completada',
      title: null,
      anamnesis: null,
      physicalExam: null,
      diagnosis: null,
      treatment: null,
      plan: null,
      weightKg: null,
      temperatureC: null,
      notes: null,
      sourceSystem: null,
    };
    const issues = validateConsultationRows([baseRow], {
      knownPatientExternalIds: new Set(['PAT-001']),
      knownStaffExternalIds: new Set(['VET-1']),
      knownStaffInternalIds: new Set(['profile-uuid']),
      locale: 'es-AR',
    });
    expect(issues.some((i) => i.code === 'unmapped_staff')).toBe(true);

    const ok = validateConsultationRows(
      [{ ...baseRow, externalAssignedUserId: 'VET-1' }],
      {
        knownPatientExternalIds: new Set(['PAT-001']),
        knownStaffExternalIds: new Set(['VET-1']),
        locale: 'es-AR',
      }
    );
    expect(ok.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('buildConsultationTemplateCsv includes external_assigned_user_id sample', () => {
    const csv = buildConsultationTemplateCsv();
    expect(csv).toContain('external_assigned_user_id');
    expect(csv).toContain('VET-LEGACY-01');
  });
});

describe('data-migration parseCsv', () => {
  it('parses quoted CSV with accents', () => {
    const csv = 'nombre,email\n"Juan Pérez",juan@email.com\n';
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(['nombre', 'email']);
    expect(parsed.rows[0]?.nombre).toBe('Juan Pérez');
  });
});

describe('data-migration autoMapColumns', () => {
  it('maps spanish aliases', () => {
    const mapping = autoMapColumns(
      ['Nombre', 'DNI', 'Correo', 'Celular', 'ID'],
      OWNER_IMPORT_FIELDS
    );
    expect(mapping.full_name).toBe('Nombre');
    expect(mapping.document_number).toBe('DNI');
    expect(mapping.email).toBe('Correo');
    expect(mapping.phone).toBe('Celular');
  });
});

describe('data-migration parseImportDate', () => {
  it('parses ISO dates', () => {
    expect(parseImportDate('2024-05-14', 'es-AR')).toEqual({
      ok: true,
      isoDate: '2024-05-14',
    });
  });

  it('parses DD/MM/YYYY for es-AR', () => {
    expect(parseImportDate('14/05/2024', 'es-AR')).toEqual({
      ok: true,
      isoDate: '2024-05-14',
    });
  });

  it('parses MM/DD/YYYY for en-US', () => {
    expect(parseImportDate('05/14/2024', 'en-US')).toEqual({
      ok: true,
      isoDate: '2024-05-14',
    });
  });

  it('rejects empty', () => {
    expect(parseImportDate('  ', 'es-AR').ok).toBe(false);
  });
});

describe('data-migration owner validation', () => {
  it('accepts valid owner', () => {
    const issues = validateOwnerRows([
      {
        rowNumber: 2,
        externalOwnerId: 'OWN-001',
        externalBranchId: null,
        fullName: 'Juan Perez',
        documentType: 'DNI',
        documentNumber: '30111222',
        phone: '1155555555',
        email: 'juan@email.com',
        address: null,
        city: null,
        province: null,
        postalCode: null,
        notes: null,
      },
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('flags missing required and invalid email', () => {
    const issues = validateOwnerRows([
      {
        rowNumber: 2,
        externalOwnerId: '',
        externalBranchId: null,
        fullName: '',
        documentType: null,
        documentNumber: null,
        phone: null,
        email: 'bad',
        address: null,
        city: null,
        province: null,
        postalCode: null,
        notes: null,
      },
    ]);
    expect(issues.some((i) => i.code === 'required')).toBe(true);
    expect(issues.some((i) => i.code === 'invalid_email')).toBe(true);
  });

  it('warns on existing document', () => {
    const issues = validateOwnerRows(
      [
        {
          rowNumber: 2,
          externalOwnerId: 'OWN-001',
          externalBranchId: null,
          fullName: 'Juan Perez',
          documentType: 'DNI',
          documentNumber: '30.111.222',
          phone: null,
          email: null,
          address: null,
          city: null,
          province: null,
          postalCode: null,
          notes: null,
        },
      ],
      { existingDocuments: new Set([normalizeDocument('30111222')]) }
    );
    expect(issues.some((i) => i.code === 'possible_duplicate')).toBe(true);
  });
});

describe('data-migration patient validation', () => {
  it('requires owner reference', () => {
    const issues = validatePatientRows(
      [
        {
          rowNumber: 2,
          externalPatientId: 'PAT-001',
          externalOwnerId: 'OWN-MISSING',
          externalBranchId: null,
          name: 'Rocky',
          species: 'Canino',
          breed: null,
          sex: 'Macho',
          birthDate: '2020-03-12',
          microchip: null,
          color: null,
          weightKg: null,
          status: 'active',
          notes: null,
        },
      ],
      { knownOwnerExternalIds: new Set(['OWN-001']) }
    );
    expect(issues.some((i) => i.code === 'missing_owner')).toBe(true);
  });

  it('warns duplicate microchip', () => {
    const issues = validatePatientRows(
      [
        {
          rowNumber: 2,
          externalPatientId: 'PAT-001',
          externalOwnerId: 'OWN-001',
          externalBranchId: null,
          name: 'Rocky',
          species: 'Canino',
          breed: null,
          sex: 'Macho',
          birthDate: null,
          microchip: '985141000123',
          color: null,
          weightKg: null,
          status: null,
          notes: null,
        },
      ],
      {
        knownOwnerExternalIds: new Set(['OWN-001']),
        existingMicrochips: new Set(['985141000123']),
      }
    );
    expect(issues.some((i) => i.code === 'possible_duplicate')).toBe(true);
  });
});

describe('data-migration clinical validation', () => {
  it('keeps original date required and patient link', () => {
    const issues = validateClinicalRows(
      [
        {
          rowNumber: 2,
          externalClinicalId: 'CLI-001',
          externalPatientId: 'PAT-X',
          externalBranchId: null,
          externalAssignedUserId: null,
          originalDate: '03/04/2024',
          originalVeterinarian: 'Dr. Lopez',
          recordType: 'consulta',
          reason: null,
          anamnesis: null,
          clinicalFindings: null,
          diagnosis: null,
          treatment: null,
          observations: null,
          sourceSystem: 'VetLegacy',
        },
      ],
      { knownPatientExternalIds: new Set(['PAT-001']), locale: 'es-AR' }
    );
    expect(issues.some((i) => i.code === 'missing_patient')).toBe(true);
    expect(issues.some((i) => i.severity === 'error' && i.field === 'original_date')).toBe(false);
  });
});

describe('data-migration templates', () => {
  it('builds owner template with example row', () => {
    const csv = buildOwnerTemplateCsv();
    expect(csv).toContain('external_owner_id');
    expect(csv).toContain('OWN-001');
  });

  it('builds vaccination template', () => {
    const csv = buildVaccinationTemplateCsv();
    expect(csv).toContain('external_vaccination_id');
    expect(csv).toContain('VAC-001');
  });
});

describe('data-migration vaccination validation', () => {
  it('flags missing patient and invalid dates', () => {
    const issues = validateVaccinationRows(
      [
        {
          rowNumber: 2,
          externalVaccinationId: 'VAC-001',
          externalPatientId: 'PAT-404',
          externalBranchId: null,
          externalAssignedUserId: null,
          vaccineName: 'Antirrábica',
          administeredAt: 'no-date',
          nextDueAt: null,
          manufacturer: null,
          lotNumber: null,
          originalVeterinarian: null,
          notes: null,
          sourceSystem: 'VetLegacy',
        },
      ],
      { knownPatientExternalIds: new Set(['PAT-001']), locale: 'iso' }
    );
    expect(issues.some((i) => i.code === 'missing_patient')).toBe(true);
    expect(issues.some((i) => i.code === 'invalid_date')).toBe(true);
  });
});

describe('data-migration zip manifest', () => {
  it('accepts syncvete migration manifest', () => {
    const parsed = parseMigrationManifest({
      format: 'syncvete-migration',
      version: '1.0',
      sourceSystem: 'VetLegacy',
      entities: { owners: 1 },
    });
    expect(parsed?.format).toBe('syncvete-migration');
    expect(parsed?.entities?.owners).toBe(1);
  });

  it('rejects foreign manifests', () => {
    expect(parseMigrationManifest({ format: 'other', version: '1' })).toBeNull();
  });
});

describe('data-migration specialty + chunks', () => {
  it('validates lab order patient link', () => {
    const issues = validateLabOrderRows(
      [
        {
          rowNumber: 2,
          externalLabOrderId: 'LAB-1',
          externalPatientId: 'PAT-X',
          externalBranchId: 'BR-404',
          externalAssignedUserId: null,
          orderedAt: '2024-01-01',
          title: 'Hemograma',
          tests: 'Hemograma',
          priority: 'rutina',
          sampleType: 'sangre',
          interpretation: null,
          originalVeterinarian: null,
          notes: null,
          sourceSystem: null,
        },
      ],
      {
        knownPatientExternalIds: new Set(['PAT-001']),
        knownBranchExternalIds: new Set(['BR-001']),
        locale: 'iso',
      }
    );
    expect(issues.some((i) => i.code === 'missing_patient')).toBe(true);
    expect(issues.some((i) => i.code === 'unmapped_branch')).toBe(true);
  });

  it('parses attachment paths and chunks ranges', () => {
    const ref = parseMigrationAttachmentPath('attachments/PAT-001/rx.pdf');
    expect(ref?.externalPatientId).toBe('PAT-001');
    expect(ref?.filename).toBe('rx.pdf');
    expect(guessMimeFromFilename('rx.pdf')).toBe('application/pdf');
    expect(chunkRange(120, 50, 50)).toEqual({
      offset: 50,
      end: 100,
      size: 50,
      done: false,
      nextOffset: 100,
      total: 120,
    });
  });

  it('blocks unresolved conflict decisions', () => {
    const issues = [
      {
        rowNumber: 2,
        entityType: 'owners',
        code: 'possible_duplicate',
        message: 'dup',
        severity: 'warning' as const,
        matchInternalId: 'uuid-1',
      },
    ];
    expect(unresolvedConflictRows(issues, {})).toEqual([2]);
    expect(
      unresolvedConflictRows(issues, {
        2: { rowNumber: 2, decision: 'link', linkInternalId: 'uuid-1' },
      })
    ).toEqual([]);
  });

  it('normalizes export date ranges', () => {
    expect(normalizeExportDateRange({ dateFrom: '2024-05-01', dateTo: '2024-01-01' })).toEqual({
      dateFrom: '2024-01-01',
      dateTo: '2024-05-01',
    });
    expect(isSpecialtyExportType('lab_orders')).toBe(true);
    expect(isSpecialtyExportType('owners')).toBe(false);
  });

  it('orders full migration guide steps', () => {
    expect(nextFullMigrationStep('branches')).toBe('owners');
    expect(nextFullMigrationStep('owners')).toBe('patients');
    expect(nextFullMigrationStep('attachments')).toBeNull();
    expect(previousFullMigrationStep('owners')).toBe('branches');
    expect(previousFullMigrationStep('patients')).toBe('owners');
    expect(FULL_MIGRATION_STEPS).toHaveLength(15);
    expect(FULL_MIGRATION_STEPS).toContain('branches');
    expect(FULL_MIGRATION_STEPS).toContain('appointments');
    expect(FULL_MIGRATION_STEPS).toContain('consultations');
    expect(FULL_MIGRATION_STEPS).toContain('inventory_products');
    expect(FULL_MIGRATION_STEPS).toContain('invoices');
    expect(FULL_MIGRATION_STEPS).toContain('payments');
  });

  it('builds validation report csv', () => {
    const csv = buildValidationReportCsv([
      {
        rowNumber: 2,
        entityType: 'owners',
        code: 'possible_duplicate',
        message: 'dup',
        severity: 'warning',
        field: 'email',
        matchInternalId: 'abc',
      },
    ]);
    expect(csv).toContain('row_number');
    expect(csv).toContain('possible_duplicate');
    expect(csv).toContain('abc');
  });

  it('builds batch errors report csv', () => {
    const csv = buildBatchErrorsReportCsv([
      {
        rowNumber: 3,
        entityType: 'patients',
        errorCode: 'invalid_date',
        errorMessage: 'fecha inválida',
        severity: 'error',
      },
    ]);
    expect(csv).toContain('error_code');
    expect(csv).toContain('invalid_date');
  });

  it('labels specialty exports with items', () => {
    expect(EXPORT_TYPE_LABELS.branches).toMatch(/sucursal/i);
    expect(EXPORT_TYPE_LABELS.prescriptions).toMatch(/ítems/i);
    expect(EXPORT_TYPE_LABELS.lab_orders).toMatch(/ítems/i);
  });

  it('validates branch rows and template csv', () => {
    const issues = validateBranchRows([
      {
        rowNumber: 2,
        externalBranchId: 'BR-001',
        name: 'Sede Centro',
        code: 'CENTRO',
        address: null,
        phone: null,
        email: null,
        timezone: null,
        isActive: 'true',
        sourceSystem: 'legacy',
      },
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(buildBranchTemplateCsv()).toContain('external_branch_id');
  });

  it('parses appointment datetimes and validates rows', () => {
    expect(parseImportDateTime('2024-10-01 10:00', 'es-AR').ok).toBe(true);
    expect(parseImportDateTime('01/10/2024 10:30', 'es-AR').ok).toBe(true);
    const issues = validateAppointmentRows(
      [
        {
          rowNumber: 2,
          externalAppointmentId: 'A1',
          externalPatientId: 'P1',
          externalBranchId: null,
          externalAssignedUserId: null,
          startsAt: '2024-10-01 10:00',
          endsAt: '2024-10-01 10:30',
          appointmentType: 'consulta',
          status: 'programada',
          title: 'Control',
          notes: null,
          sourceSystem: 'legacy',
        },
      ],
      { knownPatientExternalIds: new Set(['P1']), locale: 'es-AR' }
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    const template = buildAppointmentTemplateCsv();
    expect(template).toContain('external_appointment_id');
    expect(template).toContain('external_branch_id');
    expect(template).toContain('external_assigned_user_id');
    expect(template).toContain('BR-001');
    expect(template).toContain('VET-LEGACY-01');
  });

  it('validates inventory product rows', () => {
    const issues = validateInventoryProductRows([
      {
        rowNumber: 2,
        externalProductId: 'P1',
        externalBranchId: null,
        name: 'Amox',
        sku: 'A1',
        category: 'medicamento',
        unit: 'caja',
        quantity: '10',
        minQuantity: '1',
        unitCost: '100',
        unitPrice: '200',
        manufacturer: null,
        notes: null,
        sourceSystem: 'legacy',
      },
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(buildInventoryProductTemplateCsv()).toContain('external_product_id');
  });

  it('validates invoice rows', () => {
    const issues = validateInvoiceRows([
      {
        rowNumber: 2,
        externalInvoiceId: 'INV-1',
        externalBranchId: null,
        externalAssignedUserId: null,
        externalOwnerId: 'OWN-1',
        externalPatientId: 'PAT-1',
        number: 'A-1',
        status: 'emitida',
        issuedAt: '2024-01-01',
        currency: 'ARS',
        subtotal: '100',
        taxAmount: '0',
        total: '100',
        paidAmount: '0',
        balance: '100',
        description: 'Consulta',
        quantity: '1',
        unitPrice: '100',
        lineTotal: '100',
        externalProductId: null,
        notes: null,
        sourceSystem: 'legacy',
      },
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(buildInvoiceTemplateCsv()).toContain('external_invoice_id');
    expect(buildInvoiceTemplateCsv()).toContain('external_assigned_user_id');
  });

  it('validates payment rows', () => {
    const issues = validatePaymentRows([
      {
        rowNumber: 2,
        externalPaymentId: 'PAY-1',
        externalInvoiceId: 'INV-1',
        externalAssignedUserId: null,
        amount: '100',
        method: 'transferencia',
        paidAt: '2024-01-02',
        reference: 'TRX',
        notes: null,
        sourceSystem: 'legacy',
      },
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(buildPaymentTemplateCsv()).toContain('external_payment_id');
    expect(buildPaymentTemplateCsv()).toContain('external_assigned_user_id');
  });

  it('PAYMENT_IMPORT_FIELDS includes external_assigned_user_id', () => {
    expect(PAYMENT_IMPORT_FIELDS.some((f) => f.key === 'external_assigned_user_id')).toBe(true);
  });

  it('validatePaymentRows flags unmapped external_assigned_user_id', () => {
    const issues = validatePaymentRows(
      [
        {
          rowNumber: 2,
          externalPaymentId: 'PAY-1',
          externalInvoiceId: 'INV-1',
          externalAssignedUserId: 'VET-404',
          amount: '100',
          method: 'transferencia',
          paidAt: null,
          reference: null,
          notes: null,
          sourceSystem: 'legacy',
        },
      ],
      {
        knownStaffExternalIds: new Set(['VET-1']),
        knownStaffInternalIds: new Set(['uuid-1']),
      }
    );
    expect(issues.some((i) => i.code === 'unmapped_staff')).toBe(true);
  });

  it('warns when payment sum mismatches invoice paid_amount', () => {
    const issues = validatePaymentRows(
      [
        {
          rowNumber: 2,
          externalPaymentId: 'PAY-1',
          externalInvoiceId: 'INV-1',
          externalAssignedUserId: null,
          amount: '50',
          method: 'efectivo',
          paidAt: null,
          reference: null,
          notes: null,
          sourceSystem: 'legacy',
        },
      ],
      { invoicePaidAmountByExternal: new Map([['INV-1', 100]]) }
    );
    expect(issues.some((i) => i.code === 'paid_amount_mismatch')).toBe(true);
  });

  it('builds billing reconcile csv', () => {
    const csv = buildBillingReconcileCsv(
      [{ invoiceId: 'i1', invoiceNumber: 'A-1', paidAmount: 100, paymentsSum: 80, delta: 20 }],
      { organizationId: 'org', summary: { mismatch: 1 } }
    );
    expect(csv).toContain('invoice_id');
    expect(csv).toContain('delta');
  });

  it('labels appointments export', () => {
    expect(EXPORT_TYPE_LABELS.appointments).toMatch(/agenda|citas/i);
    expect(EXPORT_TYPE_LABELS.consultations).toMatch(/consulta/i);
    expect(EXPORT_TYPE_LABELS.inventory_products).toMatch(/inventario/i);
    expect(EXPORT_TYPE_LABELS.invoices).toMatch(/factura/i);
    expect(EXPORT_TYPE_LABELS.payments).toMatch(/pago/i);
    expect(EXPORT_TYPE_LABELS.cash_sessions).toMatch(/caja/i);
  });

  it('cash_sessions is export-only (phase 24)', () => {
    expect(EXPORT_TYPES).toContain('cash_sessions');
    expect(EXPORT_TYPE_LABELS.cash_sessions).toBeDefined();
    expect(IMPORT_TYPES).not.toContain('cash_sessions');
    expect(FULL_MIGRATION_STEPS).not.toContain('cash_sessions');
  });

  it('reminder_logs is export-only (phase 27)', () => {
    expect(EXPORT_TYPES).toContain('reminder_logs');
    expect(EXPORT_TYPE_LABELS.reminder_logs).toBeDefined();
    expect(IMPORT_TYPES).not.toContain('reminder_logs');
    expect(FULL_MIGRATION_STEPS).not.toContain('reminder_logs');
  });

  it('whatsapp_messages is export-only (phase 28)', () => {
    expect(EXPORT_TYPES).toContain('whatsapp_messages');
    expect(EXPORT_TYPE_LABELS.whatsapp_messages).toBeDefined();
    expect(IMPORT_TYPES).not.toContain('whatsapp_messages');
    expect(FULL_MIGRATION_STEPS).not.toContain('whatsapp_messages');
  });

  it('audit_logs is export-only (phase 29)', () => {
    expect(EXPORT_TYPES).toContain('audit_logs');
    expect(EXPORT_TYPE_LABELS.audit_logs).toBeDefined();
    expect(IMPORT_TYPES).not.toContain('audit_logs');
    expect(FULL_MIGRATION_STEPS).not.toContain('audit_logs');
  });

  it('notifications is export-only (phase 33)', () => {
    expect(EXPORT_TYPES).toContain('notifications');
    expect(EXPORT_TYPE_LABELS.notifications).toBeDefined();
    expect(IMPORT_TYPES).not.toContain('notifications');
    expect(FULL_MIGRATION_STEPS).not.toContain('notifications');
  });

  it('staff_profiles is export-only (phase 34)', () => {
    expect(EXPORT_TYPES).toContain('staff_profiles');
    expect(EXPORT_TYPE_LABELS.staff_profiles).toBeDefined();
    expect(EXPORT_TYPE_LABELS.staff_profiles).toMatch(/staff|membres/i);
    expect(IMPORT_TYPES).not.toContain('staff_profiles');
    expect(FULL_MIGRATION_STEPS).not.toContain('staff_profiles');
  });

  it('inventory_movements is export-only (phase 43)', () => {
    expect(EXPORT_TYPES).toContain('inventory_movements');
    expect(EXPORT_TYPE_LABELS.inventory_movements).toBeDefined();
    expect(EXPORT_TYPE_LABELS.inventory_movements).toMatch(/inventario|stock/i);
    expect(IMPORT_TYPES).not.toContain('inventory_movements');
    expect(FULL_MIGRATION_STEPS).not.toContain('inventory_movements');
  });

  it('hospitalizations export label mentions notes (phase 45)', () => {
    expect(EXPORT_TYPES).toContain('hospitalizations');
    expect(EXPORT_TYPE_LABELS.hospitalizations).toMatch(/nota/i);
    expect(IMPORT_TYPES).toContain('hospitalizations');
    expect(IMPORT_TYPES).not.toContain('hospitalization_notes');
  });

  it('clinical_images is export-only metadata catalog (phase 46)', () => {
    expect(EXPORT_TYPES).toContain('clinical_images');
    expect(EXPORT_TYPE_LABELS.clinical_images).toMatch(/adjunto|metadata|clínic/i);
    expect(IMPORT_TYPES).not.toContain('clinical_images');
    expect(FULL_MIGRATION_STEPS).not.toContain('clinical_images');
    const catalog = buildExportCatalogCsv();
    expect(catalog).toMatch(/clinical_images,[^,\n]*,no,/);
  });

  it('specialty ZIP child files catalog (phase 47)', () => {
    expect(SPECIALTY_EXPORT_TYPES).toEqual([
      'lab_orders',
      'surgeries',
      'prescriptions',
      'hospitalizations',
    ]);
    expect(SPECIALTY_EXPORT_CHILD_FILES.lab_orders).toContain('lab_order_items');
    expect(SPECIALTY_EXPORT_CHILD_FILES.prescriptions).toContain('prescription_items');
    expect(SPECIALTY_EXPORT_CHILD_FILES.hospitalizations).toContain('hospitalization_notes');
    expect(SPECIALTY_EXPORT_CHILD_FILES.surgeries).toEqual([]);
    for (const key of SPECIALTY_EXPORT_TYPES) {
      expect(isSpecialtyExportType(key)).toBe(true);
      expect(SPECIALTY_EXPORT_CHILD_FILES[key]).toBeDefined();
    }
  });

  it('focused single-entity ZIP companions (phase 48)', () => {
    expect(FOCUSED_EXPORT_ZIP_COMPANIONS.cash_sessions).toEqual(['cash_movements']);
    expect(FOCUSED_EXPORT_ZIP_COMPANIONS.invoices).toEqual([
      'invoice_items',
      'invoice_payments',
    ]);
    expect(FOCUSED_EXPORT_ZIP_COMPANIONS.staff_profiles).toEqual(['staff_memberships']);
    expect(FOCUSED_EXPORT_ZIP_COMPANIONS.full_clinic).toBeUndefined();
    expect(FOCUSED_EXPORT_ZIP_COMPANIONS.patient_clinical).toBeUndefined();
    expect(FOCUSED_EXPORT_ZIP_COMPANIONS.lab_orders).toBeUndefined();
  });

  it('focused single-entity JSON payload (phase 49)', () => {
    expect(FOCUSED_EXPORT_JSON_KEYS.cash_sessions).toBe('cashSessions');
    expect(FOCUSED_EXPORT_JSON_KEYS.clinical_images).toBe('clinicalImages');
    const cash = buildFocusedExportJsonPayload({
      exportType: 'cash_sessions',
      manifest: { version: '1.6' },
      primaryRows: [{ id: 's1' }],
      companionRowsByBasename: {
        cash_movements: [{ id: 'm1' }],
        invoice_items: [{ id: 'should-not-appear' }],
      },
    });
    expect(Object.keys(cash).sort()).toEqual(['cashMovements', 'cashSessions', 'manifest']);
    expect(cash.cashMovements).toEqual([{ id: 'm1' }]);

    const lab = buildFocusedExportJsonPayload({
      exportType: 'lab_orders',
      manifest: {},
      primaryRows: [{ id: 'l1' }],
      companionRowsByBasename: {
        lab_order_items: [{ id: 'i1' }],
        cash_movements: [{ id: 'ignore' }],
      },
    });
    expect(Object.keys(lab).sort()).toEqual(['labOrderItems', 'labOrders', 'manifest']);
    expect(lab.labOrderItems).toEqual([{ id: 'i1' }]);
  });

  it('validates consultation rows', () => {
    const issues = validateConsultationRows(
      [
        {
          rowNumber: 2,
          externalConsultationId: 'CON-001',
          externalPatientId: 'PAT-001',
          externalBranchId: null,
          externalAssignedUserId: null,
          externalAppointmentId: 'APT-001',
          startedAt: '2024-10-01 10:05',
          completedAt: '2024-10-01 10:35',
          status: 'completada',
          title: 'Control',
          anamnesis: null,
          physicalExam: null,
          diagnosis: null,
          treatment: null,
          plan: null,
          weightKg: null,
          temperatureC: null,
          notes: null,
          sourceSystem: 'legacy',
        },
      ],
      { knownPatientExternalIds: new Set(['PAT-001']), locale: 'es-AR' }
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(buildConsultationTemplateCsv()).toContain('external_consultation_id');
  });

  it('warns appointment overlaps in file', () => {
    const issues = validateAppointmentRows(
      [
        {
          rowNumber: 2,
          externalAppointmentId: 'A1',
          externalPatientId: 'P1',
          externalBranchId: null,
          externalAssignedUserId: null,
          startsAt: '2024-10-01 10:00',
          endsAt: '2024-10-01 10:30',
          appointmentType: 'consulta',
          status: 'programada',
          title: null,
          notes: null,
          sourceSystem: null,
        },
        {
          rowNumber: 3,
          externalAppointmentId: 'A2',
          externalPatientId: 'P1',
          externalBranchId: null,
          externalAssignedUserId: null,
          startsAt: '2024-10-01 10:15',
          endsAt: '2024-10-01 10:45',
          appointmentType: 'consulta',
          status: 'programada',
          title: null,
          notes: null,
          sourceSystem: null,
        },
      ],
      { knownPatientExternalIds: new Set(['P1']), locale: 'es-AR' }
    );
    expect(issues.some((i) => i.code === 'possible_overlap')).toBe(true);
  });

  it('builds migration checklist csv', () => {
    const items = [
      { key: 'owners', label: 'Owners', status: 'ok', count: 2, detail: null },
      { key: 'stuck', label: 'Locks', status: 'fail', count: 1, detail: 'x' },
    ];
    expect(summarizeMigrationChecklist(items)).toEqual({ ok: 1, warn: 0, fail: 1, total: 2 });
    expect(buildMigrationChecklistCsv(items, { organizationId: 'o1', readyForGolive: false })).toContain(
      'ready_for_golive'
    );
  });

  it('defines upload size caps', () => {
    expect(MAX_IMPORT_CSV_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_IMPORT_ZIP_BYTES).toBe(80 * 1024 * 1024);
  });

  it('buildOrgIdMapCsv includes organization_id meta and map rows (phase 32)', () => {
    const csv = buildOrgIdMapCsv(
      [
        {
          batchId: 'batch-1',
          entityType: 'owners',
          externalId: 'EXT-1',
          internalId: 'uuid-1',
          createdAt: '2026-08-21T12:00:00Z',
        },
      ],
      { organizationId: 'org-32', generatedAt: '2026-08-21T12:00:00Z', truncated: false }
    );
    expect(csv).toContain('organization_id');
    expect(csv).toContain('org-32');
    expect(csv).toContain('batch-1');
    expect(csv).toContain('EXT-1');
    expect(csv).toContain('uuid-1');
    expect(csv).toContain('map,batch-1,owners,EXT-1,uuid-1');
  });

  it('buildOrgIdMapCsv with empty rows still produces meta section (phase 32)', () => {
    const csv = buildOrgIdMapCsv([], { organizationId: 'org-empty', generatedAt: '2026-08-21T12:00:00Z' });
    expect(csv).toContain('organization_id');
    expect(csv).toContain('org-empty');
    expect(csv).toContain('row_count');
    expect(csv).toContain(',0,complete,');
    expect(csv).not.toMatch(/,map,/);
  });

  it('builds cutover pack readme with org and go-live', () => {
    const readme = buildCutoverPackReadme({
      organizationId: 'org-cutover-1',
      generatedAt: '2026-08-21T12:00:00Z',
      readyForGolive: true,
      checklistScoreOk: 8,
      checklistScoreTotal: 8,
      orphanCreatedTotal: 0,
      orphanIdMapTotal: 0,
      stuckImports: 0,
      stuckExports: 0,
      billingMismatch: 0,
      billingPaidWithoutPayments: 0,
    });
    expect(readme).toContain('org-cutover-1');
    expect(readme.toLowerCase()).toContain('go-live');
    expect(readme).toContain('export_catalog.csv');
  });

  it('buildExportCatalogCsv marks export-only types as not importable (phase 31)', () => {
    const csv = buildExportCatalogCsv();
    expect(csv).toContain('audit_logs');
    expect(csv).toContain('cash_sessions');
    expect(csv).toContain('inventory_movements');
    expect(csv).toContain('notifications');
    expect(csv).toContain('staff_profiles');
    expect(csv).toMatch(/audit_logs,[^,\n]*,no,/);
    expect(csv).toMatch(/cash_sessions,[^,\n]*,no,/);
    expect(csv).toMatch(/inventory_movements,[^,\n]*,no,/);
    expect(csv).toMatch(/notifications,[^,\n]*,no,/);
    expect(csv).toMatch(/staff_profiles,[^,\n]*,no,/);
  });

  it('buildFreezeRecommendationsCsv includes full_clinic as required (phase 31)', () => {
    const csv = buildFreezeRecommendationsCsv();
    expect(csv).toContain('full_clinic');
    expect(csv).toMatch(/required,full_clinic,/);
  });

  it('CUTOVER_FREEZE_EXPORT_RECOMMENDATIONS has at least four entries (phase 31)', () => {
    expect(CUTOVER_FREEZE_EXPORT_RECOMMENDATIONS.length).toBeGreaterThanOrEqual(4);
  });

  it('isCutoverPackReady when all clear or blocked on issues', () => {
    expect(
      isCutoverPackReady({
        readyForGolive: true,
        orphanCreatedTotal: 0,
        orphanIdMapTotal: 0,
        stuckImports: 0,
        stuckExports: 0,
        billingMismatch: 0,
      })
    ).toBe(true);
    expect(
      isCutoverPackReady({
        readyForGolive: true,
        orphanCreatedTotal: 1,
        orphanIdMapTotal: 0,
        stuckImports: 0,
        stuckExports: 0,
        billingMismatch: 0,
      })
    ).toBe(false);
    expect(
      isCutoverPackReady({
        readyForGolive: true,
        orphanCreatedTotal: 0,
        orphanIdMapTotal: 0,
        stuckImports: 0,
        stuckExports: 0,
        billingMismatch: 2,
      })
    ).toBe(false);
  });

  it('defines cutover pack audit action', () => {
    expect(DATA_MIGRATION_AUDIT_ACTIONS.cutoverPackDownloaded).toBe(
      'data_migration.cutover_pack_downloaded'
    );
  });

  it('builds integrity and id-map reports', () => {
    expect(sumOrphanCounts({ owners: 2, patients: 1 })).toBe(3);
    const integrity = buildIntegrityReportCsv({
      organizationId: 'org-1',
      generatedAt: '2026-08-21T00:00:00Z',
      imports: { total: 3 },
      orphansCreated: { owners: 1 },
      stuckImports: 0,
    });
    expect(integrity).toContain('orphans_created_rows');
    expect(integrity).toContain('owners');
    const idMap = buildIdMapReportCsv([
      {
        entityType: 'owners',
        externalId: 'ext-1',
        internalId: 'uuid-1',
        createdAt: '2026-08-21T00:00:00Z',
      },
    ]);
    expect(idMap).toContain('external_id');
    expect(idMap).toContain('ext-1');
  });
});

describe('data-migration invoice staff + cutover pack v3 (phase 39)', () => {
  it('INVOICE_IMPORT_FIELDS includes external_assigned_user_id', () => {
    expect(INVOICE_IMPORT_FIELDS.some((f) => f.key === 'external_assigned_user_id')).toBe(true);
  });

  it('validateInvoiceRows flags unmapped external_assigned_user_id', () => {
    const issues = validateInvoiceRows(
      [
        {
          rowNumber: 2,
          externalInvoiceId: 'INV-1',
          externalBranchId: null,
          externalAssignedUserId: 'VET-404',
          externalOwnerId: 'OWN-1',
          externalPatientId: null,
          number: 'A-1',
          status: 'emitida',
          issuedAt: '2024-01-01',
          currency: 'ARS',
          subtotal: '100',
          taxAmount: '0',
          total: '100',
          paidAmount: '0',
          balance: '100',
          description: 'Consulta',
          quantity: '1',
          unitPrice: '100',
          lineTotal: '100',
          externalProductId: null,
          notes: null,
          sourceSystem: 'legacy',
        },
      ],
      {
        knownStaffExternalIds: new Set(['VET-1']),
        knownStaffInternalIds: new Set(['uuid-1']),
      }
    );
    expect(issues.some((i) => i.code === 'unmapped_staff')).toBe(true);
  });

  it('CUTOVER_PACK_VERSION is 4', () => {
    expect(CUTOVER_PACK_VERSION).toBe(4);
  });

  it('buildCutoverPackReadme includes staff_map_template.csv', () => {
    const readme = buildCutoverPackReadme({
      organizationId: 'org-39',
      generatedAt: '2026-08-21T12:00:00Z',
      readyForGolive: false,
      checklistScoreOk: 0,
      checklistScoreTotal: 8,
      orphanCreatedTotal: 0,
      orphanIdMapTotal: 0,
      stuckImports: 0,
      stuckExports: 0,
      billingMismatch: 0,
      billingPaidWithoutPayments: 0,
    });
    expect(readme).toContain('staff_map_template.csv');
    expect(readme).toContain('branch_map_template.csv');
    expect(readme).toContain('attachments_meta_template.csv');
    expect(readme).toContain('roundtrip_notes.txt');
    expect(readme).toContain('fase 50');
  });

  it('buildCutoverRoundtripNotes mentions round-trip', () => {
    const notes = buildCutoverRoundtripNotes();
    expect(notes.toLowerCase()).toContain('round-trip');
    expect(notes).toContain('attachments_meta.csv');
    expect(notes).toContain('cutover pack v4');
  });
});

describe('data-migration guided step map usage (phase 41)', () => {
  it('FULL_MIGRATION_STEP_MAP_USAGE covers all FULL_MIGRATION_STEPS keys', () => {
    for (const step of FULL_MIGRATION_STEPS) {
      expect(FULL_MIGRATION_STEP_MAP_USAGE[step]).toBeDefined();
      expect(typeof FULL_MIGRATION_STEP_MAP_USAGE[step].branch).toBe('boolean');
      expect(typeof FULL_MIGRATION_STEP_MAP_USAGE[step].staff).toBe('boolean');
    }
  });

  it('spot-checks branch/staff usage per step', () => {
    expect(FULL_MIGRATION_STEP_MAP_USAGE.owners).toEqual({ branch: true, staff: false });
    expect(FULL_MIGRATION_STEP_MAP_USAGE.clinical_entries).toEqual({ branch: true, staff: true });
    expect(FULL_MIGRATION_STEP_MAP_USAGE.payments).toEqual({ branch: false, staff: true });
    expect(FULL_MIGRATION_STEP_MAP_USAGE.attachments).toEqual({ branch: false, staff: false });
  });
});

describe('data-migration branch map + internal UUID (phase 40)', () => {
  it('parseBranchMapCsv happy path', () => {
    const csv = [
      'external_branch_id,internal_branch_id',
      'BR-001,00000000-0000-4000-8000-0000000000b1',
      'BR-002,00000000-0000-4000-8000-0000000000b2',
    ].join('\n');
    const parsed = parseBranchMapCsv(csv);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.map).toEqual({
      'BR-001': '00000000-0000-4000-8000-0000000000b1',
      'BR-002': '00000000-0000-4000-8000-0000000000b2',
    });
  });

  it('parseBranchMapCsv flags missing headers', () => {
    const parsed = parseBranchMapCsv('foo,bar\n1,2');
    expect(parsed.issues.some((i) => i.message.includes('Cabeceras requeridas'))).toBe(true);
    expect(Object.keys(parsed.map)).toHaveLength(0);
  });

  it('validateOwnerRows accepts known internal branch UUID; unknown fails', () => {
    const baseRow = {
      rowNumber: 2,
      externalOwnerId: 'OWN-001',
      fullName: 'Juan Perez',
      documentType: null,
      documentNumber: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      province: null,
      postalCode: null,
      notes: null,
    };
    const knownInternal = validateOwnerRows(
      [{ ...baseRow, externalBranchId: 'branch-uuid-1' }],
      {
        knownBranchExternalIds: new Set(['BR-001']),
        knownBranchInternalIds: new Set(['branch-uuid-1']),
      }
    );
    expect(knownInternal.filter((i) => i.severity === 'error')).toHaveLength(0);

    const unknown = validateOwnerRows(
      [{ ...baseRow, externalBranchId: 'branch-uuid-404' }],
      {
        knownBranchExternalIds: new Set(['BR-001']),
        knownBranchInternalIds: new Set(['branch-uuid-1']),
      }
    );
    expect(unknown.some((i) => i.code === 'unmapped_branch')).toBe(true);
  });

  it('buildBranchMapTemplateCsv has headers', () => {
    const csv = buildBranchMapTemplateCsv();
    expect(csv).toContain('external_branch_id');
    expect(csv).toContain('internal_branch_id');
    expect(csv).toContain('BR-001');
  });
});

describe('data-migration attachment meta (phase 42)', () => {
  it('buildAttachmentMetaKey joins patient id and filename', () => {
    expect(buildAttachmentMetaKey('PAT-1', 'a.jpg')).toBe('PAT-1::a.jpg');
  });

  it('parseAttachmentMetaCsv happy path with optional branch/staff columns', () => {
    const csv = [
      'external_patient_id,filename,external_branch_id,external_assigned_user_id',
      'PAT-1,photo.jpg,BR-001,VET-01',
      'PAT-2,scan.pdf,,',
    ].join('\n');
    const parsed = parseAttachmentMetaCsv(csv);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      externalPatientId: 'PAT-1',
      filename: 'photo.jpg',
      externalBranchId: 'BR-001',
      externalAssignedUserId: 'VET-01',
    });
    expect(parsed.rows[1]).toEqual({
      externalPatientId: 'PAT-2',
      filename: 'scan.pdf',
      externalBranchId: null,
      externalAssignedUserId: null,
    });
  });

  it('parseAttachmentMetaCsv with minimum headers returns null branch/staff when omitted', () => {
    const csv = ['external_patient_id,filename', 'PAT-1,a.jpg'].join('\n');
    const parsed = parseAttachmentMetaCsv(csv);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows[0]).toEqual({
      externalPatientId: 'PAT-1',
      filename: 'a.jpg',
      externalBranchId: null,
      externalAssignedUserId: null,
    });
  });

  it('parseAttachmentMetaCsv flags missing required headers', () => {
    const parsed = parseAttachmentMetaCsv('foo,bar\n1,2');
    expect(parsed.issues.some((i) => i.message.includes('Cabeceras requeridas'))).toBe(true);
    expect(parsed.rows).toHaveLength(0);
  });

  it('ATTACHMENT_META_IMPORT_FIELDS includes expected keys', () => {
    const keys = ATTACHMENT_META_IMPORT_FIELDS.map((f) => f.key);
    expect(keys).toContain('external_patient_id');
    expect(keys).toContain('filename');
    expect(keys).toContain('external_branch_id');
    expect(keys).toContain('external_assigned_user_id');
  });

  it('buildAttachmentMetaTemplateCsv contains all header keys', () => {
    const csv = buildAttachmentMetaTemplateCsv();
    expect(csv).toContain('external_patient_id');
    expect(csv).toContain('filename');
    expect(csv).toContain('external_branch_id');
    expect(csv).toContain('external_assigned_user_id');
  });

  it('buildAttachmentMetaExportCsv round-trips via parse (phase 50)', () => {
    const csv = buildAttachmentMetaExportCsv([
      {
        externalPatientId: 'pat-uuid-1',
        filename: 'rx.jpg',
        externalBranchId: 'branch-uuid',
        externalAssignedUserId: 'user-uuid',
      },
      {
        externalPatientId: 'pat-uuid-2',
        filename: 'lab.pdf',
        externalBranchId: null,
        externalAssignedUserId: null,
      },
    ]);
    const parsed = parseAttachmentMetaCsv(csv);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows).toEqual([
      {
        externalPatientId: 'pat-uuid-1',
        filename: 'rx.jpg',
        externalBranchId: 'branch-uuid',
        externalAssignedUserId: 'user-uuid',
      },
      {
        externalPatientId: 'pat-uuid-2',
        filename: 'lab.pdf',
        externalBranchId: null,
        externalAssignedUserId: null,
      },
    ]);
  });
});
