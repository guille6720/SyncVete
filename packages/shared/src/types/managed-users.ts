import type { Role } from '../constants';
import type { AccountStatus } from '../constants/managed-users';

export interface ManagedUserRow {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  branchId: string | null;
  branchName: string | null;
  branchCount: number;
  status: AccountStatus;
  isCentralAdmin: boolean;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
  deniedPermissions: string[];
  statusReason: string | null;
  statusChangedAt: string | null;
  createdAt: string;
}

export interface ManagedInvitationRow {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: Role;
  branchId: string | null;
  branchName: string | null;
  status: 'pending' | 'expired';
  expiresAt: string;
  lastSentAt: string;
  sendCount: number;
  deniedPermissions: string[];
  createdAt: string;
}

export interface ManagedUsersOverview {
  /** null means no managed-user quota for a platform admin in their own clinic. */
  limit: number | null;
  seatsUsed: number;
  totalUsers: number;
  centralAdmins: number;
  activeManaged: number;
  suspended: number;
  disabled: number;
  pendingInvitations: number;
  activityToday: number;
}

export interface UserActivityRow {
  id: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  branchName: string | null;
  module: string;
  description: string;
  details: Record<string, unknown> | null;
}

export interface ManagedUserSession {
  createdAt: string;
  lastActiveAt: string;
  device: string;
}

export interface ManagedUserAccess {
  lastSignInAt: string | null;
  sessions: ManagedUserSession[];
}
