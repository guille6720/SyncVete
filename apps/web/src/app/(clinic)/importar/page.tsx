import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, Package, PawPrint, Upload, Users } from 'lucide-react';
import { getSessionContext } from '@/actions/auth';
import { canImportInventoryProducts } from '@/actions/inventory-import';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ImportarDatosPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const [canClinicImport, canProducts] = await Promise.all([
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
    canImportInventoryProducts(),
  ]);

  if (!canClinicImport && !canProducts) redirect('/dashboard');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar datos</h1>
        <p className="text-muted-foreground">
          Elegí qué vas a subir. Son flujos distintos: clientes/historias vs productos.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Tutores, pacientes e historias
            </CardTitle>
            <CardDescription>
              CSV o Excel. Orden recomendado: tutores → pacientes → historia clínica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!canClinicImport ? (
              <p className="text-sm text-muted-foreground">
                Necesitás permiso <strong>Importar datos</strong> y el módulo de importación del
                plan.
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button asChild>
                  <Link href="/configuracion?tab=import-export&import=owners">
                    <Upload className="mr-2 h-4 w-4" />
                    Importar tutores
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/configuracion?tab=import-export&import=patients">
                    <PawPrint className="mr-2 h-4 w-4" />
                    Importar pacientes
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/configuracion?tab=import-export&import=clinical_entries">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Importar historias
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Productos / stock
            </CardTitle>
            <CardDescription>
              Catálogo de inventario. CSV, Excel o PDF con tabla de texto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canProducts ? (
              <p className="text-sm text-muted-foreground">
                Necesitás permiso de inventario o de importar datos.
              </p>
            ) : (
              <Button asChild>
                <Link href="/inventario/importar">
                  <Upload className="mr-2 h-4 w-4" />
                  Importar productos
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
