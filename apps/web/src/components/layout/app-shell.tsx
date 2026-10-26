import { isUiV2Enabled } from '@/lib/ui-v2/feature-flag';
import { AppShellLegacy } from '@/components/layout/app-shell-legacy';
import { AppShellV2, type AppShellV2Props } from '@/components/layout/app-shell-v2';

export type AppShellProps = AppShellV2Props;

/**
 * Clinic application shell.
 *
 * IMPORTANT: this file is a Server Component on purpose.
 * `NEXT_PUBLIC_UI_V2_ENABLED` must be read on the server at request time.
 * When this selector lived in a Client Component, Next inlined the flag at
 * build time as unset/false → legacy accordion shell while the server-rendered
 * dashboard correctly showed UI V2.
 */
export function AppShell(props: AppShellProps) {
  if (isUiV2Enabled()) {
    return <AppShellV2 {...props} />;
  }
  const { organizationName, organizationLogoUrl, ...legacyProps } = props;
  void organizationName;
  void organizationLogoUrl;
  return <AppShellLegacy {...legacyProps} />;
}
