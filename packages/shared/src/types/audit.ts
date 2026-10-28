import type { AuditAction } from '../constants/audit';
import type { AuditLog } from './index';
import type { Role } from '../constants';

export interface AuditMemberOption {
  userId: string;
  fullName: string;
  roles: Role[];
  isActive: boolean;
}

export interface AuditLogListRow {
  id: string;
  organization_id: string;
  branch_id: string | null;
  user_id: string | null;
  action: AuditAction | string;
  entity_type: string;
  entity_id: string | null;
  user_full_name: string | null;
  branch_name: string | null;
  summary: string;
  created_at: string;
}

export interface AuditLogDetail extends AuditLog {
  user_full_name: string | null;
  branch_name: string | null;
  summary: string;
}

export interface AuditChangedField {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}
