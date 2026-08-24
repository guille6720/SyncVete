import type { PatientSpecies } from '../constants/patients';
import type { AppointmentStatus } from '../constants/appointments';
import type { PaymentMethod } from '../constants/billing';

export interface ReportStatusCount {
  status: AppointmentStatus | string;
  count: number;
}

export interface ReportSpeciesCount {
  species: PatientSpecies;
  count: number;
}

export interface ReportPaymentMethodRow {
  method: PaymentMethod | string;
  count: number;
  amount: number;
}

export interface ReportDailyRow {
  day: string;
  appointments: number;
  consultations: number;
  payments_total: number;
}

export interface ReportOperations {
  newPatients: number;
  newOwners: number;
  appointmentsTotal: number;
  appointmentsCompleted: number;
  appointmentsCancelled: number;
  consultationsCompleted: number;
  hospitalizationsAdmitted: number;
  vaccinationsRecorded: number;
  surgeriesCompleted: number;
  labOrdersCompleted: number;
  appointmentsByStatus: ReportStatusCount[];
  consultationsBySpecies: ReportSpeciesCount[];
}

export interface ReportBilling {
  invoicesIssuedCount: number;
  invoicesIssuedTotal: number;
  invoicesVoidedCount: number;
  paymentsCount: number;
  paymentsTotal: number;
  openBalance: number;
  paymentsByMethod: ReportPaymentMethodRow[];
}

export interface ReportInventory {
  lowStockCount: number;
  movementsEntrada: number;
  movementsSalida: number;
  movementsAjuste: number;
  movementsDescarte: number;
}

export interface ReportWaitingRoomStatusCount {
  status: string;
  count: number;
}

export interface ReportWaitingRoomDailyRow {
  day: string;
  checkIns: number;
  completed: number;
}

export interface ReportWaitingRoom {
  checkIns: number;
  completed: number;
  removed: number;
  called: number;
  avgMinutesToCall: number | null;
  avgMinutesToComplete: number | null;
  byStatus: ReportWaitingRoomStatusCount[];
  daily: ReportWaitingRoomDailyRow[];
}

export interface ReportWaitingRoomEntry {
  entryId: string;
  checkedInAt: string;
  patientName: string;
  ownerFullName: string;
  assignedUserName: string | null;
  appointmentStartsAt: string;
  status: string;
  room: string | null;
  calledAt: string | null;
  completedAt: string | null;
  removed: boolean;
  minutesToCall: number | null;
  minutesDwell: number | null;
}

export interface ClinicReport {
  from: string;
  to: string;
  operations: ReportOperations | null;
  billing: ReportBilling | null;
  inventory: ReportInventory | null;
  waitingRoom: ReportWaitingRoom | null;
  daily: ReportDailyRow[];
}
