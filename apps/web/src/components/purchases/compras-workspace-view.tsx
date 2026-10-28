import { listCatalogProducts, listPurchaseParties } from '@/actions/purchase-catalog';
import { INVENTORY_PRODUCT_CATEGORIES } from '@sincvete/shared';
import { ComprasWorkspace, type ComprasWorkspaceProps } from './compras-workspace';

export async function ComprasWorkspaceView({
  query,
  ...metadata
}: Pick<ComprasWorkspaceProps, 'categories' | 'suppliers' | 'exchangeRate' | 'canWrite'> & {
  query: Record<string, string | undefined>;
}) {
  const page = (name: string) => {
    const value = Number(query[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  };
  const supplierId = (name: string) =>
    metadata.suppliers.some((supplier) => supplier.id === query[name]) ? query[name] : undefined;
  const customCategory = metadata.categories.some(
    (category) => category.id === query.productoCategoria
  )
    ? query.productoCategoria
    : undefined;
  const base = INVENTORY_PRODUCT_CATEGORIES.find(
    (category) => category !== 'vacuna' && `base:${category}` === query.productoCategoria
  );
  const [parties, products, vaccines, prices] = await Promise.all([
    listPurchaseParties({
      page: page('partesPagina'),
      pageSize: 8,
      search: query.partesBuscar,
      scope: 'general',
      kind: query.tipo === 'prestador' || query.tipo === 'proveedor' ? query.tipo : undefined,
    }),
    listCatalogProducts({
      page: page('productosPagina'),
      pageSize: 8,
      search: query.productosBuscar,
      category: base,
      excludeCategory: 'vacuna',
      catalogCategoryId: customCategory,
      supplierId: supplierId('productoProveedor'),
    }),
    listCatalogProducts({
      page: page('vacunasPagina'),
      pageSize: 8,
      search: query.vacunasBuscar,
      category: 'vacuna',
      supplierId: supplierId('vacunaProveedor'),
    }),
    listCatalogProducts({
      page: page('preciosPagina'),
      pageSize: 8,
      search: query.preciosBuscar,
      pricedOnly: true,
    }),
  ]);
  return (
    <ComprasWorkspace
      {...metadata}
      parties={parties}
      products={products}
      vaccines={vaccines}
      prices={prices}
    />
  );
}
