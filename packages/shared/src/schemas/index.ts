import { z } from 'zod';
import { ROLES } from '../constants';
import { NOTIFICATION_KINDS } from '../constants/notifications';

export const emailSchema = z
  .string()
  .min(1, 'El email es requerido')
  .email('Email inválido')
  .transform((v) => v.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña es demasiado larga');

export const slugSchema = z
  .string()
  .min(3, 'El slug debe tener al menos 3 caracteres')
  .max(50, 'El slug es demasiado largo')
  .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones');

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirmá la contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  organizationName: z
    .string()
    .min(2, 'El nombre de la clínica debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  organizationSlug: slugSchema,
  branchName: z
    .string()
    .min(2, 'El nombre de la sucursal debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo')
    .default('Sucursal Principal'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  branchId: z.string().uuid('Sucursal inválida'),
  role: z.enum(ROLES),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const organizationSettingsSchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  timezone: z.string().min(1, 'La zona horaria es requerida'),
  currency: z.enum(['ARS', 'USD', 'UYU', 'CLP', 'MXN']),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  taxId: z.string().max(30).optional().or(z.literal('')),
});

export const branchSchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  code: z
    .string()
    .min(2, 'El código debe tener al menos 2 caracteres')
    .max(20, 'El código es demasiado largo')
    .regex(/^[A-Z0-9_-]+$/, 'Solo mayúsculas, números, guiones y guiones bajos'),
  address: z.string().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  timezone: z.string().min(1, 'La zona horaria es requerida'),
  isActive: z.coerce.boolean().default(true),
});

export const updateMemberSchema = z.object({
  memberId: z.string().uuid('Miembro inválido'),
  role: z.enum(ROLES),
  isActive: z.coerce.boolean(),
});

export const setActiveBranchSchema = z.object({
  branchId: z.string().uuid('Sucursal inválida'),
});

export const branchListSchema = paginationSchema;

export const teamListSchema = paginationSchema;

export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
export type BranchInput = z.infer<typeof branchSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type SetActiveBranchInput = z.infer<typeof setActiveBranchSchema>;

const optionalEmail = z
  .string()
  .email('Email inválido')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v));

const optionalPhone = z
  .string()
  .max(30, 'Teléfono demasiado largo')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v));

export const ownerSchema = z.object({
  fullName: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(150, 'El nombre es demasiado largo')
    .transform((v) => v.trim()),
  email: optionalEmail,
  phone: optionalPhone,
  phoneWhatsapp: optionalPhone,
  documentType: z.enum(['DNI', 'CUIT', 'Pasaporte', 'Otro']).default('DNI'),
  documentNumber: z
    .string()
    .max(30)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  address: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  province: z.string().max(100).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  isActive: z.coerce.boolean().default(true),
});

export const ownerListSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
});

export type OwnerInput = z.infer<typeof ownerSchema>;
export type OwnerListInput = z.infer<typeof ownerListSchema>;

const optionalDate = z
  .string()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Fecha inválida');

export const patientSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(100, 'El nombre es demasiado largo')
    .transform((v) => v.trim()),
  ownerId: z.string().uuid('Propietario inválido'),
  species: z
    .enum(['Canino', 'Felino', 'Ave', 'Roedor', 'Reptil', 'Equino', 'Bovino', 'Otro'])
    .default('Canino'),
  breed: z
    .string()
    .max(100)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  sex: z.enum(['Macho', 'Hembra', 'Desconocido']).default('Desconocido'),
  birthDate: optionalDate,
  color: z
    .string()
    .max(100)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  microchip: z
    .string()
    .max(50)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  isNeutered: z.coerce.boolean().default(false),
  isDeceased: z.coerce.boolean().default(false),
  deceasedAt: optionalDate,
  notes: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  isActive: z.coerce.boolean().default(true),
});

export const patientListSchema = paginationSchema
  .omit({ pageSize: true })
  .extend({
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
    ownerId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    species: z.enum(['Canino', 'Felino', 'Ave', 'Roedor', 'Reptil', 'Equino', 'Bovino', 'Otro']).optional(),
  });

export type PatientInput = z.infer<typeof patientSchema>;
export type PatientListInput = z.infer<typeof patientListSchema>;

const optionalDateTime = z
  .string()
  .min(1, 'Fecha y hora requeridas')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora inválidas');

export const appointmentSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  assignedUserId: z
    .union([z.string().uuid('Profesional inválido'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  startsAt: optionalDateTime,
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  appointmentType: z
    .enum(['consulta', 'vacunacion', 'cirugia', 'control', 'emergencia', 'otro'])
    .default('consulta'),
  title: z
    .string()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  notes: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  status: z
    .enum(['programada', 'confirmada', 'en_curso', 'completada', 'cancelada', 'ausente'])
    .optional(),
  cancellationReason: z
    .string()
    .max(500)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
});

export const appointmentListSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().optional(),
  status: z
    .enum(['programada', 'confirmada', 'en_curso', 'completada', 'cancelada', 'ausente'])
    .optional(),
  assignedUserId: z.string().uuid().optional(),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type AppointmentListInput = z.infer<typeof appointmentListSchema>;

const optionalClinicalNumber = z
  .union([z.literal(''), z.coerce.number()])
  .transform((v) => (v === '' ? undefined : Number(v)));

export const clinicalEntrySchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  appointmentId: z
    .union([z.string().uuid('Cita inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  entryDate: z
    .string()
    .min(1, 'Fecha requerida')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida'),
  entryType: z
    .enum(['consulta', 'cirugia', 'internacion', 'laboratorio', 'vacunacion', 'nota', 'otro'])
    .default('consulta'),
  title: z
    .string()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  anamnesis: z
    .string()
    .max(5000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  physicalExam: z
    .string()
    .max(5000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  diagnosis: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  treatment: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  plan: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  weightKg: optionalClinicalNumber
    .optional()
    .refine((v) => v === undefined || (v >= 0 && v <= 9999), 'Peso inválido'),
  temperatureC: optionalClinicalNumber
    .optional()
    .refine((v) => v === undefined || (v >= 30 && v <= 45), 'Temperatura inválida'),
  notes: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export const clinicalEntryListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  entryType: z
    .enum(['consulta', 'cirugia', 'internacion', 'laboratorio', 'vacunacion', 'nota', 'otro'])
    .optional(),
});

export type ClinicalEntryInput = z.infer<typeof clinicalEntrySchema>;
export type ClinicalEntryListInput = z.infer<typeof clinicalEntryListSchema>;

export const consultationSoapSchema = z.object({
  title: z
    .string()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  anamnesis: z
    .string()
    .max(5000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  physicalExam: z
    .string()
    .max(5000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  diagnosis: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  treatment: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  plan: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  weightKg: optionalClinicalNumber
    .optional()
    .refine((v) => v === undefined || (v >= 0 && v <= 9999), 'Peso inválido'),
  temperatureC: optionalClinicalNumber
    .optional()
    .refine((v) => v === undefined || (v >= 30 && v <= 45), 'Temperatura inválida'),
  notes: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
});

export const consultationStartSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  appointmentId: z
    .union([z.string().uuid('Cita inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  title: z
    .string()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
});

export const consultationListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['en_espera', 'en_curso', 'completada', 'cancelada']).optional(),
});

export type ConsultationSoapInput = z.infer<typeof consultationSoapSchema>;
export type ConsultationStartInput = z.infer<typeof consultationStartSchema>;
export type ConsultationListInput = z.infer<typeof consultationListSchema>;

const optionalClinicalText = z
  .string()
  .max(5000)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v));

export const hospitalizationAdmitSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  consultationId: z
    .union([z.string().uuid('Consulta inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  status: z.enum(['internado', 'observacion']).default('internado'),
  cage: z
    .string()
    .max(50)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  reason: z.string().min(2, 'Indicá el motivo').max(500),
  diagnosis: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  treatmentPlan: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  notes: optionalClinicalText,
});

export const hospitalizationUpdateSchema = z.object({
  status: z.enum(['internado', 'observacion']),
  cage: z
    .string()
    .max(50)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  reason: z.string().min(2, 'Indicá el motivo').max(500),
  diagnosis: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  treatmentPlan: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  notes: optionalClinicalText,
});

export const hospitalizationNoteSchema = z.object({
  noteType: z.enum(['evolucion', 'tratamiento', 'vitals', 'otro']),
  content: z.string().min(1, 'Escribí la evolución').max(5000),
  weightKg: optionalClinicalNumber
    .optional()
    .refine((v) => v === undefined || (v >= 0 && v <= 9999), 'Peso inválido'),
  temperatureC: optionalClinicalNumber
    .optional()
    .refine((v) => v === undefined || (v >= 30 && v <= 45), 'Temperatura inválida'),
});

export const hospitalizationDischargeSchema = z.object({
  outcome: z.enum(['alta', 'fallecido']),
  summary: optionalClinicalText,
});

export const hospitalizationListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['internado', 'observacion', 'alta', 'fallecido']).optional(),
});

export type HospitalizationAdmitInput = z.infer<typeof hospitalizationAdmitSchema>;
export type HospitalizationUpdateInput = z.infer<typeof hospitalizationUpdateSchema>;
export type HospitalizationNoteInput = z.infer<typeof hospitalizationNoteSchema>;
export type HospitalizationDischargeInput = z.infer<typeof hospitalizationDischargeSchema>;
export type HospitalizationListInput = z.infer<typeof hospitalizationListSchema>;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

const optionalIsoDate = z
  .union([isoDateSchema, z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v));

const optionalShortText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v));

export const vaccinationRecordSchema = z
  .object({
    patientId: z.string().uuid('Paciente inválido'),
    ownerId: z.string().uuid('Propietario inválido'),
    branchId: z
      .union([z.string().uuid('Sucursal inválida'), z.literal('')])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    consultationId: z
      .union([z.string().uuid('Consulta inválida'), z.literal('')])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    vaccineName: z.string().min(2, 'Indicá la vacuna').max(120),
    manufacturer: optionalShortText(120),
    lotNumber: optionalShortText(80),
    administeredAt: isoDateSchema,
    nextDueAt: optionalIsoDate,
    route: z
      .union([z.enum(['sc', 'im', 'in', 'oral', 'otro']), z.literal('')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? undefined : v)),
    notes: optionalClinicalText,
  })
  .refine(
    (data) => !data.nextDueAt || data.nextDueAt >= data.administeredAt,
    {
      message: 'El próximo refuerzo no puede ser anterior a la aplicación',
      path: ['nextDueAt'],
    }
  );

export const vaccinationUpdateSchema = z
  .object({
    administeredAt: isoDateSchema.optional(),
    manufacturer: optionalShortText(120),
    lotNumber: optionalShortText(80),
    nextDueAt: optionalIsoDate,
    route: z
      .union([z.enum(['sc', 'im', 'in', 'oral', 'otro']), z.literal('')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? undefined : v)),
    notes: optionalClinicalText,
  })
  .refine(
    (data) =>
      !data.nextDueAt || !data.administeredAt || data.nextDueAt >= data.administeredAt,
    {
      message: 'El próximo refuerzo no puede ser anterior a la aplicación',
      path: ['nextDueAt'],
    }
  );

export const vaccinationListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
});

export type VaccinationRecordInput = z.infer<typeof vaccinationRecordSchema>;
export type VaccinationUpdateInput = z.infer<typeof vaccinationUpdateSchema>;
export type VaccinationListInput = z.infer<typeof vaccinationListSchema>;

export const surgeryScheduleSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  consultationId: z
    .union([z.string().uuid('Consulta inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  appointmentId: z
    .union([z.string().uuid('Cita inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  procedureName: z.string().min(2, 'Indicá el procedimiento').max(160),
  scheduledAt: optionalDateTime,
  diagnosis: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  anesthesia: z
    .union([z.enum(['general', 'sedacion', 'local', 'epidural', 'otro']), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  asa: z
    .union([z.enum(['I', 'II', 'III', 'IV', 'V']), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  preopNotes: optionalClinicalText,
  notes: optionalClinicalText,
});

export const surgeryWorksheetSchema = z.object({
  diagnosis: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  anesthesia: z
    .union([z.enum(['general', 'sedacion', 'local', 'epidural', 'otro']), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  asa: z
    .union([z.enum(['I', 'II', 'III', 'IV', 'V']), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  preopNotes: optionalClinicalText,
  intraopNotes: optionalClinicalText,
  postopNotes: optionalClinicalText,
  complications: optionalClinicalText,
  notes: optionalClinicalText,
});

export const surgeryListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['programada', 'en_curso', 'recuperacion', 'completada', 'cancelada']).optional(),
});

export type SurgeryScheduleInput = z.infer<typeof surgeryScheduleSchema>;
export type SurgeryWorksheetInput = z.infer<typeof surgeryWorksheetSchema>;
export type SurgeryListInput = z.infer<typeof surgeryListSchema>;

const labTestsFromForm = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string().min(1).max(120)).min(1, 'Agregá al menos un estudio'));

export const labOrderCreateSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  consultationId: z
    .union([z.string().uuid('Consulta inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  title: z.string().min(2, 'Indicá el estudio').max(160),
  priority: z.enum(['rutina', 'urgente']).default('rutina'),
  sampleType: z
    .union([
      z.enum(['sangre', 'orina', 'materia_fecal', 'hisopado', 'otro']),
      z.literal(''),
    ])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  notes: optionalClinicalText,
  tests: labTestsFromForm,
});

export const labResultsSchema = z.object({
  interpretation: optionalClinicalText,
  notes: optionalClinicalText,
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        resultValue: optionalShortText(200),
        unit: optionalShortText(40),
        referenceRange: optionalShortText(80),
        flag: z.enum(['pendiente', 'normal', 'alto', 'bajo', 'anormal']).default('pendiente'),
        notes: optionalShortText(500),
      })
    )
    .min(1),
});

export const labOrderListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['solicitada', 'en_proceso', 'completada', 'cancelada']).optional(),
});

export type LabOrderCreateInput = z.infer<typeof labOrderCreateSchema>;
export type LabResultsInput = z.infer<typeof labResultsSchema>;
export type LabOrderListInput = z.infer<typeof labOrderListSchema>;

const optionalNonNegNumber = z
  .union([z.literal(''), z.coerce.number()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v))
  .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), 'Número inválido');

export const inventoryProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Indicá el nombre')
    .max(160)
    .transform((v) => v.trim()),
  sku: optionalShortText(60),
  category: z
    .enum(['medicamento', 'vacuna', 'insumo', 'alimento', 'laboratorio', 'otro'])
    .default('medicamento'),
  unit: z
    .enum(['unidad', 'caja', 'frasco', 'ml', 'mg', 'g', 'kg', 'dosis', 'otro'])
    .default('unidad'),
  quantity: z.coerce.number().min(0, 'Stock inválido').default(0),
  minQuantity: z.coerce.number().min(0, 'Mínimo inválido').default(0),
  unitCost: optionalNonNegNumber,
  unitPrice: optionalNonNegNumber,
  manufacturer: optionalShortText(120),
  notes: optionalClinicalText,
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  isActive: z.coerce.boolean().default(true),
});

export const inventoryProductUpdateSchema = inventoryProductSchema.omit({ quantity: true });

export const inventoryMovementSchema = z.object({
  movementType: z.enum(['entrada', 'salida', 'ajuste', 'descarte']),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  reason: optionalClinicalText,
  lotNumber: optionalShortText(80),
  expiresAt: optionalIsoDate,
});

export const inventoryProductListSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
  category: z
    .enum(['medicamento', 'vacuna', 'insumo', 'alimento', 'laboratorio', 'otro'])
    .optional(),
  lowStock: z.coerce.boolean().optional(),
  activeOnly: z.coerce.boolean().optional(),
});

export type InventoryProductInput = z.infer<typeof inventoryProductSchema>;
export type InventoryProductUpdateInput = z.infer<typeof inventoryProductUpdateSchema>;
export type InventoryMovementInput = z.infer<typeof inventoryMovementSchema>;
export type InventoryProductListInput = z.infer<typeof inventoryProductListSchema>;

const invoiceItemSchema = z.object({
  description: z
    .string()
    .min(1, 'Indicá la descripción')
    .max(200)
    .transform((v) => v.trim()),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  unitPrice: z.coerce.number().min(0, 'Precio inválido'),
  productId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
});

export const invoiceCreateSchema = z.object({
  ownerId: z.string().uuid('Propietario inválido'),
  patientId: z
    .union([z.string().uuid('Paciente inválido'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  consultationId: z
    .union([z.string().uuid('Consulta inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  dueAt: optionalIsoDate,
  notes: optionalClinicalText,
  items: z.array(invoiceItemSchema).min(1, 'Agregá al menos un ítem'),
});

export const invoiceUpdateSchema = z.object({
  dueAt: optionalIsoDate,
  notes: optionalClinicalText,
  items: z.array(invoiceItemSchema).min(1, 'Agregá al menos un ítem'),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive('El importe debe ser mayor a 0'),
  method: z.enum(['efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro']).default('efectivo'),
  reference: optionalShortText(80),
  notes: optionalClinicalText,
});

export const invoiceListSchema = paginationSchema.extend({
  ownerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['borrador', 'emitida', 'pagada', 'anulada']).optional(),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type InvoiceListInput = z.infer<typeof invoiceListSchema>;

export const reportRangeSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    branchId: z.string().uuid().optional(),
  })
  .refine((value) => value.from <= value.to, {
    message: 'La fecha desde no puede ser posterior a hasta',
    path: ['from'],
  })
  .refine((value) => {
    const [fy, fm, fd] = value.from.split('-').map(Number);
    const [ty, tm, td] = value.to.split('-').map(Number);
    const days = Math.round(
      (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
    );
    return days <= 92;
  }, {
    message: 'El rango no puede superar 92 días',
    path: ['to'],
  });

export type ReportRangeInput = z.infer<typeof reportRangeSchema>;

export const portalActivateSchema = z.object({
  token: z.string().min(16, 'Invitación inválida').max(128),
  fullName: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo')
    .transform((v) => v.trim()),
  password: passwordSchema,
});

export type PortalActivateInput = z.infer<typeof portalActivateSchema>;

export const whatsappComposeSchema = z.object({
  ownerId: z.string().uuid('Propietario inválido'),
  patientId: z.string().uuid().optional(),
  templateKey: z.enum([
    'recordatorio_cita',
    'confirmar_cita',
    'vacuna_vencida',
    'factura_saldo',
    'lab_listo',
    'portal_invite',
    'mensaje_libre',
  ]),
  body: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, 'El mensaje es requerido').max(2000, 'El mensaje es demasiado largo')),
  phone: z.string().min(6, 'El teléfono es requerido').max(30),
  relatedType: z
    .enum(['none', 'appointment', 'invoice', 'lab_order', 'vaccination', 'portal'])
    .optional(),
  relatedId: z.string().uuid().optional(),
});

export const whatsappListSchema = paginationSchema.extend({
  ownerId: z.string().uuid().optional(),
});

export type WhatsAppComposeInput = z.infer<typeof whatsappComposeSchema>;
export type WhatsAppListInput = z.infer<typeof whatsappListSchema>;

export const reminderActionSchema = z.object({
  reminderType: z.enum(['appointment', 'vaccination', 'invoice']),
  relatedId: z.string().uuid('Recordatorio inválido'),
});

export type ReminderActionInput = z.infer<typeof reminderActionSchema>;

export const clinicalAiGenerateSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  kind: z.enum(['patient_summary', 'soap_assist', 'owner_instructions']),
  notes: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  consultationId: z.string().uuid().optional(),
  clinicalEntryId: z.string().uuid().optional(),
});

export const clinicalAiListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  kind: z.enum(['patient_summary', 'soap_assist', 'owner_instructions']).optional(),
});

export const clinicalAiApplySoapSchema = z.object({
  consultationId: z.string().uuid('Consulta inválida'),
  diagnosis: z.string().min(1).max(2000),
  treatment: z.string().min(1).max(2000),
  plan: z.string().min(1).max(2000),
});

export type ClinicalAiGenerateInput = z.infer<typeof clinicalAiGenerateSchema>;
export type ClinicalAiListInput = z.infer<typeof clinicalAiListSchema>;
export type ClinicalAiApplySoapInput = z.infer<typeof clinicalAiApplySoapSchema>;

const prescriptionItemSchema = z.object({
  medicationName: z
    .string()
    .min(1, 'Indicá el medicamento')
    .max(160)
    .transform((v) => v.trim()),
  dose: z
    .string()
    .min(1, 'Indicá la dosis')
    .max(80)
    .transform((v) => v.trim()),
  frequency: z
    .string()
    .min(1, 'Indicá la frecuencia')
    .max(80)
    .transform((v) => v.trim()),
  duration: optionalShortText(80),
  route: z
    .enum(['oral', 'sc', 'im', 'topico', 'oftalmico', 'otico', 'otro'])
    .default('oral'),
  quantity: z.coerce.number().min(0, 'Cantidad inválida').default(0),
  productId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  instructions: optionalShortText(1000),
});

export const prescriptionCreateSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  consultationId: z
    .union([z.string().uuid('Consulta inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  notes: optionalClinicalText,
  items: z.array(prescriptionItemSchema).min(1, 'Agregá al menos un medicamento'),
});

export const prescriptionListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['activa', 'dispensada', 'anulada']).optional(),
});

export type PrescriptionCreateInput = z.infer<typeof prescriptionCreateSchema>;
export type PrescriptionListInput = z.infer<typeof prescriptionListSchema>;

export const cashSessionOpenSchema = z.object({
  branchId: z.string().uuid('Sucursal inválida'),
  openingAmount: z.coerce.number().min(0, 'El fondo inicial no puede ser negativo').default(0),
  notes: optionalClinicalText,
});

export const cashSessionCloseSchema = z.object({
  countedCash: z.coerce.number().min(0, 'El efectivo contado no puede ser negativo'),
  notes: optionalClinicalText,
});

export const cashMovementSchema = z.object({
  kind: z.enum(['ingreso', 'egreso', 'retiro']),
  amount: z.coerce.number().positive('El importe debe ser mayor a 0'),
  method: z
    .enum(['efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro'])
    .default('efectivo'),
  notes: optionalShortText(1000),
});

export const cashSessionListSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
  status: z.enum(['abierta', 'cerrada']).optional(),
});

export type CashSessionOpenInput = z.infer<typeof cashSessionOpenSchema>;
export type CashSessionCloseInput = z.infer<typeof cashSessionCloseSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
export type CashSessionListInput = z.infer<typeof cashSessionListSchema>;

export const clinicalImageCreateSchema = z.object({
  patientId: z.string().uuid('Paciente inválido'),
  ownerId: z.string().uuid('Propietario inválido'),
  branchId: z
    .union([z.string().uuid('Sucursal inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  consultationId: z
    .union([z.string().uuid('Consulta inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  clinicalEntryId: z
    .union([z.string().uuid('Entrada inválida'), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  kind: z
    .enum(['foto', 'radiografia', 'ecografia', 'laboratorio', 'documento', 'otro'])
    .default('foto'),
  title: optionalShortText(160),
  notes: optionalClinicalText,
  takenAt: optionalIsoDate,
});

export const clinicalImageListSchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  kind: z
    .enum(['foto', 'radiografia', 'ecografia', 'laboratorio', 'documento', 'otro'])
    .optional(),
});

export type ClinicalImageCreateInput = z.infer<typeof clinicalImageCreateSchema>;
export type ClinicalImageListInput = z.infer<typeof clinicalImageListSchema>;

export const notificationListSchema = paginationSchema.extend({
  kind: z.enum(NOTIFICATION_KINDS).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export const notificationIdSchema = z.object({
  id: z.string().uuid('Notificación inválida'),
});

export type NotificationListInput = z.infer<typeof notificationListSchema>;
export type NotificationIdInput = z.infer<typeof notificationIdSchema>;

export const auditLogListSchema = paginationSchema
  .extend({
    action: z.enum(['create', 'update', 'delete']).optional(),
    entityType: z.string().max(60).optional(),
    from: optionalIsoDate,
    to: optionalIsoDate,
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    { message: 'La fecha desde no puede ser posterior a hasta', path: ['from'] }
  )
  .refine(
    (value) => {
      if (!value.from || !value.to) return true;
      const [fy, fm, fd] = value.from.split('-').map(Number);
      const [ty, tm, td] = value.to.split('-').map(Number);
      const days = Math.round(
        (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
      );
      return days <= 92;
    },
    { message: 'El rango no puede superar 92 días', path: ['to'] }
  );

export type AuditLogListInput = z.infer<typeof auditLogListSchema>;

export const waitingRoomListSchema = z.object({
  branchId: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional(),
});

export const waitingRoomCheckInSchema = z.object({
  appointmentId: z.string().uuid('Cita inválida'),
});

export const waitingRoomUpdateStatusSchema = z.object({
  entryId: z.string().uuid('Entrada inválida'),
  newStatus: z.enum([
    'waiting',
    'called',
    'in_consultation',
    'payment_pending',
    'completed',
  ]),
  room: z
    .string()
    .max(80)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
});

export const waitingRoomReorderSchema = z
  .object({
    entryId: z.string().uuid('Entrada inválida'),
    queuePosition: z.coerce.number().int().min(1).optional(),
    priority: z.coerce.number().int().optional(),
  })
  .refine(
    (value) => value.queuePosition !== undefined || value.priority !== undefined,
    { message: 'Debés indicar queue_position y/o priority', path: ['queuePosition'] }
  );

export type WaitingRoomListInput = z.infer<typeof waitingRoomListSchema>;
export type WaitingRoomCheckInInput = z.infer<typeof waitingRoomCheckInSchema>;
export type WaitingRoomUpdateStatusInput = z.infer<typeof waitingRoomUpdateStatusSchema>;
export type WaitingRoomReorderInput = z.infer<typeof waitingRoomReorderSchema>;
