import { notFound } from 'next/navigation';
import { isClinicPathEntitled } from '@sincvete/shared';
import { getClinicEntitledHrefs } from '@/lib/entitlements';
import { getSessionContext } from '@/lib/session';
import { hasLinkedProfessionalProfile } from '@/actions/professionals';
import { isAcademiaEnabled } from '@/lib/tutorials/feature-flag';
import {
  CLINIC_SIDEBAR_NAV_ITEMS,
  filterClinicSidebarNavItems,
  groupClinicSidebarNavItems,
} from '@/components/layout/clinic-sidebar-nav-catalog';
import { ModuleHubView } from '@/components/layout/module-hub-view';
import {
  getModuleGroupById,
  getModuleGroupIdFromSlug,
} from '@/lib/ui-v2/module-hubs';

export default async function ModuleHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const groupId = getModuleGroupIdFromSlug(slug);
  if (!groupId) notFound();

  const group = getModuleGroupById(groupId);
  if (!group) notFound();

  const session = await getSessionContext();
  if (!session?.organizationId) notFound();

  const [entitledHrefs, showMySettlementsNav] = await Promise.all([
    getClinicEntitledHrefs(session.organizationId),
    hasLinkedProfessionalProfile(),
  ]);

  const visible = filterClinicSidebarNavItems(CLINIC_SIDEBAR_NAV_ITEMS, {
    entitledHrefs,
    showMySettlementsNav,
    academiaEnabled: isAcademiaEnabled(),
    isEntitled: (href) => isClinicPathEntitled(href, entitledHrefs),
  });

  const { groups } = groupClinicSidebarNavItems(visible);
  const entry = groups.find((row) => row.group.id === groupId);
  if (!entry || entry.items.length === 0) notFound();

  return <ModuleHubView group={entry.group} items={entry.items} />;
}
