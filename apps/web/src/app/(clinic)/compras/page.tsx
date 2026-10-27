import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Package, Plus, ShoppingCart, Upload } from 'lucide-react';
import {
  canManagePurchases,
  canReadPurchases,
  listInventoryPurchases,
} from '@/actions/purchases';
import { listCatalogProducts, listPurchaseParties } from '@/actions/purchase-catalog';
import { listLowStock } from '@/actions/inventory';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { InventoryLowStockBoard } from '@/components/inventory/inventory-low-stock-board';
import { PurchasesList } from '@/components/purchases/purchases-list';
import {
  CatalogProductList,
  CatalogSearch,
  ComprasSectionNav,
  PartyList,
  ProductCategoryNav,
  SalePriceList,
} from '@/components/purchases/compras-catalog';
import { Button } from '@/components/ui/button';
import { canPermissionAndFeature } from '@/lib/permissions';
import { buildListQuery } from '@/lib/list-return';
import {
  COMPRAS_SECTIONS,
  FEATURES,
  INVENTORY_PRODUCT_CATEGORIES,
  INVENTORY_PURCHASE_STATUSES,
  type ComprasSection,
  type InventoryProductCategory,
  type InventoryPurchaseStatus,
} from '@sincvete/shared';

interface ComprasPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    seccion?: string;
    buscar?: string;
    categoria?: string;
    pagina?: string;
    paginaPartes?: string;
  }>;
}

export default async function ComprasPage({ searchParams }: ComprasPageProps) {
  const canRead = await canReadPurchases();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const section: ComprasSection = COMPRAS_SECTIONS.includes(params.seccion as ComprasSection)
    ? (params.seccion as ComprasSection)
    : 'compras';
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const buscar = params.buscar?.trim() ?? '';
  const productPage = Math.max(1, Number(params.pagina) || 1);
  const partyPage = Math.max(1, Number(params.paginaPartes) || 1);
  const statusParam = params.status?.trim() ?? '';
  const status = INVENTORY_PURCHASE_STATUSES.includes(statusParam as InventoryPurchaseStatus)
    ? (statusParam as InventoryPurchaseStatus)
    : undefined;
  const categoryParam = params.categoria?.trim() ?? '';
  const category = INVENTORY_PRODUCT_CATEGORIES.includes(categoryParam as InventoryProductCategory)
    && categoryParam !== 'vacuna'
    ? (categoryParam as InventoryProductCategory)
    : undefined;

  const [canWrite, canImport, session, branches] = await Promise.all([
    canManagePurchases(),
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
    getSessionContext(),
    getUserBranches(),
  ]);

  const branchName = branches.find((branch) => branch.id === session?.branchId)?.name ?? null;
  const descriptions: Record<ComprasSection, string> = {
    compras: 'Adquirí productos y actualizá el stock',
    proveedores: 'Proveedores de productos',
    prestadores: 'Prestadores de servicios',
    productos: 'Productos separados por categoría',
    vacunas: 'Vacunas y sus proveedores',
    precios: 'Valores de venta calculados con el costo y el % de ganancia',
  };

  const showParties = section === 'proveedores' || section === 'prestadores' || section === 'vacunas';
  const showProducts = section === 'productos' || section === 'vacunas' || section === 'precios';
  const [purchases, lowStockItems, parties, products] = await Promise.all([
    section === 'compras'
      ? listInventoryPurchases({
          page,
          pageSize: 25,
          search: search || undefined,
          status,
        })
      : Promise.resolve(null),
    section === 'compras' ? listLowStock() : Promise.resolve([]),
    showParties
      ? listPurchaseParties({
          page: partyPage,
          pageSize: 25,
          search: buscar || undefined,
          kind: section === 'prestadores' ? 'prestador' : 'proveedor',
          scope: section === 'vacunas' ? 'vacunas' : 'general',
        })
      : Promise.resolve(null),
    showProducts
      ? listCatalogProducts({
          page: productPage,
          pageSize: 25,
          search: buscar || undefined,
        category: section === 'vacunas' ? 'vacuna' : section === 'productos' ? category : undefined,
        excludeCategory: section === 'productos' && !category ? 'vacuna' : undefined,
        pricedOnly: section === 'precios',
        })
      : Promise.resolve(null),
  ]);

  const listQuery = buildListQuery({
    page: page > 1 ? String(page) : undefined,
    search: search || undefined,
    status: status || undefined,
  });
  const productHref = category
    ? `/compras/productos/nuevo?categoria=${category}`
    : '/compras/productos/nuevo';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
          <p className="text-muted-foreground">
            {descriptions[section]}
            {branchName ? ` · ${branchName}` : ''}
          </p>
        </div>
        {section === 'compras' ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/inventario">
                <Package className="mr-2 h-4 w-4" />
                Inventario
              </Link>
            </Button>
            {(canImport || canWrite) && (
              <Button variant="outline" asChild>
                <Link href="/inventario/importar">
                  <Upload className="mr-2 h-4 w-4" />
                  Importar productos
                </Link>
              </Button>
            )}
            {canWrite && (
              <Button asChild>
                <Link href="/compras/nueva">
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva compra
                </Link>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <ComprasSectionNav active={section} />

      {section === 'compras' && purchases ? (
        <>
          <div className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Al recibir una compra se genera una entrada de stock por cada producto. El stock bajo
                aparece abajo para reponer rápido.
              </p>
            </div>
          </div>
          <InventoryLowStockBoard
            items={lowStockItems}
            canWrite={canWrite}
            listQuery={listQuery}
            createHref="/compras/nueva"
            createLabel="Nueva compra"
          />
          <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando compras…</div>}>
            <PurchasesList
              data={purchases}
              initialSearch={search}
              initialStatus={status ?? ''}
              branchName={branchName}
            />
          </Suspense>
        </>
      ) : null}

      {section === 'proveedores' && parties ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Suspense fallback={null}>
              <CatalogSearch initialSearch={buscar} placeholder="Buscar proveedor, teléfono o email..." />
            </Suspense>
            {canWrite && (
              <Button asChild>
                <Link href="/compras/partes/nueva?tipo=proveedor">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar proveedor
                </Link>
              </Button>
            )}
          </div>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando proveedores…</div>}>
            <PartyList data={parties} emptyLabel="No hay proveedores con esa búsqueda." />
          </Suspense>
        </section>
      ) : null}

      {section === 'prestadores' && parties ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Suspense fallback={null}>
              <CatalogSearch initialSearch={buscar} placeholder="Buscar prestador, teléfono o email..." />
            </Suspense>
            {canWrite && (
              <Button asChild>
                <Link href="/compras/partes/nueva?tipo=prestador">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar prestador
                </Link>
              </Button>
            )}
          </div>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando prestadores…</div>}>
            <PartyList data={parties} emptyLabel="No hay prestadores con esa búsqueda." />
          </Suspense>
        </section>
      ) : null}

      {section === 'productos' && products ? (
        <section className="space-y-4">
          <ProductCategoryNav active={category ?? ''} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Suspense fallback={null}>
              <CatalogSearch initialSearch={buscar} placeholder="Buscar producto, SKU o fabricante..." />
            </Suspense>
            {canWrite && (
              <Button asChild>
                <Link href={productHref}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar producto
                </Link>
              </Button>
            )}
          </div>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando productos…</div>}>
            <CatalogProductList
              data={products}
              emptyLabel="No hay productos en esta categoría."
            />
          </Suspense>
        </section>
      ) : null}

      {section === 'vacunas' && parties && products ? (
        <section className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Suspense fallback={null}>
              <CatalogSearch
                initialSearch={buscar}
                placeholder="Buscar vacuna o proveedor..."
              />
            </Suspense>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link href="/compras/partes/nueva?tipo=proveedor&ambito=vacunas">
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar proveedor
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/compras/productos/nuevo?categoria=vacuna&lock=1">
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar vacuna
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Vacunas</h2>
            <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando vacunas…</div>}>
              <CatalogProductList data={products} emptyLabel="No hay vacunas con esa búsqueda." />
            </Suspense>
          </div>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Proveedores de vacunas</h2>
            <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando proveedores…</div>}>
              <PartyList data={parties} emptyLabel="No hay proveedores de vacunas con esa búsqueda." />
            </Suspense>
          </div>
        </section>
      ) : null}

      {section === 'precios' && products ? (
        <section className="space-y-4">
          <Suspense fallback={null}>
            <CatalogSearch initialSearch={buscar} placeholder="Buscar producto para ver su precio de venta..." />
          </Suspense>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando precios…</div>}>
            <SalePriceList data={products} />
          </Suspense>
        </section>
      ) : null}
    </div>
  );
}
