'use client';

import { isUiV2Enabled } from '@/lib/ui-v2/feature-flag';
import { AppShellLegacy } from '@/components/layout/app-shell-legacy';
import { AppShellV2, type AppShellV2Props } from '@/components/layout/app-shell-v2';

export type AppShellProps = AppShellV2Props;

/**
 * Clinic application shell.
 * UI V2 (collapsible sidebar + refreshed top bar) when NEXT_PUBLIC_UI_V2_ENABLED=true.
 * Otherwise preserves the legacy shell as fallback.
 */
export function AppShell(props: AppShellProps) {
  if (isUiV2Enabled()) {
    return <AppShellV2 {...props} />;
  }
  const { organizationName, ...legacyProps } = props;
  void organizationName;
  return <AppShellLegacy {...legacyProps} />;
}
