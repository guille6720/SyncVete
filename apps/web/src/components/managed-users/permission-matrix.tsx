'use client';

import {
  IMPLIED_PERMISSIONS,
  PERMISSION_MATRIX,
  getPermissionsForRole,
  type Permission,
  type Role,
} from '@sincvete/shared';

interface PermissionMatrixProps {
  role: Role;
  denied: string[];
  onChange: (denied: string[]) => void;
  /** Permissions the current admin holds; they cannot hand out anything else. */
  actorPermissions: Permission[];
  readOnly?: boolean;
}

export function PermissionMatrix({
  role,
  denied,
  onChange,
  actorPermissions,
  readOnly = false,
}: PermissionMatrixProps) {
  const rolePermissions = new Set(getPermissionsForRole(role));
  const deniedSet = new Set(denied);
  const actorSet = new Set(actorPermissions);

  const isGranted = (permission: Permission): boolean => {
    if (!rolePermissions.has(permission) || deniedSet.has(permission)) return false;
    const parent = IMPLIED_PERMISSIONS[permission];
    return parent ? !deniedSet.has(parent) : true;
  };

  const toggle = (permission: Permission, checked: boolean) => {
    const next = new Set(deniedSet);
    if (checked) next.delete(permission);
    else next.add(permission);
    onChange([...next].sort());
  };

  return (
    <div className="space-y-3">
      {PERMISSION_MATRIX.map((module) => (
        <fieldset key={module.id} className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{module.label}</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
            {module.actions.map((action) => {
              const inRole = rolePermissions.has(action.permission);
              const parent = IMPLIED_PERMISSIONS[action.permission];
              const parentBlocked = parent ? deniedSet.has(parent) : false;
              const canGrant = actorSet.has(action.permission);
              const granted = isGranted(action.permission);
              const disabled =
                readOnly || !inRole || parentBlocked || (!granted && !canGrant);
              const id = `perm-${module.id}-${action.permission}`;
              return (
                <label
                  key={action.permission}
                  htmlFor={id}
                  className={`flex items-center gap-2 text-sm ${disabled ? 'text-muted-foreground' : ''}`}
                  title={
                    !inRole
                      ? 'No incluido en el rol'
                      : !granted && !canGrant
                        ? 'No podés otorgar un permiso que vos no tenés'
                        : undefined
                  }
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={granted}
                    disabled={disabled}
                    onChange={(event) => toggle(action.permission, event.target.checked)}
                  />
                  {action.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-muted-foreground">
        Los permisos grisados no están incluidos en el rol. Quitar un permiso solo restringe: nunca
        se otorga más de lo que permite el rol.
      </p>
    </div>
  );
}
