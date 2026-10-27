import { redirect } from 'next/navigation';
import Link from 'next/link';
import { canReadInventory } from '@/actions/inventory';
import { canImportInventoryProducts } from '@/actions/inventory-import';
import { InventoryProductsImportPanel } from '@/components/inventory/inventory-products-import-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ImportarProductosPage() {
  const canRead = await canReadInventory();
  if (!canRead) redirect('/dashboard');

  const canImport = await canImportInventoryProducts();

  if (!canImport) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Importar productos</CardTitle>
            <CardDescription>
              Necesitás permiso para gestionar inventario o para importar datos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/inventario">Volver a inventario</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <InventoryProductsImportPanel listHref="/inventario" />;
}
