import type { Permission, Role } from '../constants';

export type { Role, Permission };

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'trial' | 'basic' | 'professional' | 'enterprise';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  is_active: boolean;
  is_main: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrganizationSettings {
  timezone?: string;
  currency?: string;
  phone?: string;
  email?: string;
  taxId?: string;
  /** Room / box presets for waiting-room call flow. */
  waitingRoomRooms?: string[];
  /** Clinic override for portal ETA (minutes per patient ahead). */
  waitingRoomMinutesPerPatient?: number | null;
  /** When false, tutors do not receive portal alerts on WR lifecycle (default true). */
  waitingRoomPortalAlertsEnabled?: boolean;
  /** When true, skip confirm and open WhatsApp compose on call/payment transitions. */
  waitingRoomWhatsAppAutoEnabled?: boolean;
  /** Play call/payment chimes on staff board and tablero when Realtime refreshes. */
  waitingRoomBoardSoundEnabled?: boolean;
  /** Default period for settlement calculate form. */
  settlementPeriodPreset?: 'month' | 'biweekly' | 'custom';
  /** Days used when settlementPeriodPreset is custom (also shown as hint for quincena setups). */
  settlementPeriodDays?: number | null;
}

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  active_branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BranchMember {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  role: Role;
  permissions: Permission[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  branch_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type SessionKind = 'staff' | 'portal';

export interface SessionContext {
  userId: string;
  organizationId: string;
  branchId: string | null;
  kind: SessionKind;
  role: Role | null;
  permissions: Permission[];
  profile: Profile;
  ownerId: string | null;
  /** Platform Superadmin (commercial entitlements). Never grant via clinic roles. */
  isPlatformAdmin: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TeamMemberRow {
  memberId: string;
  userId: string;
  fullName: string;
  email: string | null;
  branchId: string;
  branchName: string;
  role: Role;
  isActive: boolean;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  branch_id: string;
  email: string;
  role: Role;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface Owner {
  id: string;
  organization_id: string;
  branch_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_whatsapp: string | null;
  document_type: 'DNI' | 'CUIT' | 'Pasaporte' | 'Otro';
  document_number: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  notes: string | null;
  is_active: boolean;
  portal_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Patient {
  id: string;
  organization_id: string;
  branch_id: string | null;
  owner_id: string;
  name: string;
  species: 'Canino' | 'Felino' | 'Ave' | 'Roedor' | 'Reptil' | 'Equino' | 'Bovino' | 'Otro';
  breed: string | null;
  sex: 'Macho' | 'Hembra' | 'Desconocido';
  birth_date: string | null;
  color: string | null;
  microchip: string | null;
  is_neutered: boolean;
  is_deceased: boolean;
  deceased_at: string | null;
  notes: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientListRow extends Patient {
  owner_full_name: string;
}

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}
