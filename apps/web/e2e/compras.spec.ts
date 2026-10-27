import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const fixturePath = resolve(process.cwd(), '../../.env.compras-qa.json');
const qa = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  url: string; key: string; run: string; organizationId: string; branchId: string;
  users: Array<{ kind: string; email: string; password: string }>;
};
if (new URL(qa.url).hostname !== 'owmcrqvnfubyjxrlyhlc.supabase.co') throw new Error('Only SyncVete-Staging is allowed');
async function client(kind = 'writer') {
  const user = qa.users.find((entry) => entry.kind === kind)!;
  const supabase = createClient(qa.url, qa.key, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(error).toBeNull();
  return supabase;
}
async function login(page: Page, kind = 'writer') {
  const user = qa.users.find((entry) => entry.kind === kind)!;
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /Ingresar|Iniciar sesión/ }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('CRUD through browser: parties, category, USD vaccine, sale catalog and repricing', async ({ page }) => {
  await login(page);
  await page.goto('/compras?seccion=precios');
  await page.getByLabel('Cotización: pesos por 1 USD').fill('1200');
  await page.getByRole('button', { name: 'Guardar cotización' }).click();
  await expect(page.getByText('Cotización guardada y precios actualizados.')).toBeVisible();
  for (const kind of ['proveedor', 'prestador']) {
    await page.goto(`/compras/partes/nueva?tipo=${kind}`);
    await page.getByLabel('Nombre *', { exact: true }).fill(`QA ${kind} ${qa.run}`);
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText(`QA ${kind} ${qa.run}`, { exact: true })).toBeVisible();
    await page.getByText(`QA ${kind} ${qa.run}`, { exact: true }).click();
    await page.getByLabel('Nombre *', { exact: true }).fill(`QA ${kind} editado ${qa.run}`);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Cambios guardados.')).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page).toHaveURL(/seccion=/);
    await expect(page.getByText(`QA ${kind} editado ${qa.run}`, { exact: true })).toHaveCount(0);
  }
  await page.goto('/compras?seccion=categorias');
  await page.getByLabel('Nombre de categoría', { exact: true }).fill(`QA Caninas ${qa.run}`);
  await page.getByLabel('Tipo de producto', { exact: true }).selectOption('vacuna');
  await page.getByRole('button', { name: 'Agregar categoría', exact: true }).click();
  await expect(page.getByText('Categoría guardada.', { exact: true })).toBeVisible();
  await page.goto('/compras/partes/nueva?tipo=proveedor&ambito=vacunas');
  await page.getByLabel('Nombre *', { exact: true }).fill(`QA Vacunas ${qa.run}`);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByRole('link', { name: `QA Vacunas ${qa.run} Sin contacto` })).toBeVisible();
  await page.goto('/compras/productos/nuevo?categoria=vacuna&lock=1');
  await page.getByLabel('Nombre *', { exact: true }).fill(`QA Séxtuple ${qa.run}`);
  await page.getByLabel('Proveedor de vacunas', { exact: true }).selectOption({ label: `QA Vacunas ${qa.run}` });
  await page.getByLabel('Categoría personalizada', { exact: true }).selectOption({ label: `QA Caninas ${qa.run}` });
  await page.getByLabel('Moneda del costo').selectOption('USD');
  await page.getByLabel('Costo', { exact: true }).fill('12.5');
  await page.getByLabel('% de ganancia').fill('40');
  await expect(page.locator('#unitPrice')).toContainText('21.000,00');
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByText(`QA Séxtuple ${qa.run}`, { exact: true })).toBeVisible();
  await page.goto('/compras?seccion=precios');
  await expect(page.getByText('Venta $ 21.000,00', { exact: true })).toBeVisible();
  await page.getByLabel('Cotización: pesos por 1 USD').fill('1300');
  await page.getByRole('button', { name: 'Guardar cotización' }).click();
  await expect(page.getByText('Venta $ 22.750,00', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar producto para ver su precio de venta...' }).fill('no-existe-qa');
  await expect(page.getByText('Todavía no hay precios de venta.', { exact: false })).toBeVisible();
  await page.goto('/compras?seccion=vacunas');
  await page.getByRole('link').filter({ has: page.getByText(`QA Séxtuple ${qa.run}`, { exact: true }) }).click();
  await page.getByLabel('Nombre *', { exact: true }).fill(`QA Séxtuple editada ${qa.run}`);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Producto actualizado.')).toBeVisible();
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('vacuna');
  await expect(page.getByLabel('Moneda del costo')).toHaveValue('USD');
  await expect(page.getByLabel('Nombre *', { exact: true })).toHaveValue(`QA Séxtuple editada ${qa.run}`);
  await page.screenshot({ path: '../../test-results/compras-producto-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page).toHaveURL(/\/compras/);
  await expect(page.getByText(`QA Séxtuple editada ${qa.run}`, { exact: true })).toHaveCount(0);
  await page.goto('/compras?seccion=categorias');
  await page.getByLabel('Nombre de categoría', { exact: true }).nth(1).fill(`QA Categoría editada ${qa.run}`);
  await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
  await expect(page.getByText('Categoría guardada.')).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByLabel('Nombre de categoría', { exact: true })).toHaveCount(1);
});

test('staging Data API rejects cross-tenant access, wrong vaccine supplier and read-only writes', async () => {
  const writer = await client();
  const other = await client('other');
  const reader = await client('reader');
  const { data: party, error } = await writer.from('purchase_parties').insert({ organization_id: qa.organizationId, name: `API ${qa.run}`, kind: 'proveedor', scope: 'general' }).select().single();
  expect(error).toBeNull();
  expect((await other.from('purchase_parties').select('id').eq('id', party.id)).data).toEqual([]);
  expect((await other.from('purchase_parties').update({ name: 'intruso' }).eq('id', party.id).select('id')).data).toEqual([]);
  expect((await reader.from('purchase_parties').insert({ organization_id: qa.organizationId, name: 'Bloqueado', kind: 'proveedor', scope: 'general' })).error).not.toBeNull();
  expect((await writer.from('inventory_products').insert({ organization_id: qa.organizationId, branch_id: qa.branchId, name: 'Vacuna inválida', category: 'vacuna', supplier_party_id: party.id })).error?.message).toContain('proveedor');
});

test('read-only UI hides mutations and mobile navigation remains usable', async ({ page }) => {
  await login(page, 'reader');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/compras?seccion=proveedores');
  await expect(page.getByRole('button', { name: 'Agregar proveedor' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Agregar proveedor' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Secciones de Compras' })).toBeVisible();
  await page.goto('/compras?seccion=precios');
  await expect(page.getByRole('button', { name: 'Guardar cotización' })).toHaveCount(0);
  await page.screenshot({ path: '../../test-results/compras-mobile.png', fullPage: true });
  await page.goto('/compras/productos/nuevo');
  await expect(page).toHaveURL(/\/compras(?:\?|$)/);
});

test('staging receipts keep ARS totals and USD costs consistent, then cancel stock atomically', async () => {
  const supabase = await client();
  expect((await supabase.from('purchase_pricing_settings').upsert({ organization_id: qa.organizationId, usd_ars: 1200 })).error).toBeNull();
  const { data: product, error } = await supabase.from('inventory_products').insert({ organization_id: qa.organizationId, branch_id: qa.branchId, name: `QA Receipt ${qa.run}`, category: 'insumo', cost_currency: 'USD', unit_cost: 10, margin_percent: 50, unit_price: 1 }).select().single();
  expect(error).toBeNull();
  expect(Number(product.unit_price)).toBe(18000);
  const { data: receipt, error: receiptError } = await supabase.rpc('receive_inventory_purchase', { p_payload: { branch_id: qa.branchId, supplier_name: 'QA Receipt', items: [{ product_id: product.id, quantity: 2, unit_cost: 14400 }] } });
  expect(receiptError).toBeNull();
  const { data: updated } = await supabase.from('inventory_products').select('unit_cost, unit_price, quantity, cost_currency').eq('id', product.id).single();
  expect(Number(updated?.unit_cost)).toBe(12);
  expect(Number(updated?.unit_price)).toBe(21600);
  expect(Number(updated?.quantity)).toBe(2);
  expect(updated?.cost_currency).toBe('USD');
  const detail = await supabase.rpc('get_inventory_purchase', { p_purchase_id: receipt.purchase_id });
  expect(detail.error).toBeNull();
  expect(Number(detail.data.total_cost)).toBe(28800);
  expect((await supabase.rpc('cancel_inventory_purchase', { p_purchase_id: receipt.purchase_id })).error).toBeNull();
  expect(Number((await supabase.from('inventory_products').select('quantity').eq('id', product.id).single()).data?.quantity)).toBe(0);
});

test('product editor preserves controlled values after repeated saves', async ({ page }) => {
  const supabase = await client();
  const { data: product, error } = await supabase.from('inventory_products').insert({ organization_id: qa.organizationId, branch_id: qa.branchId, name: `QA Editor ${qa.run}`, category: 'vacuna', cost_currency: 'USD', unit_cost: 5, margin_percent: 20 }).select().single();
  expect(error).toBeNull();
  await login(page);
  await page.goto(`/inventario/${product.id}?from=compras`);
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('vacuna');
  await expect(page.getByLabel('Moneda del costo')).toHaveValue('USD');
  for (const suffix of ['primera', 'segunda']) {
    await page.getByLabel('Nombre *', { exact: true }).fill(`QA Editor ${suffix} ${qa.run}`);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Producto actualizado.')).toBeVisible();
    await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('vacuna');
    await expect(page.getByLabel('Moneda del costo')).toHaveValue('USD');
    await expect(page.getByLabel('Nombre *', { exact: true })).toHaveValue(`QA Editor ${suffix} ${qa.run}`);
  }
});
