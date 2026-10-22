import type {
  AppointmentListRow,
  AssignableStaffMember,
  WaitingRoomStatus,
} from '@sincvete/shared';

export interface AgendaShellData {
  canWrite: boolean;
  canReadWaitingRoom: boolean;
  canCheckInWaitingRoom: boolean;
  canStartConsultation: boolean;
  canBilling: boolean;
  canVaccination: boolean;
  staff: AssignableStaffMember[];
  branches: Array<{ id: string; name: string }>;
}

export interface AgendaDynamicData {
  appointments: AppointmentListRow[];
  waitingRoomByAppointment?: Record<string, WaitingRoomStatus>;
  waitingRoomWaitingCount?: number;
}

export type AgendaNavigatePatch = Partial<{
  selectedDate: string;
  weekStart: string;
  month: string;
  view: 'day' | 'week' | 'month';
  status: string;
  assignedUserId: string;
  branchId: string;
  query: string;
}>;
