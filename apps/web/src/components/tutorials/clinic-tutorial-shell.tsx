'use client';

import { TutorialProvider } from '@/components/tutorials/tutorial-provider';

interface ClinicTutorialShellProps {
  children: React.ReactNode;
  enabled: boolean;
  organizationId: string;
  userId: string;
  permissions: string[];
}

export function ClinicTutorialShell({
  children,
  enabled,
  organizationId,
  userId,
  permissions,
}: ClinicTutorialShellProps) {
  return (
    <TutorialProvider
      enabled={enabled}
      organizationId={organizationId}
      userId={userId}
      permissions={permissions}
    >
      {children}
    </TutorialProvider>
  );
}
