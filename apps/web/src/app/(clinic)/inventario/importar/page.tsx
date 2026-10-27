import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FEATURES } from '@sincvete/shared';
import { canPermissionAndFeature } from '@/lib/permissions';
import { canManageInventory, canReadInventory } from '@/actions/inventory';
import { InventoryProductsImportPanel } from '@/components/inventory/inventory-products-import-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ImportarProductosPage() {
  const canRead = await canReadInventory();
  if (!canRead) redirect('/dashboard');

  const [canImport, canWrite] = await Promise.all([
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
    canManageInventory(),
  ]);

  if (!canImport) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Importar productos</CardTitle>
            <CardDescription>
              Necesitás el permiso <strong>Importar datos</strong> y el módulo de importación /
              exportación del plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/inventario">Volver a inventario</Link>
            </Button>
            {canWrite && (
              <Button variant="outline" asChild>
                <Link href="/configuracion?tab=import-export">Ir a Importar / Exportar</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <InventoryProductsImportPanel listHref="/inventario" />;
}
