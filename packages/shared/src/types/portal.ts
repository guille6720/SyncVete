import type { PatientSpecies, PatientSex } from '../constants/patients';
import type { AppointmentStatus, AppointmentType } from '../constants/appointments';
import type { ClinicalEntryType } from '../constants/clinical';
import type { InvoiceStatus } from '../constants/billing';
import type { VaccinationDueStatus } from '../constants/vaccinations';
import type { PortalAccessStatus } from '../constants/portal';

export interface PortalInvitePreview {
  valid: boolean;
  email: string;
  ownerName: string;
  clinicName: string;
  expiresAt: string;
}

export interface PortalInviteCreated {
  deliveryStatus?: 'sent' | 'not_sent';
  token: string;
  email: string;
  expiresAt: string;
}

export interface OwnerPortalStatus {
  status: PortalAccessStatus;
  email: string | null;
  expiresAt: string | null;
  portalUserId: string | null;
}

export interface PortalClinicInfo {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface PortalOwnerInfo {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface PortalPatientSummary {
  id: string;
  name: string;
  species: PatientSpecies;
  breed: string | null;
  sex: PatientSex;
  birthDate: string | null;
  isDeceased: boolean;
}

export interface PortalAppointmentRow {
  id: string;
  patientId: string | null;
  patientName: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  appointmentType: AppointmentType;
  title: string | null;
}

export interface PortalVaccineDueRow {
  id: string;
  patientId: string | null;
  patientName: string | null;
  vaccineName: string;
  administeredAt: string;
  nextDueAt: string | null;
  dueStatus: VaccinationDueStatus;
}

export interface PortalInvoiceRow {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  total: number;
  paidAmount: number;
  balance: number;
  patientName: string | null;
}

export interface PortalClinicalRow {
  id: string;
  patientId: string | null;
  patientName: string | null;
  entryDate: string;
  entryType: ClinicalEntryType;
  title: string | null;
  diagnosis: string | null;
  treatment: string | null;
  plan: string | null;
  weightKg: number | null;
}

export interface OwnerPortalHome {
  clinic: PortalClinicInfo;
  owner: PortalOwnerInfo;
  patients: PortalPatientSummary[];
  upcomingAppointments: PortalAppointmentRow[];
  vaccinesDue: PortalVaccineDueRow[];
  invoices: PortalInvoiceRow[];
  recentClinical: PortalClinicalRow[];
}

export interface OwnerPortalPatient {
  patient: PortalPatientSummary & {
    color: string | null;
    microchip: string | null;
    isNeutered: boolean;
  };
  vaccines: PortalVaccineDueRow[];
  appointments: PortalAppointmentRow[];
  clinical: PortalClinicalRow[];
}
