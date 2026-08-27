import { RouteLoading } from '@/components/layout/route-loading';

/**
 * Only shown when navigating into /agenda from another module.
 * Day/week/month/filter changes are client-driven and must not blank this shell.
 */
export default function AgendaLoading() {
  return <RouteLoading label="Cargando agenda" variant="board" />;
}
