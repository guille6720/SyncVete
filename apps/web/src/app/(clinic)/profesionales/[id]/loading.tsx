import { RouteLoading } from '@/components/layout/route-loading';

/** Section-level only — clinic AppShell stays mounted from parent layout. */
export default function ProfesionalDetailLoading() {
  return <RouteLoading label="Cargando profesional" variant="detail" />;
}
